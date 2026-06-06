import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { deleteTask } from "../utils/tasks";
import * as logger from "firebase-functions/logger";

export const cancelBooking = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    return { success: false, error: "UNAUTHORIZED" };
  }

  const { bookingId } = data;
  if (!bookingId || typeof bookingId !== "string") {
    return { success: false, error: "INVALID_ARGUMENT" };
  }

  const db = getFirestore();
  const userId = auth.uid;

  try {
    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        throw new Error("NOT_FOUND");
      }

      const booking = bookingSnap.data()!;

      // Ownership check
      if (booking.userId !== userId) {
        throw new Error("UNAUTHORIZED");
      }

      // On-demand bookings start as "active" — only active bookings can be cancelled by users
      if (booking.status !== "active") {
        throw new Error("INVALID_STATE");
      }

      const inventoryRef = db.collection("inventory").doc("current");

      transaction.update(bookingRef, {
        status: "cancelled",
        cancelledBy: "user",
        cancelledAt: FieldValue.serverTimestamp(),
      });

      // Record cancellation time for the cancel cooldown check in createOnDemandBooking
      transaction.update(db.collection("users").doc(userId), {
        lastCancelledAt: FieldValue.serverTimestamp(),
      });

      // Restore inventory — on-demand bookings are always "active" (available--, inUse++)
      // so we always reverse: available++, inUse--
      transaction.update(inventoryRef, {
        available: FieldValue.increment(1),
        inUse: FieldValue.increment(-1),
      });

      // Update booking stats
      const statsRef = db.collection("users").doc(userId).collection("bookingStats").doc("stats");
      transaction.set(statsRef, { cancelledBookings: FieldValue.increment(1) }, { merge: true });
    });

    // Attempt to cancel the pickup grace Cloud Task that was enqueued on booking creation.
    // Tasks use a deterministic taskId (`pickup-${bookingId}`) so they can be dequeued here.
    // If deletion fails (e.g. task already fired or not yet propagated), we log and continue —
    // the handlePickupGracePeriod handler has an idempotency guard that will no-op on the cancelled booking.
    try {
      await deleteTask("handlePickupGracePeriod", `pickup-${bookingId}`);
      logger.info("cancelBooking: pickup grace task deleted", { bookingId });
    } catch (taskErr) {
      logger.warn("cancelBooking: could not delete pickup grace task (will expire naturally)", { bookingId, taskErr });
    }

    await createNotification(
      userId,
      "Booking Cancelled",
      "Your booking has been successfully cancelled.",
      "booking",
      bookingId
    );

    return { success: true };
  } catch (error: unknown) {
    logger.error("cancelBooking error:", error);
    const msg = error instanceof Error ? error.message : "";
    const knownErrors = ["NOT_FOUND", "UNAUTHORIZED", "INVALID_STATE"];
    if (knownErrors.includes(msg)) {
      return { success: false, error: msg };
    }
    return { success: false, error: "TRANSACTION_FAILED" };
  }
});
