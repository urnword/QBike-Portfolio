import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { sendAdminEmail, DigestReportItem } from "../utils/email";

/**
 * Runs daily at 08:00 MYT (00:00 UTC).
 * Queries all low-severity unnotified reports from the past 24 hours,
 * sends a single batched digest email to all admins, then stamps each
 * report with notifiedAt + notifiedVia.
 */
export const sendDailyDigest = onSchedule(
  { schedule: "0 0 * * *", timeZone: "UTC", region: "asia-southeast1" },
  async () => {
    const db = getFirestore();
    const since = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    logger.info("sendDailyDigest: start", { since: since.toDate().toISOString() });

    const snap = await db
      .collection("reports")
      .where("severity", "==", "low")
      .where("notifiedAt", "==", null)
      .get();

    // Filter to last 24h in code (avoids needing a composite index on notifiedAt + createdAt)
    const docs = snap.docs.filter((d) => {
      const created = d.data().createdAt as Timestamp | null;
      return created && created.toMillis() >= since.toMillis();
    });

    if (docs.length === 0) {
      logger.info("sendDailyDigest: no unnotified low-severity reports — skipping email");
      return;
    }

    const reports: DigestReportItem[] = docs.map((d) => {
      const r = d.data();
      const payload = (r.payload ?? {}) as Record<string, unknown>;

      let payloadSummary = "";
      if (r.type === "contact_support") {
        payloadSummary = `Subject: ${payload.subject ?? "—"}. Category: ${payload.category ?? "—"}.`;
      } else if (r.type === "collection_issue") {
        payloadSummary = `Issue: ${payload.issueType ?? "—"}.${payload.issueDescription ? ` ${payload.issueDescription}` : ""}`;
      } else {
        payloadSummary = `Issue: ${payload.issueType ?? "—"}.${payload.issueDescription ? ` ${payload.issueDescription}` : ""}`;
      }

      return {
        reportId: r.reportId as string,
        type: r.type as string,
        userFullName: r.userFullName as string,
        userMatrixNo: r.userMatrixNo as string,
        linkedBikeId: (r.linkedBikeId as string | null) ?? null,
        payloadSummary,
      };
    });

    const date = new Date().toLocaleDateString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    await sendAdminEmail("daily_digest", { reports, date });
    logger.info("sendDailyDigest: digest sent", { count: docs.length });

    // Stamp each report as notified — chunk at 499 to stay under Firestore's 500-write limit.
    // At 3,000 users, more than 500 low-severity reports in 24h is feasible.
    const CHUNK_SIZE = 499;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunkBatch = db.batch();
      for (const doc of docs.slice(i, i + CHUNK_SIZE)) {
        chunkBatch.update(doc.ref, {
          notifiedAt: FieldValue.serverTimestamp(),
          notifiedVia: ["email"],
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await chunkBatch.commit();
    }
    logger.info("sendDailyDigest: notifiedAt stamped on reports", { count: docs.length });
  }
);
