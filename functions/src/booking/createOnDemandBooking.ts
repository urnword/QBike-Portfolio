import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "../utils/notifications";
import { enqueueTask } from "../utils/tasks";
import * as logger from "firebase-functions/logger";

function parseHHMM(t: string): { hour: number; minute: number } {
  const s = t.padStart(4, "0");
  return { hour: parseInt(s.slice(0, 2), 10), minute: parseInt(s.slice(2), 10) };
}

function getMYTInfo(utcDate: Date): { dayAbbr: string; hour: number; minute: number } {
  const myt = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  const dayAbbr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][myt.getUTCDay()];
  return { dayAbbr, hour: myt.getUTCHours(), minute: myt.getUTCMinutes() };
}

export const createOnDemandBooking = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    return { success: false, error: "USER_NOT_ELIGIBLE" };
  }

  const { duration, practicum } = data;
  if (typeof duration !== "number" || duration <= 0) {
    return { success: false, error: "POLICY_VIOLATION" };
  }

  const db = getFirestore();
  const userId = auth.uid;

  try {
    const { bookingId, pickupGracePeriod } = await db.runTransaction(async (transaction) => {
      // ── 1. Read Policy ─────────────────────────────────────────────────────
      const policyRef = db.collection("policy").doc("current");
      const policySnap = await transaction.get(policyRef);
      if (!policySnap.exists) throw new Error("POLICY_VIOLATION");
      const policy = policySnap.data() as Record<string, unknown>;

      if (policy.loginDisabled === true) throw new Error("POLICY_VIOLATION");
      if (!policy.isBookingOpen) throw new Error("BOOKING_CLOSED");
      if (duration > (policy.maxBookingDuration as number)) throw new Error("POLICY_VIOLATION");

      const gracePeriod = (policy.pickupGracePeriod as number) || 15;

      // Operating days & hours (MYT UTC+8)
      const now = new Date();
      const { dayAbbr, hour: mytHour, minute: mytMin } = getMYTInfo(now);

      const operatingDays = (policy.operatingDays as string[]) || [];
      if (!operatingDays.includes(dayAbbr)) throw new Error("OUTSIDE_OPERATING_HOURS");

      const opHours = policy.operatingHours as {
        default: { open: string; close: string };
        overrides: Record<string, { open: string; close: string }>;
      };
      const todayHours = opHours?.overrides?.[dayAbbr] ?? opHours?.default;
      if (todayHours) {
        const open = parseHHMM(todayHours.open);
        const close = parseHHMM(todayHours.close);
        const nowMins = mytHour * 60 + mytMin;
        const endMins = nowMins + duration;
        const openMins = open.hour * 60 + open.minute;
        const closeMins = close.hour * 60 + close.minute;

        if (nowMins < openMins || nowMins >= closeMins) throw new Error("OUTSIDE_OPERATING_HOURS");
        if (endMins > closeMins) throw new Error("BOOKING_EXCEEDS_OPERATING_HOURS");
      }

      // ── 2. Read User ───────────────────────────────────────────────────────
      const userRef = db.collection("users").doc(userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("USER_NOT_ELIGIBLE");
      const user = userSnap.data() as Record<string, unknown>;

      if (!user.profileComplete || user.verificationStatus !== "verified") {
        throw new Error("USER_NOT_ELIGIBLE");
      }

      if (user.isBlocked) {
        throw new Error("ACCOUNT_PERMANENTLY_BLOCKED");
      }

      const cooldownUntil = user.cooldownUntil as { toMillis: () => number } | null;
      if (cooldownUntil && cooldownUntil.toMillis() > Date.now()) {
        throw new Error("ACCOUNT_SUSPENDED");
      }

      // Cancel cooldown check
      const lastCancelledAt = user.lastCancelledAt as Timestamp | null;
      if (lastCancelledAt) {
        const cooldownMins = (policy.cancelCooldownMinutes as number) || 0;
        if (Date.now() - lastCancelledAt.toMillis() < cooldownMins * 60 * 1000) {
          throw new Error("CANCEL_COOLDOWN");
        }
      }

      // ── 3. Check for existing active booking (primary idempotency guard) ──
      const activeQuery = db.collection("bookings")
        .where("userId", "==", userId)
        .where("status", "in", ["pending", "active", "collected", "late"]);
      const activeSnap = await transaction.get(activeQuery);
      if (!activeSnap.empty) throw new Error("USER_ALREADY_HAS_ACTIVE_BOOKING");

      // ── 4. Check inventory counter ────────────────────────────────────────
      const inventoryRef = db.collection("inventory").doc("current");
      const inventorySnap = await transaction.get(inventoryRef);
      if (!inventorySnap.exists) throw new Error("TRANSACTION_FAILED");
      const inv = inventorySnap.data() as { total: number; available: number };

      if ((inv.available || 0) <= 0) {
        throw new Error(`NO_SLOTS_AVAILABLE:${inv.total - (inv.available || 0)}/${inv.total || 0}`);
      }

      // ── 5. Create Booking ─────────────────────────────────────────────────
      const startTime = now;
      const endTime = new Date(now.getTime() + duration * 60000);
      const newBookingId = `BKG-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      const bookingRef = db.collection("bookings").doc(newBookingId);

      transaction.set(bookingRef, {
        bookingId: newBookingId,
        userId,
        userFullName: ((user.displayName as string) || "Unknown").replace(/\s+/g, ' ').trim(),
        userMatrixNo: ((user.matrixNumber as string) || "Unknown").replace(/\s+/g, '').trim(),
        bikeId: null,
        bookingType: "ondemand",
        status: "active",
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        duration,
        isLate: false,
        lateReturnMinutes: null,
        cancelledBy: null,
        cancelledAt: null,
        collectedAt: null,
        returnedAt: null,
        bikeConditionOnReturn: null,
        linkedReportIds: [],
        rescheduleCount: 0,
        bikeHistory: [],
        practicum: (practicum as string) || (user.practicum as string) || null,
        classBookingId: null,
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.update(inventoryRef, {
        available: FieldValue.increment(-1),
        inUse: FieldValue.increment(1),
      });

      // Booking stats
      const statsRef = db.collection("users").doc(userId).collection("bookingStats").doc("stats");
      transaction.set(statsRef, { totalBookings: FieldValue.increment(1) }, { merge: true });

      return { bookingId: newBookingId, pickupGracePeriod: gracePeriod };
    });

    // ── Post-transaction: notification + Cloud Task ────────────────────────
    await createNotification(
      userId,
      "Booking Confirmed",
      "Your booking is confirmed. Please collect your bike within the pickup window.",
      "booking",
      bookingId
    );

    // Enqueue pickup grace period task using bookingId as deterministic taskId
    // so it can be cancelled if the user cancels the booking before collection.
    try {
      await enqueueTask("handlePickupGracePeriod", { bookingId }, {
        scheduleDelaySeconds: pickupGracePeriod * 60,
        id: `pickup-${bookingId}`,
      });
    } catch (taskErr) {
      logger.error("createOnDemandBooking: failed to enqueue pickup grace task", { bookingId, taskErr });
    }

    return { success: true, bookingId };
  } catch (error: unknown) {
    logger.error("createOnDemandBooking error:", error);
    const msg = error instanceof Error ? error.message : "";
    const knownPrefixes = [
      "NO_SLOTS_AVAILABLE", "USER_NOT_ELIGIBLE", "POLICY_VIOLATION",
      "OUTSIDE_OPERATING_HOURS", "BOOKING_CLOSED", "TRANSACTION_FAILED",
      "ACCOUNT_PERMANENTLY_BLOCKED", "ACCOUNT_SUSPENDED", "ACCOUNT_ON_COOLDOWN",
      "USER_ALREADY_HAS_ACTIVE_BOOKING", "BOOKING_EXCEEDS_OPERATING_HOURS",
      "CANCEL_COOLDOWN", "DUPLICATE_BOOKING",
    ];
    for (const prefix of knownPrefixes) {
      if (msg.startsWith(prefix)) {
        return { success: false, error: msg };
      }
    }
    return { success: false, error: "TRANSACTION_FAILED" };
  }
});
