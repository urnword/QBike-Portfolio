import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { notifyPermanentBlock } from "../utils/permanentBlock";
import { enqueueTask } from "../utils/tasks";
import { getCachedPolicy } from "../utils/policyCache";
import * as logger from "firebase-functions/logger";

interface ReturnGraceTaskData {
  bookingId: string;
}

/**
 * Cloud Task handler — fires exactly when the return grace period expires.
 * Enqueued by collectBike immediately after the bike is collected.
 * Idempotent: guarded by status + isLate + returnedAt check inside transaction.
 */
export const handleReturnGracePeriod = onTaskDispatched<ReturnGraceTaskData>(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const { bookingId } = req.data;
    const db = getFirestore();

    logger.info("handleReturnGracePeriod: start", { bookingId });

    // Read policy for cooldown settings (cached — safe outside transaction, policy changes rarely)
    const policy = await getCachedPolicy();
    const standardCooldownDays = (policy.standardCooldownDays as number) ?? 1;
    const lateReturnCooldownDays = (policy.lateReturnCooldownDays as number) ?? 3;
    const lateReturnThreshold = (policy.lateReturnThreshold as number) ?? 3;

    let userId = "";
    let newLateReturnCount = 0;
    let permanentBlockNeeded = false;
    let cooldownUntilMs = 0;

    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) {
        logger.info("handleReturnGracePeriod: booking not found, skipping", { bookingId });
        return;
      }

      const booking = bookingSnap.data()!;

      // Idempotency guard — only mark late if still out and not already flagged.
      // Extra check on returnedAt: if set, returnBike already completed — skip.
      if (
        booking.status !== "collected" ||
        booking.isLate === true ||
        (booking.returnedAt !== null && booking.returnedAt !== undefined)
      ) {
        logger.info("handleReturnGracePeriod: booking already handled", { bookingId, status: booking.status });
        return;
      }

      userId = booking.userId as string;

      const userRef = db.collection("users").doc(userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) return;
      const userData = userSnap.data()!;

      const currentLateCount = (userData.lateReturnCount as number) ?? 0;
      newLateReturnCount = currentLateCount + 1;

      const cooldownDays = standardCooldownDays + lateReturnCooldownDays;
      const now = Date.now();
      cooldownUntilMs = now + cooldownDays * 86_400_000;

      // Use threshold-based check matching returnBike logic
      permanentBlockNeeded =
        newLateReturnCount >= lateReturnThreshold &&
        newLateReturnCount % lateReturnThreshold === 0;

      // Mark booking as late (user still has the bike — don't close the booking)
      transaction.update(bookingRef, {
        status: "late",
        isLate: true,
      });

      const userUpdate: Record<string, unknown> = {
        lateReturnCount: FieldValue.increment(1),
      };

      if (permanentBlockNeeded) {
        userUpdate.isBlocked = true;
        userUpdate.blockType = "system";
      } else {
        userUpdate.cooldownUntil = Timestamp.fromDate(new Date(cooldownUntilMs));
      }

      // Apply cooldown / permanent block to user
      transaction.update(userRef, userUpdate);

      // Update booking stats
      const statsRef = db
        .collection("users")
        .doc(userId)
        .collection("bookingStats")
        .doc("stats");
      transaction.set(statsRef, { lateBookings: FieldValue.increment(1) }, { merge: true });
    });

    if (!userId) return;

    const notificationPromises: Promise<void>[] = [];

    // Notify user they are overdue
    notificationPromises.push(
      createNotification(
        userId,
        "Bike Return Overdue",
        "Your bike return is overdue. Please return the bike to the station immediately. A late penalty has been applied.",
        "booking",
        bookingId
      )
    );

    // Handle permanent ban
    if (permanentBlockNeeded) {
      await notifyPermanentBlock({
        userId,
        newLateReturnCount,
        bookingId: bookingId || null,
        bikeId: null,
        triggerSummary: `Late return threshold reached (scheduler trigger). Total late returns: ${newLateReturnCount}. Account permanently blocked.`,
      });
    }

    await Promise.allSettled(notificationPromises);

    // Enqueue cooldown completion task (only if not permanently banned)
    if (!permanentBlockNeeded) {
      const delaySeconds = Math.max(60, Math.floor((cooldownUntilMs - Date.now()) / 1000));
      try {
        await enqueueTask("handleCooldownComplete", { userId }, { scheduleDelaySeconds: delaySeconds });
      } catch (taskErr) {
        logger.error("handleReturnGracePeriod: failed to enqueue cooldown complete task", { userId, taskErr });
      }
    }

    logger.info("handleReturnGracePeriod: completed", { bookingId, userId, permanentBlockNeeded });
  }
);
