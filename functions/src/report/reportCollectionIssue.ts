import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { enqueueTask, deleteTask } from "../utils/tasks";
import { sendAdminEmail, getSignedPhotoUrl } from "../utils/email";
import { getCachedPolicy } from "../utils/policyCache";
import * as logger from "firebase-functions/logger";
import { haversineDistance } from "../utils/haversine";
import { isValidMalaysiaCoords } from "../utils/geo";

const COLLECTION_ISSUE_TYPES = ["no_bike_available", "bike_damaged", "qr_damaged", "other"] as const;
type CollectionIssueType = typeof COLLECTION_ISSUE_TYPES[number];

const VALID_RESCHEDULE_MINUTES = [5, 10, 15] as const;

// isValidMalaysiaCoords is imported from ../utils/geo

interface ReportCollectionIssueData {
  issueType: string;
  lat: number;
  lng: number;
  // no_bike_available
  rescheduleMinutes?: number;  // 5, 10, or 15 — omit to cancel without penalty
  // bike_damaged / qr_damaged
  bikeId?: string;
  issueDescription?: string;
  damageType?: string; // flat_tire, loose_chain, etc.
  issuePhotoPath?: string;
}

export const reportCollectionIssue = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const d = data as ReportCollectionIssueData;
  const userId = auth.uid;

  logger.info("reportCollectionIssue start", { userId, issueType: d.issueType });

  // --- 1. Validate issue type ---
  if (!d.issueType || !COLLECTION_ISSUE_TYPES.includes(d.issueType as CollectionIssueType)) {
    throw new HttpsError("invalid-argument", `issueType must be one of: ${COLLECTION_ISSUE_TYPES.join(", ")}.`);
  }

  // --- 2. Validate bike ID format when provided ---
  if (d.bikeId && !/^B\d{3}$/.test(d.bikeId)) {
    throw new HttpsError("invalid-argument", "Invalid bike ID format. Expected B001–B999.");
  }

  // qr_damaged requires bikeId
  if (d.issueType === "qr_damaged" && !d.bikeId) {
    throw new HttpsError("invalid-argument", "qr_damaged: bikeId is required (which bike has the damaged QR).");
  }

  // other requires description
  if (d.issueType === "other" && (!d.issueDescription || !d.issueDescription.trim())) {
    throw new HttpsError("invalid-argument", "Description is required when issue type is 'other'.");
  }

  const db = getFirestore();

  // --- 3. Read policy for GPS + grace period (cached — safe outside transaction) ---
  const policy = await getCachedPolicy();
  const gpsEnabled = policy.gpsEnabled as boolean ?? true;
  const stationCoordinates = policy.stationCoordinates as { lat: number; lng: number };
  const gpsRadiusMeters = policy.gpsRadiusMeters as number ?? 100;
  const pickupGracePeriod = policy.pickupGracePeriod as number ?? 15;
  const returnGracePeriod = policy.returnGracePeriod as number ?? 15;

  // --- 4. Server-side GPS validation ---
  if (gpsEnabled) {
    if (typeof d.lat !== "number" || typeof d.lng !== "number") {
      throw new HttpsError("invalid-argument", "GPS coordinates required.");
    }
    if (!isValidMalaysiaCoords(d.lat, d.lng)) {
      throw new HttpsError("invalid-argument", "GPS_INVALID: Coordinates are outside valid range.");
    }
    const distance = haversineDistance(d.lat, d.lng, stationCoordinates.lat, stationCoordinates.lng);
    if (distance > gpsRadiusMeters) {
      throw new HttpsError(
        "out-of-range",
        `GPS_OUT_OF_RANGE: You are ${Math.round(distance)}m from the station. Must be within ${gpsRadiusMeters}m.`,
      );
    }
  }

  // --- 5. Load user record ---
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
    let action: "rescheduled" | "cancelled" | "reported" | "collected" = "reported";
    let reportId = "";
    let finalBookingId = "";

    // ── Branch: no_bike_available ────────────────────────────────────────────
    if (d.issueType === "no_bike_available") {
      const wantsReschedule = typeof d.rescheduleMinutes === "number" &&
        VALID_RESCHEDULE_MINUTES.includes(d.rescheduleMinutes as typeof VALID_RESCHEDULE_MINUTES[number]);
      const wantsCancel = d.rescheduleMinutes === undefined || d.rescheduleMinutes === null || d.rescheduleMinutes === 0;

      if (!wantsReschedule && !wantsCancel) {
        throw new HttpsError("invalid-argument", "rescheduleMinutes must be 5, 10, or 15 — or omit to cancel.");
      }

      // Run in transaction — find active booking, reschedule or cancel
      const result = await db.runTransaction(async (transaction) => {
        const bookingQuery = db.collection("bookings")
          .where("userId", "==", userId)
          .where("status", "==", "active")
          .limit(1);
        const bookingSnap = await transaction.get(bookingQuery);

        if (bookingSnap.empty) {
          throw new HttpsError("not-found", "NO_ACTIVE_BOOKING: No active booking found for your account.");
        }

        const bookingDoc = bookingSnap.docs[0];
        const booking = bookingDoc.data();
        const bookingRef = bookingDoc.ref;
        const bookingId = bookingDoc.id;

        if (wantsReschedule) {
          // Check reschedule limit
          const currentRescheduleCount = (booking.rescheduleCount as number) ?? 0;
          if (currentRescheduleCount >= 1) {
            throw new HttpsError("failed-precondition", "RESCHEDULE_LIMIT: You can only reschedule once per booking.");
          }

          // Shift startTime and endTime forward
          const shiftMs = d.rescheduleMinutes! * 60_000;
          const currentStartMs = typeof booking.startTime.toMillis === "function"
            ? booking.startTime.toMillis()
            : new Date(booking.startTime).getTime();
          const currentEndMs = typeof booking.endTime.toMillis === "function"
            ? booking.endTime.toMillis()
            : new Date(booking.endTime).getTime();

          const newStart = Timestamp.fromDate(new Date(currentStartMs + shiftMs));
          const newEnd = Timestamp.fromDate(new Date(currentEndMs + shiftMs));

          transaction.update(bookingRef, {
            startTime: newStart,
            endTime: newEnd,
            rescheduleCount: FieldValue.increment(1),
          });

          return { bookingId, action: "rescheduled" as const, newStartMs: currentStartMs + shiftMs, newEndMs: currentEndMs + shiftMs };
        } else {
          // Cancel without penalty
          const inventoryRef = db.collection("inventory").doc("current");

          transaction.update(bookingRef, {
            status: "cancelled",
            cancelledBy: "system",
            cancelledAt: FieldValue.serverTimestamp(),
          });

          // Restore inventory (active booking = available--, inUse++ on creation)
          transaction.update(inventoryRef, {
            available: FieldValue.increment(1),
            inUse: FieldValue.increment(-1),
          });

          // Update booking stats
          const statsRef = db.collection("users").doc(userId).collection("bookingStats").doc("stats");
          transaction.set(statsRef, { cancelledBookings: FieldValue.increment(1) }, { merge: true });

          // Intentionally NOT setting lastCancelledAt — no cancel cooldown penalty
          return { bookingId, action: "cancelled" as const, newStartMs: 0, newEndMs: 0 };
        }
      });

      finalBookingId = result.bookingId;
      action = result.action;

      // Post-transaction: manage Cloud Tasks
      if (result.action === "rescheduled") {
        // Delete old pickup grace task and enqueue a new one with shifted time
        try {
          await deleteTask("handlePickupGracePeriod", `pickup-${result.bookingId}`);
        } catch (taskErr) {
          logger.warn("reportCollectionIssue: could not delete old pickup task", { bookingId: result.bookingId, taskErr });
        }
        try {
          const newGraceDeadlineMs = result.newStartMs + pickupGracePeriod * 60_000;
          const delaySeconds = Math.max(30, Math.floor((newGraceDeadlineMs - Date.now()) / 1000));
          await enqueueTask("handlePickupGracePeriod", { bookingId: result.bookingId }, {
            scheduleDelaySeconds: delaySeconds,
            id: `pickup-${result.bookingId}`,
          });
        } catch (taskErr) {
          logger.error("reportCollectionIssue: failed to enqueue new pickup task", { bookingId: result.bookingId, taskErr });
        }

        await createNotification(
          userId,
          "Booking Rescheduled",
          `Your booking has been rescheduled by ${d.rescheduleMinutes} minutes. Please collect your bike within the new pickup window.`,
          "booking",
          result.bookingId,
        );
      } else {
        // Cancelled — delete pickup task
        try {
          await deleteTask("handlePickupGracePeriod", `pickup-${result.bookingId}`);
        } catch (taskErr) {
          logger.warn("reportCollectionIssue: could not delete pickup task for cancelled booking", { bookingId: result.bookingId, taskErr });
        }

        await createNotification(
          userId,
          "Booking Cancelled — No Bikes Available",
          "Your booking has been cancelled without penalty because no bikes were available at the station.",
          "booking",
          result.bookingId,
        );
      }

    // ── Branch: qr_damaged — manual collection ─────────────────────────────
    } else if (d.issueType === "qr_damaged") {
      // This acts as a manual bike collection. Perform all the same checks
      // as collectBike — availability, not maintenance, etc.
      const result = await db.runTransaction(async (transaction) => {
        // Find active booking
        const bookingQuery = db.collection("bookings")
          .where("userId", "==", userId)
          .where("status", "==", "active")
          .limit(1);
        const bookingSnap = await transaction.get(bookingQuery);

        if (bookingSnap.empty) {
          throw new HttpsError("not-found", "NO_ACTIVE_BOOKING: No active booking found for your account.");
        }

        const bookingDoc = bookingSnap.docs[0];
        const booking = bookingDoc.data();
        const bookingRef = bookingDoc.ref;
        const bookingId = bookingDoc.id;

        // Verify pickup grace period
        const nowMs = Date.now();
        const startTimeMs = typeof booking.startTime.toMillis === "function"
          ? booking.startTime.toMillis()
          : new Date(booking.startTime).getTime();
        const gracePeriodEnd = startTimeMs + pickupGracePeriod * 60_000;

        if (nowMs > gracePeriodEnd) {
          throw new HttpsError(
            "deadline-exceeded",
            "GRACE_PERIOD_EXPIRED: The pickup grace period has expired.",
          );
        }

        // Check bike availability
        const bikeRef = db.collection("bikes").doc(d.bikeId!);
        const bikeSnap = await transaction.get(bikeRef);

        if (!bikeSnap.exists) {
          throw new HttpsError("not-found", `Bike ${d.bikeId} not found.`);
        }

        const bikeData = bikeSnap.data()!;
        if (bikeData.status !== "available") {
          throw new HttpsError("failed-precondition", `BIKE_NOT_AVAILABLE: Bike ${d.bikeId} is not available (status: ${bikeData.status as string}).`);
        }
        if (bikeData.condition === "flagged") {
          throw new HttpsError("failed-precondition", `BIKE_IN_MAINTENANCE: Bike ${d.bikeId} has been flagged for maintenance by admin.`);
        }

        // Perform collection — same as collectBike
        transaction.update(bookingRef, {
          bikeId: d.bikeId,
          status: "collected",
          collectedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(bikeRef, {
          status: "in_use",
          lastUsedBy: userId,
          lastUsedByMatrix: booking.userMatrixNo || null,
          currentBookingId: bookingId,
        });

        return {
          bookingId,
          endTime: booking.endTime as Timestamp,
        };
      });

      finalBookingId = result.bookingId;
      action = "collected";

      // Delete the existing pickup grace task — the bike has been collected so it
      // should no longer fire. If already fired/deleted, deleteTask will no-op.
      try {
        await deleteTask("handlePickupGracePeriod", `pickup-${result.bookingId}`);
      } catch (taskErr) {
        logger.warn("reportCollectionIssue: could not delete pickup grace task (qr_damaged)", { bookingId: result.bookingId, taskErr });
      }

      // Enqueue return grace task — same as collectBike
      try {
        const delaySeconds = Math.max(
          30,
          Math.floor((result.endTime.toMillis() - Date.now()) / 1000) + returnGracePeriod * 60,
        );
        await enqueueTask("handleReturnGracePeriod", { bookingId: result.bookingId }, {
          scheduleDelaySeconds: delaySeconds,
          id: `return-${result.bookingId}`,
        });
      } catch (taskErr) {
        logger.error("reportCollectionIssue: failed to enqueue return grace task", { bookingId: result.bookingId, taskErr });
      }

      await createNotification(
        userId,
        "Bike Collected (Manual)",
        `Bike ${d.bikeId!} collected via QR damaged report. Please return on time.`,
        "booking",
        result.bookingId,
      );

    // ── Branch: bike_damaged ────────────────────────────────────────────────
    } else if (d.issueType === "bike_damaged") {
      // Find active booking to link the report
      const bookingQuery = db.collection("bookings")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .limit(1);
      const bookingSnap = await bookingQuery.get();

      if (bookingSnap.empty) {
        throw new HttpsError("not-found", "NO_ACTIVE_BOOKING: No active booking found for your account.");
      }

      finalBookingId = bookingSnap.docs[0].id;
      action = "reported";

      // If bikeId provided, set condition to user_flagged (not maintenance — stays available)
      if (d.bikeId) {
        const bikeRef = db.collection("bikes").doc(d.bikeId);
        const bikeSnap = await bikeRef.get();
        if (bikeSnap.exists) {
          const bikeData = bikeSnap.data()!;
          // Only flag if currently in good condition — don't downgrade admin-flagged
          if (bikeData.condition === "good") {
            await bikeRef.update({
              condition: "user_flagged",
              flaggedAt: FieldValue.serverTimestamp(),
              flaggedCount: FieldValue.increment(1),
              flaggedReason: `User-reported damage by ${userId}: ${d.issueDescription?.trim() || "No description"}`,
            });
          }
        }
      }

    // ── Branch: other ───────────────────────────────────────────────────────
    } else {
      // Find active booking
      const bookingQuery = db.collection("bookings")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .limit(1);
      const bookingSnap = await bookingQuery.get();

      if (bookingSnap.empty) {
        throw new HttpsError("not-found", "NO_ACTIVE_BOOKING: No active booking found for your account.");
      }

      finalBookingId = bookingSnap.docs[0].id;
      action = "reported";
    }

    // --- 6. Write report to /reports ---
    const reportRef = db.collection("reports").doc();
    reportId = reportRef.id;

    const severity = d.issueType === "no_bike_available" ? "high" : "medium";

    await reportRef.set({
      reportId,
      type: "collection_issue",
      severity,
      status: "open",
      payload: {
        bikeId: d.bikeId || null,
        bookingId: finalBookingId,
        issueType: d.issueType,
        damageType: d.damageType || null,
        issueDescription: d.issueDescription?.trim() || null,
        issuePhotoPath: d.issuePhotoPath || null,
        rescheduleMinutes: d.rescheduleMinutes ?? null,
        action,
      },
      linkedBookingId: finalBookingId,
      linkedBikeId: d.bikeId || null,
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

    // --- 7. Link report to booking ---
    if (finalBookingId) {
      try {
        await db.collection("bookings").doc(finalBookingId).update({
          linkedReportIds: FieldValue.arrayUnion(reportId),
        });
      } catch (linkErr) {
        // Non-fatal — booking may have just been cancelled
        logger.warn("reportCollectionIssue: failed to link reportId to booking", { finalBookingId, reportId, linkErr });
      }
    }

    // --- 8. Notify admins for no_bike_available / bike_damaged ---
    try {
      const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
      for (const adminDoc of adminSnap.docs) {
        let msg = "";
        if (d.issueType === "no_bike_available") {
          msg = `Student ${userFullName} (${userMatrixNo}) reported no bikes available. Action: ${action}.`;
        } else if (d.issueType === "bike_damaged") {
          msg = `Student ${userFullName} (${userMatrixNo}) reported bike ${d.bikeId || "unknown"} is damaged (${d.damageType || "other"}).`;
        } else {
          msg = `Student ${userFullName} (${userMatrixNo}) reported collection issue: ${d.issueType}.`;
        }
        await createNotification(
          adminDoc.id,
          `Collection Issue: ${d.issueType.replace(/_/g, " ")}`,
          msg,
          "admin_report",
          reportId,
        );
      }
    } catch (notifErr) {
      logger.error("reportCollectionIssue: failed to notify admins via push", { reportId, notifErr });
    }

    // Email admins (fire-and-forget)
    const signedPhotoUrl = await getSignedPhotoUrl(d.issuePhotoPath ?? null).catch(() => null);
    sendAdminEmail("report_alert", {
      reportId,
      type: "collection_issue",
      severity,
      userFullName,
      userMatrixNo,
      linkedBikeId: d.bikeId || null,
      linkedBookingId: finalBookingId,
      payloadSummary: `Collection Issue: ${d.issueType.replace(/_/g, " ")}.${d.damageType ? ` Damage Specifics: ${d.damageType}.` : ""}${d.issueDescription?.trim() ? ` Description: ${d.issueDescription.trim()}` : ""}`,
      signedPhotoUrl,
      createdAt: new Date(),
    }).catch((e) => logger.error("reportCollectionIssue: sendAdminEmail failed", e));

    logger.info("reportCollectionIssue success", { reportId, issueType: d.issueType, action, userId });
    return { success: true, reportId, action };

  } catch (error: unknown) {
    logger.error("reportCollectionIssue error", { userId, issueType: d.issueType, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "An unexpected error occurred.");
  }
});
