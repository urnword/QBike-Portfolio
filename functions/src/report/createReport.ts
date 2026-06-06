import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { sendAdminEmail, getSignedPhotoUrl } from "../utils/email";
import { createNotification } from "../utils/notifications";

// ── Shared constants ─────────────────────────────────────────────────────────
const BIKE_ISSUE_TYPES = [
  "flat_tire", "loose_chain", "broken_brake", "seat_damage", "frame_damage", "other",
] as const;
type BikeIssueType = typeof BIKE_ISSUE_TYPES[number];

const COLLECTION_ISSUE_TYPES = ["no_bike_available", "bike_damaged", "qr_damaged", "other"] as const;
type CollectionIssueType = typeof COLLECTION_ISSUE_TYPES[number];

const CONTACT_CATEGORIES = ["app_bug", "lost_item", "billing", "access", "other"] as const;
type ContactCategory = typeof CONTACT_CATEGORIES[number];

const HIGH_SEVERITY_BIKE_ISSUES: BikeIssueType[] = ["broken_brake", "frame_damage"];

// ── Input shape (loose — validated per type below) ───────────────────────────
interface CreateReportData {
  type: string;
  // damage_return / damage_midride / collection_issue
  bikeId?: string;
  bookingId?: string;
  issueType?: string;
  issueDescription?: string;
  issuePhotoPath?: string;
  returnPhotoPath?: string;
  // damage_midride extras
  locationLat?: number;
  locationLng?: number;
  // contact_support
  subject?: string;
  message?: string;
  category?: string;
}

// ── Severity helper ───────────────────────────────────────────────────────────
function deriveSeverity(
  type: string,
  issueType?: string,
): "low" | "medium" | "high" | "critical" {
  if (type === "contact_support") return "low";
  if (type === "policy_violation") return "high";
  if (
    (type === "damage_return" || type === "damage_midride") &&
    issueType &&
    HIGH_SEVERITY_BIKE_ISSUES.includes(issueType as BikeIssueType)
  ) {
    return "high";
  }
  // collection_issue: no available bikes is an operational emergency → high
  if (type === "collection_issue" && issueType === "no_bike_available") return "high";
  return "medium";
}

