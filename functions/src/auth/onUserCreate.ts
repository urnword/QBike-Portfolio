import { beforeUserCreated, HttpsError } from "firebase-functions/v2/identity";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const onUserCreate = beforeUserCreated(async (event) => {
  const db = getFirestore();
  const user = event.data;
  
  if (!user || !user.email) {
    throw new HttpsError("invalid-argument", "Missing user or email data.");
  }
  
  const email = user.email;

  const policySnap = await db.collection("policy").doc("current").get();
  if (policySnap.exists && policySnap.data()?.loginDisabled === true) {
    console.warn(`Blocking user creation due to loginDisabled: ${email}`);
    throw new HttpsError("permission-denied", "Login is currently disabled.");
  }

  if (!email || !email.endsWith("@moe-dl.edu.my")) {
    console.warn(`Blocking user with unauthorized email: ${email}`);
    throw new HttpsError("invalid-argument", "Unauthorized email domain.");
  }

  // Automated role assignment based on email prefix
  const localPart = email.split("@")[0].toLowerCase();
  let role: "student" | "staff" | "admin" = "student";

  if (localPart.includes("-")) {
    const prefix = localPart.split("-")[0];
    // m- prefix is student, g-, bm-, etc. are staff
    role = (prefix === "m") ? "student" : "staff";
  } else {
    // No dash (e.g., admin@moe-dl.edu.my) defaults to student
    role = "student";
  }

  const userDoc = {
    email: email,
    role: role,
    displayName: user.displayName || "",
    photoURL: user.photoURL || null,
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
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    sessionVersion: 1,
    lastCancelledAt: null,
  };

  try {
    await db.collection("users").doc(user.uid).set(userDoc);
    
    // Initialize booking stats
    await db.collection("users").doc(user.uid).collection("bookingStats").doc("stats").set({
      totalBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      lateBookings: 0,
    });

    console.log(`Successfully created profile for user: ${user.uid}`);
  } catch (err) {
    console.error(`Error creating profile for user: ${user.uid}`, err);
  }
});
