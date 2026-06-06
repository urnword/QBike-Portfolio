"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { UserDocument } from '@/types';
import { syncSessionCookies } from '@/actions/session';

interface AuthContextType {
  user: UserDocument | null;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUser({
              uid: firebaseUser.uid,
              ...data,
            } as UserDocument);

            // Synchronize role and profileComplete as httpOnly server-side cookies.
            // Previously used document.cookie (non-httpOnly), which allowed any JS
            // to read/forge the userRole cookie and access the admin UI layout.
            // syncSessionCookies() validates the session token before writing.
            syncSessionCookies(
              data.role ?? 'student',
              data.profileComplete === true,
            ).catch((err) => console.error('syncSessionCookies failed:', err));
          } else {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              profileComplete: false,
              verificationStatus: 'unverified',
            } as UserDocument);
            syncSessionCookies('student', false).catch((err) =>
              console.error('syncSessionCookies failed:', err),
            );
          }
          setLoading(false);
        }, (err) => {
          console.error("Auth provider snapshot error:", err);
          setLoading(false);
        });
      } else {
        if (unsubscribeDoc) {
          unsubscribeDoc();
          unsubscribeDoc = null;
        }
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
