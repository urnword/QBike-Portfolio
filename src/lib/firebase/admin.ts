import "server-only";
import * as admin from "firebase-admin";

// Server-side initialization only. Ensure 'firebase-admin' is available.
// This file MUST NEVER be imported in client components.

const getAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }
  
  // Use dummy credential for emulators if environment variables are set
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bikebook-dev",
    });
  }

  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    // Format the private key to handle newlines
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }

  // Fallback to Application Default Credentials (e.g., in Firebase App Hosting)
  return admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID,
  });
};

const adminApp = getAdminApp();
const adminAuth = adminApp.auth();
const adminDb = adminApp.firestore();

// Helper: Verify session cookie
export const verifySessionCookie = async (sessionCookie: string) => {
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedClaims;
  } catch (error) {
    return null;
  }
};

// Helper: Get user role from Firestore
export const getUserRole = async (uid: string) => {
  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return null;
    return userDoc.data()?.role as "student" | "staff" | "admin";
  } catch (error) {
    return null;
  }
};

export const logAdminAction = async (
  action: string,
  adminUid: string,
  targetId: string | null,
  details: Record<string, string | number | boolean | null | undefined> = {}
) => {
  try {
    await adminDb.collection("auditLog").add({
      action,
      adminUid,
      targetId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
};

export { adminApp, adminAuth, adminDb };
