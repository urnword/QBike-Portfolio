import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { sendAdminEmail, getSignedPhotoUrl } from "../utils/email";
import * as logger from "firebase-functions/logger";

const VALID_ISSUE_TYPES = [
  "flat_tire", "loose_chain", "broken_brake", "seat_damage", "frame_damage", "other",
] as const;
type BikeIssueType = typeof VALID_ISSUE_TYPES[number];

interface ReportMidRideDamageData {
  issueType: string;
  issueDescription?: string;
  issuePhotoPath?: string;
  wantsSwap: boolean;
  newBikeId?: string;
}

export const reportMidRideDamage = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const d = data as ReportMidRideDamageData;
  const userId = auth.uid;

  logger.info("reportMidRideDamage start", { userId, issueType: d.issueType, wantsSwap: d.wantsSwap, newBikeId: d.newBikeId });

  // --- 1. Validate inputs ---
  if (!d.issueType || !VALID_ISSUE_TYPES.includes(d.issueType as BikeIssueType)) {
    throw new HttpsError("invalid-argument", `issueType must be one of: ${VALID_ISSUE_TYPES.join(", ")}.`);
  }
  if (d.issueType === "other" && (!d.issueDescription || !d.issueDescription.trim())) {
    throw new HttpsError("invalid-argument", "issueDescription is required when issueType is 'other'.");
  }
  if (typeof d.wantsSwap !== "boolean") {
    throw new HttpsError("invalid-argument", "wantsSwap must be a boolean.");
  }
  if (d.wantsSwap && (!d.newBikeId || !/^B\d{3}$/.test(d.newBikeId))) {
    throw new HttpsError("invalid-argument", "A valid new Bike ID (e.g. B002) is required when swapping.");
  }

  const db = getFirestore();

  // --- 2. Load user (denormalization + verification check) ---
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "User record not found.");
  }
  const user = userSnap.data() as Record<string, unknown>;
  if (user.verificationStatus !== "verified") {
    throw new HttpsError("failed-precondition", "Only verified users can submit reports.");
  }
  const userFullName = ((user.displayName as string) || "Unknown").replace(/\s+/g, " ").trim();
  const userMatrixNo = ((user.matrixNumber as string) || "Unknown").replace(/\s+/g, "").trim();

  try {
    // --- 3. Find the user's active collected/late booking ---
    const bookingQuery = db.collection("bookings")
      .where("userId", "==", userId)
      .where("status", "in", ["collected", "late"])
      .limit(1);
    const bookingSnap = await bookingQuery.get();

    if (bookingSnap.empty) {
      throw new HttpsError(
        "not-found",
        "NO_COLLECTED_BOOKING: No active collected booking found. You must have a bike in hand to report mid-ride damage.",
      );
    }

    const bookingDoc = bookingSnap.docs[0];
    const booking = bookingDoc.data();
    const bookingId = bookingDoc.id;
    const oldBikeId = booking.bikeId as string;

    if (!oldBikeId || !/^B\d{3}$/.test(oldBikeId)) {
      throw new HttpsError("failed-precondition", "Booking does not have a valid bike assigned.");
    }

    if (d.wantsSwap && d.newBikeId === oldBikeId) {
      throw new HttpsError("invalid-argument", "You cannot swap a bike for itself.");
    }

    // --- 4. Firestore transaction ---
    const { swapResult, resolvedNewBikeId } = await db.runTransaction(async (transaction) => {
      const oldBikeRef = db.collection("bikes").doc(oldBikeId);
      const oldBikeSnap = await transaction.get(oldBikeRef);
      if (!oldBikeSnap.exists) {
        throw new HttpsError("not-found", `Bike ${oldBikeId} not found.`);
      }

      const flagUpdate = {
        condition: "user_flagged",
        flaggedReason: `Mid-ride damage reported by ${userMatrixNo}: ${d.issueType}${d.issueDescription ? ` — ${d.issueDescription.trim()}` : ""}`,
        flaggedAt: FieldValue.serverTimestamp(),
        flaggedCount: FieldValue.increment(1),
      };

      if (d.wantsSwap && d.newBikeId) {
        const targetBikeId = d.newBikeId;
        const newBikeRef = db.collection("bikes").doc(targetBikeId);
        const newBikeSnap = await transaction.get(newBikeRef);

        if (!newBikeSnap.exists) {
          throw new HttpsError("not-found", `BIKE_NOT_FOUND: Bike ${targetBikeId} does not exist.`);
        }

        const newBikeData = newBikeSnap.data();
        const isAvailable = newBikeData?.status === "available";
        const isValidCondition = ["good", "user_flagged"].includes(newBikeData?.condition || "");

        if (!isAvailable || !isValidCondition) {
          throw new HttpsError(
            "failed-precondition",
            `BIKE_NOT_AVAILABLE: Bike ${targetBikeId} is currently unavailable for swap. Please select an available bike.`,
          );
        }

        // Swap is valid:
        // Old bike: free from booking, mark user_flagged, return to available pool
        transaction.update(oldBikeRef, {
          ...flagUpdate,
          status: "available",
          currentBookingId: null,
        });

        // New bike: assign to this booking
        transaction.update(newBikeRef, {
          status: "in_use",
          currentBookingId: bookingId,
          lastUsedBy: userId,
          lastUsedByMatrix: userMatrixNo,
        });

        // Booking: point to new bike, push old to bikeHistory
        transaction.update(bookingDoc.ref, {
          bikeId: targetBikeId,
          bikeHistory: FieldValue.arrayUnion(oldBikeId),
        });

        return { swapResult: "swapped" as const, resolvedNewBikeId: targetBikeId };

      } else {
        // --- No swap path — flag bike, student keeps riding ---
        transaction.update(oldBikeRef, flagUpdate);
        return { swapResult: "no_swap_requested" as const, resolvedNewBikeId: null };
      }
    });

    // --- 5. Write report to /reports (post-transaction) ---
    const reportRef = db.collection("reports").doc();
    const reportId = reportRef.id;

    const isCriticalIssue = ["broken_brake", "frame_damage"].includes(d.issueType);

    await reportRef.set({
      reportId,
      type: "damage_midride",
      severity: isCriticalIssue ? "high" : "medium",
      status: "open",
      payload: {
        bikeId: oldBikeId,
        bookingId,
        issueType: d.issueType,
        issueDescription: d.issueDescription?.trim() || null,
        issuePhotoPath: d.issuePhotoPath || null,
        locationLat: null,
        locationLng: null,
        wantsSwap: d.wantsSwap,
        swappedToBikeId: resolvedNewBikeId,
      },
      linkedBookingId: bookingId,
      linkedBikeId: oldBikeId,
      userId,
      userFullName,
      userMatrixNo,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      notifiedAt: null,
      notifiedVia: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // --- 6. Link reportId back to booking ---
    try {
      await db.collection("bookings").doc(bookingId).update({
        linkedReportIds: FieldValue.arrayUnion(reportId),
      });
    } catch (linkErr) {
      logger.warn("reportMidRideDamage: failed to link reportId to booking", { bookingId, reportId, linkErr });
    }

    // --- 7. Notify admins ---
    // Push notification to all admins
    try {
      const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
      for (const adminDoc of adminSnap.docs) {
        await createNotification(
          adminDoc.id,
          "Mid-Ride Damage Report",
          `${userFullName} (${userMatrixNo}) reported damage on ${oldBikeId}: ${d.issueType}. Swap: ${swapResult}.${resolvedNewBikeId ? ` Now on ${resolvedNewBikeId}.` : ""}`,
          "admin_report",
          reportId,
        );
      }
    } catch (notifErr) {
      logger.error("reportMidRideDamage: failed to notify admins", { reportId, notifErr });
    }

    // Email admins (fire-and-forget)
    const isCritical = ["broken_brake", "frame_damage"].includes(d.issueType);
    const emailSeverity = isCritical ? "high" : "medium";
    const signedPhotoUrl = await getSignedPhotoUrl(d.issuePhotoPath ?? null).catch(() => null);
    sendAdminEmail("report_alert", {
      reportId,
      type: "damage_midride",
      severity: emailSeverity,
      userFullName,
      userMatrixNo,
      linkedBikeId: oldBikeId,
      linkedBookingId: bookingId,
      payloadSummary: `Issue: ${d.issueType}.${d.issueDescription?.trim() ? ` ${d.issueDescription.trim()}` : ""} Swap: ${swapResult}.${resolvedNewBikeId ? ` Now on ${resolvedNewBikeId}.` : ""}`,
      signedPhotoUrl,
      createdAt: new Date(),
    }).catch((e) => logger.error("reportMidRideDamage: sendAdminEmail failed", e));

    // --- 8. Notify student ---
    try {
      const studentMessage =
        swapResult === "swapped"
          ? `Damage on ${oldBikeId} reported. You've been swapped to ${resolvedNewBikeId!}. Continue your ride!`
          : `Damage on ${oldBikeId} reported. Thank you for letting us know.`;

      await createNotification(userId, "Mid-Ride Damage Report Submitted", studentMessage, "booking", bookingId);
    } catch (notifErr) {
      logger.warn("reportMidRideDamage: failed to notify student", { userId, notifErr });
    }

    logger.info("reportMidRideDamage success", { reportId, swapResult, resolvedNewBikeId, userId });
    return { success: true, reportId, swapResult, newBikeId: resolvedNewBikeId };

  } catch (error: unknown) {
    logger.error("reportMidRideDamage error", { userId, issueType: d.issueType, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "An unexpected error occurred.");
  }
});
