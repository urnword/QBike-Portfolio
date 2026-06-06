import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { enqueueTask } from "../utils/tasks";
import { getCachedPolicy } from "../utils/policyCache";
import * as logger from "firebase-functions/logger";
import { haversineDistance } from "../utils/haversine";
import { isValidMalaysiaCoords } from "../utils/geo";

interface CollectBikeData {
  bikeId: string;
  lat: number;
  lng: number;
}

export const collectBike = onCall(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { bikeId, lat, lng } = data as CollectBikeData;
  const userId = auth.uid;

  logger.info("collectBike start", { userId, bikeId });

  // --- 1. Validate bikeId format ---
  if (!bikeId || !/^B\d{3}$/.test(bikeId)) {
    throw new HttpsError("invalid-argument", "Invalid bike ID format. Expected B001–B999.");
  }

  const db = getFirestore();

  // --- 2. Read policy (cached — safe here because this read is outside the transaction) ---
  const policy = await getCachedPolicy();
  const gpsEnabled = policy.gpsEnabled as boolean ?? true;
  const stationCoordinates = policy.stationCoordinates as { lat: number; lng: number };
  const gpsRadiusMeters = policy.gpsRadiusMeters as number ?? 100;
  const pickupGracePeriod = policy.pickupGracePeriod as number ?? 15; // minutes
  const returnGracePeriod = policy.returnGracePeriod as number ?? 15; // minutes

  // --- 3. Server-side GPS validation ---
  if (gpsEnabled) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "GPS coordinates required.");
    }

    // Bounding box sanity check — reject coordinates not within Malaysia.
    // Prevents clients from submitting arbitrary/spoofed coordinates.
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
    const result = await db.runTransaction(async (transaction) => {
      // --- 4. Find active booking for this user ---
      const bookingsRef = db.collection("bookings");
      const bookingQuery = bookingsRef
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

      // --- 5. Verify pickup grace period ---
      const nowMs = Date.now();
      const startTimeMs = typeof booking.startTime.toMillis === "function" 
        ? booking.startTime.toMillis() 
        : new Date(booking.startTime).getTime();
      const gracePeriodEnd = startTimeMs + pickupGracePeriod * 60_000;

      if (nowMs > gracePeriodEnd) {
        throw new HttpsError(
          "deadline-exceeded",
          "GRACE_PERIOD_EXPIRED: The pickup grace period has expired. Your booking has been cancelled."
        );
      }

      // --- 6. Check bike availability ---
      const bikeRef = db.collection("bikes").doc(bikeId);
      const bikeSnap = await transaction.get(bikeRef);

      if (!bikeSnap.exists) {
        throw new HttpsError("not-found", `Bike ${bikeId} not found.`);
      }
      const bikeData = bikeSnap.data()!;
      if (bikeData.status !== "available") {
        throw new HttpsError(
          "failed-precondition",
          `BIKE_NOT_AVAILABLE: Bike ${bikeId} is not available.`
        );
      }

      // user_flagged bikes can still be collected — the client may show a warning
      const bikeConditionWarning = bikeData.condition === "user_flagged"
        ? (bikeData.flaggedReason as string) || "This bike has been reported as damaged by another user."
        : null;

      if (bikeConditionWarning) {
        logger.warn("collectBike: user collecting a user_flagged bike", { userId, bikeId, reason: bikeConditionWarning });
      }

      // --- 7. Transaction writes ---
      const bookingId = bookingDoc.id;

      transaction.update(bookingRef, {
        bikeId: bikeId,
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
        bikeConditionWarning,
      };
    });

    // --- 8. Enqueue return grace period Cloud Task using deterministic taskId ---
    // Fires at endTime + returnGracePeriod. Using `return-${bookingId}` as taskId
    // allows returnBike to cancel it if the user returns on time.
    try {
      const delaySeconds = Math.max(
        30,
        Math.floor((result.endTime.toMillis() - Date.now()) / 1000) + returnGracePeriod * 60
      );
      await enqueueTask("handleReturnGracePeriod", { bookingId: result.bookingId }, {
        scheduleDelaySeconds: delaySeconds,
        id: `return-${result.bookingId}`,
      });
    } catch (taskErr) {
      logger.error("collectBike: failed to enqueue return grace task", { bookingId: result.bookingId, taskErr });
    }

    // --- 9. Write notification (outside transaction) ---
    const endTimeMs = typeof result.endTime.toMillis === "function"
      ? result.endTime.toMillis()
      : new Date(result.endTime as unknown as string).getTime();
    const endTimeDate = new Date(endTimeMs);
    const endTimeStr = endTimeDate.toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kuala_Lumpur",
    });

    await createNotification(
      userId,
      "Bike Collected",
      `Bike ${bikeId} collected successfully. Please return by ${endTimeStr}.`,
      "booking",
      result.bookingId
    );

    logger.info("collectBike success", { userId, bikeId, bookingId: result.bookingId });
    return { success: true, bikeConditionWarning: result.bikeConditionWarning };
  } catch (error: unknown) {
    logger.error("collectBike error", { userId, bikeId, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Transaction failed.");
  }
});
