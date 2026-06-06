import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";

export const submitVerificationRequest = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User profile not found");
    }

    const userData = userDoc.data()!;
    const matrixNumber = userData?.matrixNumber?.replace(/\s+/g, '').toUpperCase();

    if (!matrixNumber) {
      throw new HttpsError("invalid-argument", "Matrix number is missing from profile");
    }

    // Match on matrix number only (the stable unique identifier).
    // Name/practicum matching was removed because:
    //   1. Minor spelling differences cause legitimate students to fail.
    //   2. Matrix number uniqueness is already enforced by the isUsed flag.
    const verificationListRef = db.collection("verificationList");
    const querySnapshot = await verificationListRef
      .where("matrixNumber", "==", matrixNumber)
      .get();

    const roleLabel = userData.role === "staff" ? "Staff" : "Student";

    if (querySnapshot.empty) {
      // Not found — set to pending for manual admin review
      await userRef.update({
        profileComplete: true,
        verificationStatus: "pending",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await createNotification(uid, "Verification Pending", "Your details didn't match our records. An admin will review your profile shortly.", "verification");

      // Notify all admins so they don't miss the pending request
      try {
        const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
        await Promise.allSettled(
          adminSnap.docs.map((adminDoc) =>
            createNotification(
              adminDoc.id,
              "New Verification Request",
              `${roleLabel} ${(userData.displayName as string) || uid} (${matrixNumber}) requires manual verification. Please review their profile.`,
              "admin_report",
              uid
            )
          )
        );
      } catch (e) {
        // Non-fatal — student already set to pending
      }

      return { status: "pending" };
    }

    const verificationDoc = querySnapshot.docs[0];
    const verificationData = verificationDoc.data();

    // Verify displayName and practicum/unit also match exactly (case/space-insensitive).
    const userDisplayName = (userData.displayName || "").replace(/\s+/g, ' ').trim().toUpperCase();
    const userPracticum = (userData.practicum || "").replace(/\s+/g, '').trim().toUpperCase();

    const verifyDisplayName = (verificationData.displayName || "").replace(/\s+/g, ' ').trim().toUpperCase();
    const verifyPracticum = (verificationData.practicum || "").replace(/\s+/g, '').trim().toUpperCase();

    const nameMatches = userDisplayName === verifyDisplayName;
    const practicumMatches = userPracticum === verifyPracticum;

    if (!nameMatches || !practicumMatches) {
      // Details mismatch — set to pending for manual admin review
      await userRef.update({
        profileComplete: true,
        verificationStatus: "pending",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await createNotification(uid, "Verification Pending", "Your details didn't match our records. An admin will review your profile shortly.", "verification");

      // Notify all admins so they don't miss the pending request
      try {
        const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
        await Promise.allSettled(
          adminSnap.docs.map((adminDoc) =>
            createNotification(
              adminDoc.id,
              "New Verification Request",
              `${roleLabel} ${(userData.displayName as string) || uid} (${matrixNumber}) details mismatch. Requires manual verification.`,
              "admin_report",
              uid
            )
          )
        );
      } catch (e) {
        // Non-fatal
      }

      return { status: "pending" };
    }

    if (verificationData.isUsed) {
      // Found + isUsed=true — matrix number already claimed by another account
      await userRef.update({
        profileComplete: true,
        verificationStatus: "rejected",
        verificationRejectedReason: "Matrix number already registered to another account. Contact admin if incorrect.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await createNotification(uid, "Verification Rejected", "Matrix number already registered to another account. Contact admin if incorrect.", "verification");
      return { status: "rejected" };
    }

    // Found + isUsed=false — atomically claim the slot
    await db.runTransaction(async (transaction) => {
      // Re-read inside transaction to prevent race condition (two users with same matrix)
      const vDoc = await transaction.get(verificationDoc.ref);
      if (!vDoc.exists || vDoc.data()?.isUsed) {
        throw new Error("Verification entry is already used");
      }

      transaction.update(verificationDoc.ref, {
        isUsed: true,
        claimedBy: uid,
      });

      transaction.update(userRef, {
        profileComplete: true,
        verificationStatus: "verified",
        verificationRejectedReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await createNotification(uid, "Account Verified", "Your account has been successfully verified. Welcome to QBike!", "verification");

    return { status: "verified" };
});
