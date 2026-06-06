import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-southeast1" });

initializeApp();

// ── Auth ──────────────────────────────────────────────────────────────────
export * from "./auth/onUserCreate";
export * from "./verification/submitVerificationRequest";

// ── Booking (On-Demand) ───────────────────────────────────────────────────
export * from "./booking/createOnDemandBooking";
export * from "./booking/cancelBooking";
export * from "./booking/collectBike";
export * from "./booking/returnBike";

// ── Cloud Task Handlers ───────────────────────────────────────────────────
// Pickup: fires at startTime + pickupGracePeriod — cancels uncollected bookings
export * from "./scheduled/handlePickupGracePeriod";
// Return: fires at endTime + returnGracePeriod — marks overdue bookings as late
export * from "./scheduled/handleReturnGracePeriod";
// Cooldown: fires at cooldownUntil — notifies user that cooldown has ended
// Replaces the old notifyCooldownComplete Cloud Scheduler (every-15-min polling)
export * from "./scheduled/handleCooldownComplete";

// ── Reports ───────────────────────────────────────────────────────────────────
export * from "./report/createReport";
export * from "./report/reportCollectionIssue";
export * from "./report/reportMidRideDamage";
export * from "./report/resolveReport";
export * from "./report/syncDamageToBike";

// ── Admin ─────────────────────────────────────────────────────────────────────
export * from "./admin/logMaintenance";

// ── Scheduled ─────────────────────────────────────────────────────────────────
export * from "./scheduled/sendDailyDigest";
