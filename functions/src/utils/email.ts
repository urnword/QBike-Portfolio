import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const FROM_EMAIL = "noreply@qbike.moe-dl.edu.my";
const FROM_NAME = "QBike System";

// ── Signed URL helper ─────────────────────────────────────────────────────────
export async function getSignedPhotoUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });
    return url;
  } catch (err) {
    logger.warn("getSignedPhotoUrl: failed", { storagePath, err });
    return null;
  }
}

// ── Low-level Brevo sender ────────────────────────────────────────────────────
export async function sendEmail(
  toEmail: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  // Email notifications are temporarily fully disabled ("coming soon")
  const isEmailEnabled = false; // Flag to easily re-enable in the future
  if (!isEmailEnabled) {
    logger.info(`sendEmail: bypassed sending email to ${toEmail} as emails are currently disabled`);
    return;
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    logger.warn("sendEmail: BREVO_API_KEY not set, skipping");
    return;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Brevo ${res.status}: ${err}`);
    }
    logger.info(`sendEmail: delivered to ${toEmail}`);
  } catch (error) {
    logger.error(`sendEmail: failed for ${toEmail}`, error);
  }
}

// ── Typed data shapes ─────────────────────────────────────────────────────────
export interface ReportAlertEmailData {
  reportId: string;
  type: string;
  severity: string;
  userFullName: string;
  userMatrixNo: string;
  linkedBikeId: string | null;
  linkedBookingId: string | null;
  payloadSummary: string;
  signedPhotoUrl: string | null;
  createdAt: Date;
}

export interface DigestReportItem {
  reportId: string;
  type: string;
  userFullName: string;
  userMatrixNo: string;
  linkedBikeId: string | null;
  payloadSummary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function reportTypeLabel(type: string): string {
  const m: Record<string, string> = {
    damage_return: "Bike Damage (Return)",
    damage_midride: "Bike Damage (Mid-Ride)",
    collection_issue: "Collection Issue",
    policy_violation: "Policy Violation",
    contact_support: "Support Request",
  };
  return m[type] ?? type;
}

function severityColor(severity: string): string {
  const m: Record<string, string> = {
    critical: "#7B0000", high: "#EC1C24", medium: "#D97706", low: "#1B3392",
  };
  return m[severity] ?? "#6B7280";
}

function alertHtml(d: ReportAlertEmailData): string {
  const sc = severityColor(d.severity);
  const tl = reportTypeLabel(d.type);
  const dt = d.createdAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:0">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#1B3392;padding:24px 32px">
    <span style="color:#fff;font-size:22px;font-weight:700">QBike</span>
    <span style="color:rgba(255,255,255,.6);font-size:13px;margin-left:12px">System Alert</span>
  </div>
  <div style="padding:32px">
    <div style="display:inline-block;background:${sc}20;border:1px solid ${sc}60;color:${sc};padding:3px 12px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:16px">${d.severity.toUpperCase()}</div>
    <h2 style="margin:0 0 6px;color:#111;font-size:19px">New Report: ${tl}</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:13px">Submitted ${dt}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;font-weight:600;width:36%;text-transform:uppercase">Report ID</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:12px;font-family:monospace">${d.reportId}</td></tr>
      <tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase">Student</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px">${d.userFullName} <span style="color:#6B7280;font-family:monospace">(${d.userMatrixNo})</span></td></tr>
      ${d.linkedBikeId ? `<tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase">Bike</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px;font-family:monospace">${d.linkedBikeId}</td></tr>` : ""}
      ${d.linkedBookingId ? `<tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase">Booking</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px;font-family:monospace">${d.linkedBookingId}</td></tr>` : ""}
      <tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase">Details</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px">${d.payloadSummary}</td></tr>
    </table>
    ${d.signedPhotoUrl ? `<div style="margin-bottom:24px"><p style="font-size:11px;font-weight:600;text-transform:uppercase;color:#6B7280;margin-bottom:8px">Photo (expires 24h)</p><img src="${d.signedPhotoUrl}" style="max-width:100%;border-radius:8px;border:1px solid #E5E7EB" /></div>` : ""}
    <p style="font-size:11px;color:#9CA3AF;margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB">Automated alert from QBike. Log in to the admin console to review and resolve.</p>
  </div>
</div>
</body></html>`;
}

function digestHtml(reports: DigestReportItem[], date: string): string {
  const rows = reports.map(r =>
    `<tr>
      <td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;font-family:monospace;color:#6B7280">${r.reportId.substring(0, 8)}…</td>
      <td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:12px">${reportTypeLabel(r.type)}</td>
      <td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:12px">${r.userFullName} <span style="color:#6B7280;font-family:monospace">(${r.userMatrixNo})</span></td>
      <td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:12px;font-family:monospace">${r.linkedBikeId ?? "–"}</td>
      <td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:12px;color:#6B7280">${r.payloadSummary}</td>
    </tr>`
  ).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:0">
<div style="max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#1B3392;padding:24px 32px">
    <span style="color:#fff;font-size:22px;font-weight:700">QBike</span>
    <span style="color:rgba(255,255,255,.6);font-size:13px;margin-left:12px">Daily Digest — ${date}</span>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 6px;color:#111;font-size:19px">Low-Severity Reports — Last 24 Hours</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:13px">${reports.length} report${reports.length !== 1 ? "s" : ""} awaiting review</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#F9FAFB">
        <th style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;text-align:left;text-transform:uppercase">ID</th>
        <th style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;text-align:left;text-transform:uppercase">Type</th>
        <th style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;text-align:left;text-transform:uppercase">Student</th>
        <th style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;text-align:left;text-transform:uppercase">Bike</th>
        <th style="padding:9px 12px;border:1px solid #E5E7EB;font-size:11px;color:#6B7280;text-align:left;text-transform:uppercase">Summary</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:11px;color:#9CA3AF;margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB">Daily digest from QBike. Log in to the admin console to review and resolve.</p>
  </div>
</div>
</body></html>`;
}

// ── Admin email dispatcher ────────────────────────────────────────────────────
export async function sendAdminEmail(
  template: "report_alert",
  data: ReportAlertEmailData,
): Promise<void>;
export async function sendAdminEmail(
  template: "daily_digest",
  data: { reports: DigestReportItem[]; date: string },
): Promise<void>;
export async function sendAdminEmail(
  template: "report_alert" | "daily_digest",
  data: ReportAlertEmailData | { reports: DigestReportItem[]; date: string },
): Promise<void> {
  const db = getFirestore();
  const adminSnap = await db.collection("users").where("role", "==", "admin").get();
  if (adminSnap.empty) {
    logger.warn("sendAdminEmail: no admin users found");
    return;
  }

  const sends: Promise<void>[] = [];

  for (const adminDoc of adminSnap.docs) {
    const admin = adminDoc.data();
    const toEmail = admin.email as string | undefined;
    const toName = (admin.displayName as string | undefined) ?? "Admin";
    if (!toEmail) continue;

    let subject: string;
    let html: string;

    if (template === "report_alert") {
      const d = data as ReportAlertEmailData;
      subject = `[QBike ${d.severity.toUpperCase()}] ${reportTypeLabel(d.type)} — ${d.userMatrixNo}`;
      html = alertHtml(d);
    } else {
      const d = data as { reports: DigestReportItem[]; date: string };
      subject = `[QBike Daily Digest] ${d.reports.length} Report${d.reports.length !== 1 ? "s" : ""} — ${d.date}`;
      html = digestHtml(d.reports, d.date);
    }

    sends.push(sendEmail(toEmail, toName, subject, html));
  }

  await Promise.allSettled(sends);
}
