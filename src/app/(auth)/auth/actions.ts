"use server";

import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const COOKIE_OPTS = (maxAgeSec: number) => ({
  maxAge: maxAgeSec,
  expires: new Date(Date.now() + maxAgeSec * 1000),
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export async function createSession(idToken: string) {
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days in ms
  const expiresInSec = expiresIn / 1000;
  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    const cookieStore = await cookies();
    
    cookieStore.set("session", sessionCookie, COOKIE_OPTS(expiresInSec));

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userRef = adminDb.collection("users").doc(decodedToken.uid);
    const policyRef = adminDb.collection("policy").doc("current");
    const [userDoc, policyDoc] = await Promise.all([userRef.get(), policyRef.get()]);
    
    const policy = policyDoc.data();
    const loginDisabled = policy?.loginDisabled === true;
    
    let role = "student";
    
    if (!userDoc.exists) {
      // Idempotent creation if onUserCreate hasn't finished yet
      const email = decodedToken.email || "";
      const localPart = email.split("@")[0].toLowerCase();
      
      if (localPart.includes("-")) {
        const prefix = localPart.split("-")[0];
        // Mirror logic from onUserCreate.ts: m- is student, others are staff
        role = (prefix === "m") ? "student" : "staff";
      } else {
        // No dash defaults to student (consistent with onUserCreate)
        role = "student";
      }

      await userRef.set({
        email: email,
        role: role,
        displayName: decodedToken.name || "",
        photoURL: decodedToken.picture || null,
        matrixNumber: "",
        phoneNumber: "",
        practicum: "",
        profileComplete: false,
        verificationStatus: "unverified",
        verificationRejectedReason: null,
        isBlocked: false,
        blockType: null,
        cooldownUntil: null,
        lateReturnCount: 0,
        emailNotification: false,
        pushNotification: true,
        fcmToken: null,
        // Use serverTimestamp() to match the schema written by onUserCreate.ts.
        // Previously used `new Date()` which creates a subtle timestamp inconsistency.
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
        sessionVersion: 1,
        lastCancelledAt: null,
      });

      // Initialize booking stats
      await userRef.collection("bookingStats").doc("stats").set({
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        lateBookings: 0,
      });
    } else {
      role = userDoc.data()?.role || "student";
      
      const updateData: Record<string, any> = {
        lastLoginAt: FieldValue.serverTimestamp()
      };
      
      // Keep Google profile picture in sync if it changes or is missing
      const currentPhoto = userDoc.data()?.photoURL;
      if (decodedToken.picture && currentPhoto !== decodedToken.picture) {
        updateData.photoURL = decodedToken.picture;
      }
      
      try {
        await userRef.update(updateData);
      } catch (err) {
        console.error("Failed to update user login details:", err);
      }
    }

    if (loginDisabled && role !== "admin") {
      return { 
        success: false, 
        error: "SYSTEM_MAINTENANCE: Login is currently disabled for maintenance. Please try again later." 
      };
    }

    const profileComplete = userDoc.exists
      ? (userDoc.data()?.profileComplete === true)
      : false;
    
    cookieStore.set("userRole", role, COOKIE_OPTS(expiresInSec));
    cookieStore.set("profileComplete", profileComplete ? "true" : "false", COOKIE_OPTS(expiresInSec));

    const sessionVersion = userDoc.exists ? (userDoc.data()?.sessionVersion || 1) : 1;
    cookieStore.set("sessionVersion", sessionVersion.toString(), COOKIE_OPTS(expiresInSec));

    const payload = {
      token: sessionCookie,
      role,
      profileComplete,
    };
    const serialized = Buffer.from(JSON.stringify(payload)).toString("base64");
    cookieStore.set("__session", serialized, COOKIE_OPTS(expiresInSec));

    return { success: true, role };
  } catch (error: unknown) {
    console.error("Session creation error:", error);
    return { 
      success: false, 
      error: process.env.NODE_ENV === "development"
        ? (error instanceof Error ? error.message : String(error))
        : "Failed to create session"
    };
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  cookieStore.delete("session");
  cookieStore.delete("userRole");
  cookieStore.delete("profileComplete");
  cookieStore.delete("sessionVersion");
}

/**
 * Called server-side after the user completes onboarding.
 * Sets the profileComplete cookie so the proxy immediately allows
 * access to all app routes without needing a Firestore re-read.
 */
export async function markProfileComplete() {
  const cookieStore = await cookies();
  const __sessionVal = cookieStore.get("__session")?.value;
  if (!__sessionVal) return { success: false, error: "Unauthorized" };

  let token = "";
  let role = "student";
  try {
    const parsed = JSON.parse(Buffer.from(__sessionVal, "base64").toString("utf-8"));
    token = parsed.token || "";
    role = parsed.role || "student";
  } catch (e) {
    token = __sessionVal;
  }

  if (!token) return { success: false, error: "Unauthorized" };

  try {
    const decodedToken = await adminAuth.verifySessionCookie(token, true);
    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
    
    if (!userDoc.exists || userDoc.data()?.profileComplete !== true) {
      return { success: false, error: "Profile not marked as complete in database." };
    }

    const expiresInSec = 60 * 60 * 24 * 5; // 5 days
    const payload = {
      token,
      role,
      profileComplete: true,
    };
    const serialized = Buffer.from(JSON.stringify(payload)).toString("base64");
    cookieStore.set("__session", serialized, COOKIE_OPTS(expiresInSec));

    // Fallback legacy cookie
    cookieStore.set("profileComplete", "true", COOKIE_OPTS(expiresInSec));
    return { success: true };
  } catch (error) {
    console.error("markProfileComplete error:", error);
    return { success: false, error: "Invalid session" };
  }
}

export async function revokeAllSessions() {
  const cookieStore = await cookies();
  const __sessionVal = cookieStore.get("__session")?.value;
  if (!__sessionVal) return { success: false, error: "Unauthorized" };

  let token = "";
  try {
    const parsed = JSON.parse(Buffer.from(__sessionVal, "base64").toString("utf-8"));
    token = parsed.token || "";
  } catch (e) {
    token = __sessionVal;
  }

  if (!token) return { success: false, error: "Unauthorized" };

  try {
    const decodedToken = await adminAuth.verifySessionCookie(token, true);
    const uid = decodedToken.uid;
    
    // Revoke all refresh tokens
    await adminAuth.revokeRefreshTokens(uid);
    
    // Increment session version for custom verifications
    await adminDb.collection("users").doc(uid).update({
      sessionVersion: FieldValue.increment(1)
    });
    
    // Clear current session
    cookieStore.delete("__session");
    cookieStore.delete("session");
    cookieStore.delete("userRole");
    cookieStore.delete("profileComplete");
    cookieStore.delete("sessionVersion");
    
    return { success: true };
  } catch (error) {
    console.error("revokeAllSessions error:", error);
    return { success: false, error: "Failed to revoke sessions" };
  }
}
