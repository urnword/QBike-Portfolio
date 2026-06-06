/**
 * Shared permanent-block notification & report helper.
 *
 * Previously duplicated between returnBike (user-triggered return) and
 * handleReturnGracePeriod (scheduler-triggered overdue check).
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "./notifications";
import { sendAdminEmail } from "./email";
import * as logger from "firebase-functions/logger";

interface PermanentBlockParams {
  userId: string;
  newLateReturnCount: number;
  bookingId: string | null;
  /** Bike ID known at call-site; null when triggered by the scheduler. */
  bikeId: string | null;
  /** Short description of what triggered the block (for admin email). */
  triggerSummary: string;
}

/**
 * Writes a policy_violation report, notifies all admins (push + email),
 * and sends the banned user their account-blocked notification.
 *
 * Call this AFTER the Firestore transaction that sets isBlocked has
 * committed successfully.
 */
export async function notifyPermanentBlock({
  userId,
  newLateReturnCount,
  bookingId,
  bikeId,
  triggerSummary,
}: PermanentBlockParams): Promise<void> {
  const db = getFirestore();

  // 1. Fetch user data for denormalized fields on the report
  const userSnap = await db.collection("users").doc(userId).get();
  const userData = userSnap.exists ? userSnap.data()! : {};
  const userFullName = (userData.displayName as string) ?? "";
  const userMatrixNo = (userData.matrixNumber as string) ?? "";

  // 2. Write unified policy_violation report
  const reportRef = db.collection("reports").doc();
  const reportId = reportRef.id;
  await reportRef.set({
    reportId,
    type: "policy_violation",
    severity: "high",
    status: "open",
    payload: {
      triggerType: "late_return_threshold",
      lateReturnCount: newLateReturnCount,
      bookingId: bookingId ?? null,
    },
    linkedBookingId: bookingId ?? null,
    linkedBikeId: bikeId ?? null,
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

  // 3. Email admins (fire-and-forget — never blocks the function response)
  sendAdminEmail("report_alert", {
    reportId,
    type: "policy_violation",
    severity: "high",
    userFullName,
    userMatrixNo,
    linkedBikeId: bikeId,
    linkedBookingId: bookingId,
    payloadSummary: triggerSummary,
    signedPhotoUrl: null,
    createdAt: new Date(),
  }).catch((e) => logger.error("notifyPermanentBlock: sendAdminEmail failed", e));

  // 4. Push-notify all admins
  const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
  const notificationPromises: Promise<void>[] = adminSnap.docs.map((adminDoc) =>
    createNotification(
      adminDoc.id,
      "User Permanently Blocked",
      `User ${userId} (${userMatrixNo}) has been permanently blocked after ${newLateReturnCount} late returns.`,
      "admin_report",
      reportId,
    ),
  );

  // 5. Notify the user
  const banEmailHtml = `
    <h2 style="color: #EC1C24;">Account Permanently Blocked</h2>
    <p>Your QBike account has been permanently blocked.</p>
    <p><strong>Reason:</strong> You have reached the maximum threshold of ${newLateReturnCount} late returns.</p>
    <p>If you believe this is an error, please contact the administration immediately.</p>
  `;
  notificationPromises.push(
    createNotification(
      userId,
      "Account Permanently Blocked",
      `Your account has been permanently blocked after ${newLateReturnCount} late returns. Please contact administration for any appeals.`,
      "account",
      null,
      banEmailHtml,
    ),
  );

  await Promise.allSettled(notificationPromises);
}
