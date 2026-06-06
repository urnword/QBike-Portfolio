import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createNotification } from "../utils/notifications";
import { enqueueTask, deleteTask } from "../utils/tasks";
import { sendAdminEmail, getSignedPhotoUrl } from "../utils/email";
import { notifyPermanentBlock } from "../utils/permanentBlock";
import { getCachedPolicy } from "../utils/policyCache";
import * as logger from "firebase-functions/logger";
import { haversineDistance } from "../utils/haversine";
import { isValidMalaysiaCoords } from "../utils/geo";

const VALID_ISSUE_TYPES = ["flat_tire", "loose_chain", "broken_brake", "seat_damage", "frame_damage", "other"] as const;
type IssueType = typeof VALID_ISSUE_TYPES[number];

interface ReturnBikeData {
  bikeId: string;
  lat: number;
  lng: number;
  condition: "good" | "flagged";
  returnPhotoPath: string;
  issueType?: IssueType;
  issueDescription?: string;
  issuePhotoPath?: string;
}

// isValidMalaysiaCoords is imported from ../utils/geo

export const returnBike = onCall(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { bikeId, lat, lng, condition, returnPhotoPath, issueType, issueDescription, issuePhotoPath } = data as ReturnBikeData;
  const userId = auth.uid;

  logger.info("returnBike start", { userId, bikeId, condition });

  // --- 1. Validate inputs ---
  if (!bikeId || !/^B\d{3}$/.test(bikeId)) {
    throw new HttpsError("invalid-argument", "Invalid bike ID format. Expected B001–B999.");
  }
  if (condition !== "good" && condition !== "flagged") {
    throw new HttpsError("invalid-argument", "Condition must be 'good' or 'flagged'.");
  }

  // --- 1b. Validate return photo ---
  if (!returnPhotoPath || typeof returnPhotoPath !== "string") {
    throw new HttpsError("invalid-argument", "Return photo is required.");
  }
  const expectedPhotoPrefix = `return-photos/${userId}/`;
  if (!returnPhotoPath.startsWith(expectedPhotoPrefix)) {
    throw new HttpsError("invalid-argument", "Invalid return photo path.");
  }

  // --- 1c. Validate issue fields when flagged ---
  if (condition === "flagged") {
    if (!issueType || !VALID_ISSUE_TYPES.includes(issueType)) {
      throw new HttpsError("invalid-argument", "Issue type is required when reporting a problem.");
    }
    if (issueDescription && typeof issueDescription !== "string") {
      throw new HttpsError("invalid-argument", "Issue description must be a string.");
    }
    if (issuePhotoPath) {
      const expectedIssuePrefix = `issue-photos/${userId}/`;
      if (!issuePhotoPath.startsWith(expectedIssuePrefix)) {
        throw new HttpsError("invalid-argument", "Invalid issue photo path.");
      }
    }
  }

  // --- 1d. Verify return photo exists in Storage ---
  try {
    const bucket = getStorage().bucket();
    const [exists] = await bucket.file(returnPhotoPath).exists();
    if (!exists) {
      throw new HttpsError("not-found", "Return photo not found in storage. Please re-upload.");
    }
    // Verify issue photo if provided
    if (condition === "flagged" && issuePhotoPath) {
      const [issueExists] = await bucket.file(issuePhotoPath).exists();
      if (!issueExists) {
        throw new HttpsError("not-found", "Issue photo not found in storage. Please re-upload.");
      }
    }
  } catch (storageErr) {
    if (storageErr instanceof HttpsError) throw storageErr;
    logger.error("returnBike: Storage verification failed", { storageErr });
    throw new HttpsError("internal", "Failed to verify uploaded photos.");
  }

  const db = getFirestore();

  // --- 2. Read policy (cached — safe here because this read is outside the transaction) ---
  const policy = await getCachedPolicy();
  const gpsEnabled = policy.gpsEnabled as boolean ?? true;
  const stationCoordinates = policy.stationCoordinates as { lat: number; lng: number };
  const gpsRadiusMeters = policy.gpsRadiusMeters as number ?? 100;
  const returnGracePeriod = policy.returnGracePeriod as number ?? 15; // minutes
  const standardCooldownDays = policy.standardCooldownDays as number ?? 1;
  const lateReturnCooldownDays = policy.lateReturnCooldownDays as number ?? 3;

  // --- 3. Server-side GPS validation ---
  if (gpsEnabled) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "GPS coordinates required.");
    }

    // Bounding box sanity check — reject coordinates outside Malaysia.
    if (!isValidMalaysiaCoords(lat, lng)) {
      throw new HttpsError(
        "invalid-argument",
        "GPS_INVALID: Coordinates are outside valid range."
      );
    }

    const distance = haversineDistance(lat, lng, stationCoordinates.lat, stationCoordinates.lng);
    if (distance > gpsRadiusMeters) {
      throw new HttpsError(
        "out-of-range",
        `GPS_OUT_OF_RANGE: You are ${Math.round(distance)}m from the station. Must be within ${gpsRadiusMeters}m.`
      );
    }
  }

  try {
    // Track post-transaction side-effects
    let adminNotifNeeded = false;
    let permanentBlockNeeded = false;
    let finalBookingId = "";
    let isLate = false;
    let lateReturnMinutes = 0;
    let newLateReturnCount = 0;
    let cooldownUntilMs = 0;
    // Captured inside the transaction to avoid a second /users read in the flagged-return path.
    let cachedUserFullName = "";
    let cachedUserMatrixNo = "";

    await db.runTransaction(async (transaction) => {
      // --- 4. Find collected booking for this user ---
      const bookingQuery = db
        .collection("bookings")
        .where("userId", "==", userId)
        .where("status", "in", ["collected", "late"])
        .limit(1);
      const bookingSnap = await transaction.get(bookingQuery);

      if (bookingSnap.empty) {
        throw new HttpsError("not-found", "NO_COLLECTED_BOOKING: No collected bike found for your account.");
      }

      const bookingDoc = bookingSnap.docs[0];
      const booking = bookingDoc.data();
      const bookingRef = bookingDoc.ref;
      finalBookingId = bookingDoc.id;

      // --- 5. Validate bikeId matches booking ---
      if (booking.bikeId !== bikeId) {
        throw new HttpsError(
          "failed-precondition",
          `BIKE_MISMATCH: The scanned bike (${bikeId}) does not match your booking (${booking.bikeId as string}).`
        );
      }

      // --- 6. Extra guard: if already returned, skip (prevents double late-count in race with handleReturnGracePeriod) ---
      if (booking.returnedAt !== null && booking.returnedAt !== undefined) {
        throw new HttpsError("already-exists", "ALREADY_RETURNED: This booking has already been returned.");
      }

      // --- 7. Read user doc for lateReturnCount ---
      const userRef = db.collection("users").doc(userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User record not found.");
      }
      const userDoc = userSnap.data()!;
      const currentLateReturnCount = (userDoc.lateReturnCount as number) ?? 0;

      // Cache denormalized user fields for post-transaction use (avoids second /users read).
      cachedUserFullName = ((userDoc.displayName as string) || "Unknown").replace(/\s+/g, " ").trim();
      cachedUserMatrixNo = ((userDoc.matrixNumber as string) || "Unknown").replace(/\s+/g, "").trim();

      // --- 8. Read bike doc ---
      const bikeRef = db.collection("bikes").doc(bikeId);
      const bikeSnap = await transaction.get(bikeRef);
      if (!bikeSnap.exists) {
        throw new HttpsError("not-found", `Bike ${bikeId} not found.`);
      }

      // --- 9. Read inventory ---
      const inventoryRef = db.collection("inventory").doc("current");
      const inventorySnap = await transaction.get(inventoryRef);
      if (!inventorySnap.exists) {
        throw new HttpsError("internal", "Inventory singleton missing.");
      }

      // --- 10. Compute lateness ---
      const now = Timestamp.now();
      const nowMs = now.toMillis();
      const endTimeMs = typeof booking.endTime.toMillis === "function"
        ? booking.endTime.toMillis()
        : new Date(booking.endTime).getTime();
      const graceEndMs = endTimeMs + returnGracePeriod * 60_000;

      const alreadyLate = booking.isLate === true;
      const newlyLate = !alreadyLate && nowMs > graceEndMs;
      isLate = alreadyLate || newlyLate;

      lateReturnMinutes = isLate
        ? Math.max(0, Math.floor((nowMs - graceEndMs) / 60_000))
        : 0;

      // Use policy-driven threshold (default 3) instead of modular arithmetic
      // so admin resets don't produce unexpected bans.
      const lateReturnThreshold = (policy.lateReturnThreshold as number) ?? 3;
      const cooldownDays = standardCooldownDays + (newlyLate ? lateReturnCooldownDays : 0);
      cooldownUntilMs = nowMs + cooldownDays * 86_400_000;
      newLateReturnCount = currentLateReturnCount + (newlyLate ? 1 : 0);

      // --- 11. Update booking (set returnedAt early to act as lock for race condition) ---
      transaction.update(bookingRef, {
        status: "completed",
        returnedAt: FieldValue.serverTimestamp(),
        isLate,
        lateReturnMinutes: isLate ? lateReturnMinutes : null,
        bikeConditionOnReturn: condition,
        returnPhotoPath,
      });

      // --- 12. Update bike ---
      const bikeUpdate: Record<string, unknown> = {
        status: "available",
        condition: condition === "flagged" ? "user_flagged" : "good",
        currentBookingId: null,
        lastReturnedAt: FieldValue.serverTimestamp(),
        lastUsedBy: userId,
        lastUsedByMatrix: booking.userMatrixNo || null,
        totalTrips: FieldValue.increment(1),
      };
      if (condition === "flagged") {
        bikeUpdate.flaggedAt = FieldValue.serverTimestamp();
        bikeUpdate.flaggedCount = FieldValue.increment(1);
        bikeUpdate.flaggedReason = `User-reported damage on return: ${issueType ?? "unknown"}${issueDescription ? ` — ${issueDescription.trim()}` : ""}`;
      }
      transaction.update(bikeRef, bikeUpdate);

      // --- 13. Update inventory ---
      transaction.update(inventoryRef, {
        inUse: FieldValue.increment(-1),
        available: FieldValue.increment(1),
      });

      // --- 14. Update user ---
      const existingCooldownUntilMs = userDoc.cooldownUntil 
        ? (typeof userDoc.cooldownUntil.toMillis === "function" ? userDoc.cooldownUntil.toMillis() : new Date(userDoc.cooldownUntil).getTime()) 
        : 0;

      const newCooldownUntilMs = Math.max(existingCooldownUntilMs, cooldownUntilMs);

      // Use explicit threshold comparison instead of modulo to avoid edge cases
      // when admin manually resets lateReturnCount.
      if (newlyLate && newLateReturnCount >= lateReturnThreshold && newLateReturnCount % lateReturnThreshold === 0) {
        permanentBlockNeeded = true;
      }

      const userUpdate: Record<string, unknown> = {};
      if (permanentBlockNeeded) {
        userUpdate.isBlocked = true;
        userUpdate.blockType = "system";
      } else {
        userUpdate.cooldownUntil = Timestamp.fromDate(new Date(newCooldownUntilMs));
      }
      
      if (newlyLate) {
        userUpdate.lateReturnCount = FieldValue.increment(1);
      }
      
      transaction.update(userRef, userUpdate);

      // --- 15. Update booking stats ---
      const statsRef = db
        .collection("users")
        .doc(userId)
        .collection("bookingStats")
        .doc("stats");
      const statsUpdate: Record<string, unknown> = {
        completedBookings: FieldValue.increment(1),
      };
      if (isLate) statsUpdate.lateBookings = FieldValue.increment(1);
      transaction.set(statsRef, statsUpdate, { merge: true });

      adminNotifNeeded = condition === "flagged";
    });

    // --- 16. Cancel the return grace Cloud Task (bike returned on time or late but returned) ---
    // This prevents the task from firing and double-counting the late event.
    try {
      await deleteTask("handleReturnGracePeriod", `return-${finalBookingId}`);
      logger.info("returnBike: return grace task deleted", { finalBookingId });
    } catch (taskErr) {
      // Task may have already fired (if returning after grace period) — safe to ignore.
      logger.warn("returnBike: could not delete return grace task (may have already fired)", { finalBookingId, taskErr });
    }

    // --- 17. Enqueue cooldown completion task (only if not permanently banned) ---
    if (!permanentBlockNeeded && isLate) {
      const delaySeconds = Math.max(60, Math.floor((cooldownUntilMs - Date.now()) / 1000));
      try {
        await enqueueTask("handleCooldownComplete", { userId }, { scheduleDelaySeconds: delaySeconds });
      } catch (taskErr) {
        logger.error("returnBike: failed to enqueue cooldown complete task", { userId, taskErr });
      }
    }

    // --- 18. Post-transaction: notifications ---

    // User notification
    const notifBody = isLate
      ? `Bike returned ${lateReturnMinutes} minute(s) late. A cooldown period has been applied to your account.`
      : `Bike ${bikeId} returned successfully. Thank you for using QBike!`;

    const lateEmailHtml = isLate ? `
      <h2>Late Return Recorded</h2>
      <p>Your bike <strong>${bikeId}</strong> was returned <strong>${lateReturnMinutes} minute(s)</strong> late.</p>
      <p>A cooldown period has been applied to your account as per the policy.</p>
    ` : undefined;

    await createNotification(
      userId,
      isLate ? "Late Return Recorded" : "Bike Returned",
      notifBody,
      "booking",
      finalBookingId,
      lateEmailHtml
    );

    // Admin notification if flagged
    if (adminNotifNeeded) {
      const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
      for (const adminDoc of adminSnap.docs) {
        await createNotification(
          adminDoc.id,
          "Bike Flagged for Maintenance",
          `Bike ${bikeId} was flagged on return by user ${userId}. Please inspect it.`,
          "admin_report",
          finalBookingId
        );
      }
    }

    // --- 18b. Write damage_return report to /reports when condition is flagged ---
    if (condition === "flagged" && finalBookingId) {
      try {
        // Use data captured from the transaction — no second /users read needed.
        const HIGH_SEVERITY_ISSUES = ["broken_brake", "frame_damage"];
        const reportSeverity = issueType && HIGH_SEVERITY_ISSUES.includes(issueType) ? "high" : "medium";
        const reportRef = db.collection("reports").doc();
        await reportRef.set({
          reportId: reportRef.id,
          type: "damage_return",
          severity: reportSeverity,
          status: "open",
          payload: {
            bikeId,
            bookingId: finalBookingId,
            issueType: issueType ?? null,
            issueDescription: issueDescription?.trim() ?? null,
            issuePhotoPath: issuePhotoPath ?? null,
            returnPhotoPath,
          },
          linkedBookingId: finalBookingId,
          linkedBikeId: bikeId,
          userId,
          userFullName: cachedUserFullName,
          userMatrixNo: cachedUserMatrixNo,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
          notifiedAt: null,
          notifiedVia: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Link reportId back to the booking document
        await db.collection("bookings").doc(finalBookingId).update({
          linkedReportIds: FieldValue.arrayUnion(reportRef.id),
        });

        // Email admins (fire-and-forget)
        const damageSignedUrl = await getSignedPhotoUrl(issuePhotoPath ?? returnPhotoPath ?? null).catch(() => null);
        const damageSeverity = issueType && ["broken_brake", "frame_damage"].includes(issueType) ? "high" : "medium";
        sendAdminEmail("report_alert", {
          reportId: reportRef.id,
          type: "damage_return",
          severity: damageSeverity,
          userFullName: cachedUserFullName,
          userMatrixNo: cachedUserMatrixNo,
          linkedBikeId: bikeId,
          linkedBookingId: finalBookingId,
          payloadSummary: `Issue: ${issueType ?? "—"}.${issueDescription?.trim() ? ` ${issueDescription.trim()}` : ""}`,
          signedPhotoUrl: damageSignedUrl,
          createdAt: new Date(),
        }).catch((e) => logger.error("returnBike: sendAdminEmail (damage_return) failed", e));

        logger.info("returnBike: damage_return report written and linked", { reportId: reportRef.id, bikeId, bookingId: finalBookingId });
      } catch (reportErr) {
        // Non-fatal — the return transaction already committed successfully.
        logger.error("returnBike: failed to write damage_return report", { userId, bikeId, reportErr });
      }
    }

    // Notifications for permanent block
    if (permanentBlockNeeded) {
      await notifyPermanentBlock({
        userId,
        newLateReturnCount,
        bookingId: finalBookingId || null,
        bikeId,
        triggerSummary: `Late return threshold reached. Total late returns: ${newLateReturnCount}. Account has been permanently blocked.`,
      });
    }

    logger.info("returnBike success", { userId, bikeId, isLate, condition, permanentBlockNeeded });
    return { success: true, isLate, lateReturnMinutes };
  } catch (error: unknown) {
    logger.error("returnBike error", { userId, bikeId, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Transaction failed.");
  }
});