// ── Cloud Function ────────────────────────────────────────────────────────────
export const createReport = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const d = data as CreateReportData;
  const userId = auth.uid;

  logger.info("createReport called", { userId, type: d.type });

  // ── 0. Block policy_violation — internal Cloud Function only ────────────────
  if (d.type === "policy_violation") {
    throw new HttpsError(
      "permission-denied",
      "policy_violation reports are system-generated and cannot be submitted by users.",
    );
  }

  const VALID_USER_TYPES = ["damage_return", "damage_midride", "collection_issue", "contact_support"];
  if (!d.type || !VALID_USER_TYPES.includes(d.type)) {
    throw new HttpsError("invalid-argument", `Invalid report type. Must be one of: ${VALID_USER_TYPES.join(", ")}.`);
  }

  const db = getFirestore();

  try {
    // ── 1. Load user record (denormalization + verification check) ───────────
    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User record not found.");
    }
    const user = userSnap.data() as Record<string, unknown>;

    if (user.verificationStatus !== "verified") {
      throw new HttpsError("failed-precondition", "Only verified users can submit reports.");
    }

    const userFullName = ((user.displayName as string) || "Unknown").replace(/\s+/g, " ").trim();
    const userMatrixNo = ((user.matrixNumber as string) || "Unknown").replace(/\s+/g, "").trim();

    // ── 2. Type-specific payload validation and assembly ─────────────────────
    let payload: Record<string, unknown>;
    let linkedBookingId: string | null = null;
    let linkedBikeId: string | null = null;
    let severity: "low" | "medium" | "high" | "critical";

    if (d.type === "damage_return") {
      if (!d.bikeId || !/^B\d{3}$/.test(d.bikeId)) {
        throw new HttpsError("invalid-argument", "damage_return: bikeId is required (format B001–B999).");
      }
      if (!d.bookingId || typeof d.bookingId !== "string") {
        throw new HttpsError("invalid-argument", "damage_return: bookingId is required.");
      }
      if (!d.issueType || !BIKE_ISSUE_TYPES.includes(d.issueType as BikeIssueType)) {
        throw new HttpsError("invalid-argument", `damage_return: issueType must be one of: ${BIKE_ISSUE_TYPES.join(", ")}.`);
      }
      if (!d.returnPhotoPath || typeof d.returnPhotoPath !== "string") {
        throw new HttpsError("invalid-argument", "damage_return: returnPhotoPath is required.");
      }
      if (d.issueType === "other" && (!d.issueDescription || !d.issueDescription.trim())) {
        throw new HttpsError("invalid-argument", "damage_return: issueDescription is required when issueType is 'other'.");
      }

      linkedBikeId = d.bikeId;
      linkedBookingId = d.bookingId;
      severity = deriveSeverity(d.type, d.issueType);
      payload = {
        bikeId: d.bikeId,
        bookingId: d.bookingId,
        issueType: d.issueType,
        issueDescription: d.issueDescription?.trim() || null,
        issuePhotoPath: d.issuePhotoPath || null,
        returnPhotoPath: d.returnPhotoPath,
      };

    } else if (d.type === "damage_midride") {
      if (!d.bikeId || !/^B\d{3}$/.test(d.bikeId)) {
        throw new HttpsError("invalid-argument", "damage_midride: bikeId is required (format B001–B999).");
      }
      if (!d.bookingId || typeof d.bookingId !== "string") {
        throw new HttpsError("invalid-argument", "damage_midride: bookingId is required.");
      }
      if (!d.issueType || !BIKE_ISSUE_TYPES.includes(d.issueType as BikeIssueType)) {
        throw new HttpsError("invalid-argument", `damage_midride: issueType must be one of: ${BIKE_ISSUE_TYPES.join(", ")}.`);
      }
      if (d.issueType === "other" && (!d.issueDescription || !d.issueDescription.trim())) {
        throw new HttpsError("invalid-argument", "damage_midride: issueDescription is required when issueType is 'other'.");
      }

      linkedBikeId = d.bikeId;
      linkedBookingId = d.bookingId;
      severity = deriveSeverity(d.type, d.issueType);
      payload = {
        bikeId: d.bikeId,
        bookingId: d.bookingId,
        issueType: d.issueType,
        issueDescription: d.issueDescription?.trim() || null,
        issuePhotoPath: d.issuePhotoPath || null,
        locationLat: typeof d.locationLat === "number" ? d.locationLat : null,
        locationLng: typeof d.locationLng === "number" ? d.locationLng : null,
      };

    } else if (d.type === "collection_issue") {
      if (!d.bikeId || !/^B\d{3}$/.test(d.bikeId)) {
        throw new HttpsError("invalid-argument", "collection_issue: bikeId is required (format B001–B999).");
      }
      if (!d.bookingId || typeof d.bookingId !== "string") {
        throw new HttpsError("invalid-argument", "collection_issue: bookingId is required.");
      }
      if (!d.issueType || !COLLECTION_ISSUE_TYPES.includes(d.issueType as CollectionIssueType)) {
        throw new HttpsError("invalid-argument", `collection_issue: issueType must be one of: ${COLLECTION_ISSUE_TYPES.join(", ")}.`);
      }
      if (d.issueType === "other" && (!d.issueDescription || !d.issueDescription.trim())) {
        throw new HttpsError("invalid-argument", "collection_issue: issueDescription is required when issueType is 'other'.");
      }

      linkedBikeId = d.bikeId;
      linkedBookingId = d.bookingId;
      severity = deriveSeverity(d.type, d.issueType);
      payload = {
        bikeId: d.bikeId,
        bookingId: d.bookingId,
        issueType: d.issueType,
        issueDescription: d.issueDescription?.trim() || null,
        issuePhotoPath: d.issuePhotoPath || null,
      };

    } else {
      // contact_support
      if (!d.subject || typeof d.subject !== "string" || !d.subject.trim()) {
        throw new HttpsError("invalid-argument", "contact_support: subject is required.");
      }
      if (d.subject.trim().length > 120) {
        throw new HttpsError("invalid-argument", "contact_support: subject must be 120 characters or fewer.");
      }
      if (!d.message || typeof d.message !== "string" || !d.message.trim()) {
        throw new HttpsError("invalid-argument", "contact_support: message is required.");
      }
      if (d.message.trim().length > 2000) {
        throw new HttpsError("invalid-argument", "contact_support: message must be 2000 characters or fewer.");
      }
      if (!d.category || !CONTACT_CATEGORIES.includes(d.category as ContactCategory)) {
        throw new HttpsError("invalid-argument", `contact_support: category must be one of: ${CONTACT_CATEGORIES.join(", ")}.`);
      }

      severity = "low";
      payload = {
        subject: d.subject.trim(),
        message: d.message.trim(),
        category: d.category,
      };
    }

    // ── 3. Write to /reports ─────────────────────────────────────────────────
    const reportRef = db.collection("reports").doc();
    const reportId = reportRef.id;

    await reportRef.set({
      reportId,
      type: d.type,
      severity,
      status: "open",
      payload,
      linkedBookingId,
      linkedBikeId,
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

    logger.info("createReport success", { reportId, type: d.type, userId });

    // ── 4. Push-notify all admins (fire-and-forget) ───────────────────────────
    // Covers all report types including contact_support which the email skips.
    try {
      let adminTitle = "New Report Submitted";
      let adminBody = `${userFullName} (${userMatrixNo}) submitted a new report.`;

      if (d.type === "damage_return") {
        adminTitle = "Damage Report Submitted";
        adminBody = `${userFullName} (${userMatrixNo}) reported damage on bike ${linkedBikeId || "unknown"}: ${d.issueType || "other"}.`;
      } else if (d.type === "damage_midride") {
        adminTitle = "Mid-Ride Damage Report";
        adminBody = `${userFullName} (${userMatrixNo}) reported mid-ride damage on bike ${linkedBikeId || "unknown"}: ${d.issueType || "other"}.`;
      } else if (d.type === "collection_issue") {
        adminTitle = "Collection Issue Reported";
        adminBody = `${userFullName} (${userMatrixNo}) reported a collection issue: ${d.issueType || "other"}.`;
      } else if (d.type === "contact_support") {
        adminTitle = "New Support Request";
        adminBody = `${userFullName} (${userMatrixNo}) submitted a support request. Category: ${d.category || "other"}.`;
      }

      const adminSnap = await db.collection("users").where("role", "==", "admin").limit(5).get();
      await Promise.allSettled(
        adminSnap.docs.map((adminDoc) =>
          createNotification(adminDoc.id, adminTitle, adminBody, "admin_report", reportId)
        )
      );
    } catch (notifErr) {
      logger.error("createReport: failed to notify admins", { reportId, notifErr });
    }

    // ── 5. Email admins (fire-and-forget — never blocks the response) ─────
    if (severity !== "low") {
      const photoPath =
        (payload["issuePhotoPath"] as string | null) ??
        (payload["returnPhotoPath"] as string | null) ??
        null;
      const signedPhotoUrl = await getSignedPhotoUrl(photoPath).catch(() => null);

      let payloadSummary = "";
      if (d.type === "contact_support") {
        payloadSummary = `Subject: ${d.subject?.trim() ?? "—"}. Category: ${d.category ?? "—"}.`;
      } else {
        payloadSummary = `Issue: ${d.issueType ?? "—"}.${d.issueDescription?.trim() ? ` ${d.issueDescription.trim()}` : ""}`;
      }

      sendAdminEmail("report_alert", {
        reportId,
        type: d.type,
        severity,
        userFullName,
        userMatrixNo,
        linkedBikeId,
        linkedBookingId,
        payloadSummary,
        signedPhotoUrl,
        createdAt: new Date(),
      }).catch((e) => logger.error("createReport: sendAdminEmail failed", e));
    }

    return { success: true, reportId };

  } catch (error: unknown) {
    // Re-throw HttpsErrors directly
    if (error instanceof HttpsError) throw error;

    logger.error("createReport unexpected error", { userId, type: d.type, error });
    throw new HttpsError("internal", "An unexpected error occurred. Please try again.");
  }
});
