import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, collection, DocumentData, QueryDocumentSnapshot, FirestoreDataConverter } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getMessaging, isSupported } from "firebase/messaging";

// Client-side initialization only. Do NOT import in Server Actions or Middleware.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "asia-southeast1");

// Connect to emulators only when explicitly enabled via env var.
// Do NOT auto-detect by LAN IP — that risks connecting any device on the same
// network to dev emulators instead of production Firebase.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
  const hostname = window.location.hostname;
  connectAuthEmulator(auth, `http://${hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, hostname, 8080);
  connectStorageEmulator(storage, hostname, 9199);
  connectFunctionsEmulator(functions, hostname, 5001);
  console.log(`[Firebase] Connected to emulators at ${hostname}`);
}

// Generic type converter helper
export const createConverter = <T extends DocumentData>(): FirestoreDataConverter<T> => ({
  toFirestore: (data: T) => data,
  fromFirestore: (snap: QueryDocumentSnapshot) => snap.data() as T,
});

// Typed document snapshot helper
export const getTypedDoc = <T extends DocumentData>(snap: QueryDocumentSnapshot) => snap.data() as T;

// Typed Collections Helper
// Example usage: const usersRef = createCollection<UserDocument>("users");
export const createCollection = <T extends DocumentData>(path: string) => {
  return collection(db, path).withConverter(createConverter<T>());
};

export const messaging = async () => {
  if (typeof window !== "undefined" && await isSupported()) {
    return getMessaging(app);
  }
  return null;
};

export { app, auth, db, storage, functions };
