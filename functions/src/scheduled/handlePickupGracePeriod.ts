import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import * as logger from "firebase-functions/logger";

interface PickupGraceTaskData {
  bookingId: string;
}

/**
 * Cloud Task handler — fires exactly when the pickup grace period expires.
 * Enqueued by createOnDemandBooking immediately after booking creation.
 * Idempotent: guarded by status check inside transaction.
 */
export const handlePickupGracePeriod = onTaskDispatched<PickupGraceTaskData>(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const { bookingId } = req.data;
    const db = getFirestore();

    logger.info("handlePickupGracePeriod: start", { bookingId });

    let userId = "";

    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        logger.info("handlePickupGracePeriod: booking not found, skipping", { bookingId });
        return;
      }

      const booking = bookingSnap.data()!;

      // Idempotency guard — only cancel if still waiting for pickup
      if (booking.status !== "active") {
        logger.info("handlePickupGracePeriod: booking already handled", { bookingId, status: booking.status });
        return;
      }

      userId = booking.userId as string;

      const inventoryRef = db.collection("inventory").doc("current");
      const inventorySnap = await transaction.get(inventoryRef);
      if (!inventorySnap.exists) throw new Error("Inventory singleton missing");

      // Cancel the booking
      transaction.update(bookingRef, {
        status: "cancelled",
        cancelledBy: "system",
        cancelledAt: FieldValue.serverTimestamp(),
      });

      // Restore inventory counter
      transaction.update(inventoryRef, {
        available: FieldValue.increment(1),
        inUse: FieldValue.increment(-1),
      });

      // Update user booking stats
      const statsRef = db
        .collection("users")
        .doc(userId)
        .collection("bookingStats")
        .doc("stats");
      transaction.set(statsRef, { cancelledBookings: FieldValue.increment(1) }, { merge: true });
    });

    // Notify user outside transaction
    if (userId) {
      await createNotification(
        userId,
        "Booking Auto-cancelled",
        "Your booking was auto-cancelled because the bike was not collected within the pickup window.",
        "system",
        bookingId
      );
      logger.info("handlePickupGracePeriod: booking cancelled and user notified", { bookingId, userId });
    }
  }
);
