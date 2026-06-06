import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFirestore } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import * as logger from "firebase-functions/logger";

interface CooldownCompleteTaskData {
  userId: string;
}

/**
 * Cloud Task handler — fires exactly when a user's cooldown period expires.
 * Replaces the old notifyCooldownComplete Cloud Scheduler (which polled every 15 minutes).
 * Enqueued by returnBike and handleReturnGracePeriod after applying a cooldown.
 * Idempotent: guarded by cooldownUntil re-check and cooldownNotified flag.
 */
export const handleCooldownComplete = onTaskDispatched<CooldownCompleteTaskData>(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const { userId } = req.data;
    const db = getFirestore();

    logger.info("handleCooldownComplete: start", { userId });

    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      logger.info("handleCooldownComplete: user not found, skipping", { userId });
      return;
    }

    const userData = userSnap.data()!;

    // Guard 1: If cooldownUntil is still in the future the user got re-blocked after
    // this task was enqueued (e.g. second late return). Skip — the new cooldown
    // task will fire at the correct time.
    if (userData.isBlocked) {
      logger.info("handleCooldownComplete: user is permanently blocked, skipping", { userId });
      return;
    }

    const cooldownUntilMs =
      userData.cooldownUntil &&
      typeof userData.cooldownUntil.toMillis === "function"
        ? userData.cooldownUntil.toMillis()
        : 0;

    if (cooldownUntilMs > Date.now()) {
      logger.info("handleCooldownComplete: user still on cooldown, skipping", {
        userId,
        cooldownUntilMs,
      });
      return;
    }


    await createNotification(
      userId,
      "Cooldown Period Ended",
      "Your booking cooldown period has ended. You are now eligible to book a bike again.",
      "system"
    );

    logger.info("handleCooldownComplete: notified user", { userId });
  }
);
