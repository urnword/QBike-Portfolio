import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { createNotification } from "../utils/notifications";

interface ResolveReportData {
  reportId: string;
  newStatus: "resolved" | "dismissed";
  resolutionNote?: string;
  flipBikeAvailable?: boolean;
  liftSuspension?: boolean;
}

export const resolveReport = onCall(async (request) => {
  const { auth, data } = request;

  if (!auth) throw new HttpsError("unauthenticated", "Authentication required.");

  const db = getFirestore();

  // ── Verify admin role ─────────────────────────────────────────────────────
  const callerSnap = await db.collection("users").doc(auth.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const d = data as ResolveReportData;
  if (!d.reportId || typeof d.reportId !== "string") {
    throw new HttpsError("invalid-argument", "reportId is required.");
  }
  if (!["resolved", "dismissed"].includes(d.newStatus)) {
    throw new HttpsError("invalid-argument", "newStatus must be 'resolved' or 'dismissed'.");
  }

  logger.info("resolveReport: start", { reportId: d.reportId, adminId: auth.uid, newStatus: d.newStatus });

  try {
    // Hoist userId outside the transaction so we can notify without a re-read.
    let resolvedUserId: string | null = null;

    await db.runTransaction(async (tx) => {
      // ── 1. Read report ──────────────────────────────────────────────────
      const reportRef = db.collection("reports").doc(d.reportId);
      const reportSnap = await tx.get(reportRef);
      if (!reportSnap.exists) {
        throw new HttpsError("not-found", "Report not found.");
      }
      const report = reportSnap.data()!;

      // ── 2. Resolve the report ──────────────────────────────────────────
      tx.update(reportRef, {
        status: d.newStatus,
        resolvedBy: auth.uid,
        resolvedAt: FieldValue.serverTimestamp(),
        resolutionNote: d.resolutionNote?.trim() || null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // ── 3. Optionally flip bike to available ───────────────────────────
      if (d.flipBikeAvailable && report.linkedBikeId) {
        const bikeRef = db.collection("bikes").doc(report.linkedBikeId as string);
        const bikeSnap = await tx.get(bikeRef);
        if (bikeSnap.exists) {
          const bike = bikeSnap.data()!;
          const prevStatus = bike.status as string;
          tx.update(bikeRef, {
            status: "available",
            condition: "good",
            currentBookingId: null,
            flaggedAt: null,
            flaggedReason: null,
          });
          // Adjust inventory singleton
          const invRef = db.collection("inventory").doc("current");
          const invDelta: Record<string, number> = { available: 1 };
          if (prevStatus === "maintenance") invDelta["maintenance"] = -1;
          else if (prevStatus === "in_use") invDelta["inUse"] = -1;
          tx.update(invRef, Object.fromEntries(
            Object.entries(invDelta).map(([k, v]) => [k, FieldValue.increment(v)])
          ));
          logger.info("resolveReport: bike flipped to available", { bikeId: report.linkedBikeId, prevStatus });
        }
      }

      // ── 4. Optionally lift user suspension ────────────────────────────
      if (d.liftSuspension && report.userId) {
        resolvedUserId = report.userId as string;
        const userRef = db.collection("users").doc(resolvedUserId);
        tx.update(userRef, {
          isBlocked: false,
          blockType: null,
          cooldownUntil: null,
          lateReturnCount: 0,
        });
        logger.info("resolveReport: user suspension lifted", { userId: resolvedUserId });
      }

      // ── 5. Write to audit log ─────────────────────────────────────────
      const auditLogRef = db.collection("auditLog").doc();
      tx.set(auditLogRef, {
        action: "resolveReport",
        adminUid: auth.uid,
        targetId: d.reportId,
        timestamp: FieldValue.serverTimestamp(),
        details: {
          newStatus: d.newStatus,
          flipBikeAvailable: d.flipBikeAvailable || false,
          liftSuspension: d.liftSuspension || false,
        },
      });
    });

    logger.info("resolveReport: success", { reportId: d.reportId });

    // Notify student if their suspension was lifted.
    // resolvedUserId was captured inside the transaction — no extra Firestore read needed.
    if (d.liftSuspension && resolvedUserId) {
      await createNotification(
        resolvedUserId,
        "Account Suspension Lifted",
        "Your account suspension has been lifted by an administrator. You may now book bikes again.",
        "account",
        d.reportId
      ).catch((e) => logger.error("resolveReport: notification failed", e));
    }

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof HttpsError) throw error;
    logger.error("resolveReport: unexpected error", { reportId: d.reportId, error });
    throw new HttpsError("internal", "Failed to resolve report. Please try again.");
  }
});
