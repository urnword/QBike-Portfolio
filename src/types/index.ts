import { Timestamp } from "firebase/firestore";

// DELIVERABLE 1 - TypeScript Interfaces

// --- Users ---
export interface UserDocument {
  uid: string;
  email: string;
  role: "student" | "staff" | "admin";
  displayName: string;
  photoURL?: string | null;
  matrixNumber: string;
  phoneNumber: string;
  practicum: string;
  profileComplete: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  verificationRejectedReason: string | null;
  isBlocked: boolean;
  blockType: "admin" | "system" | null;
  cooldownUntil: Timestamp | null;
  lateReturnCount: number;
  stats?: {
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    lateBookings: number;
  };
  emailNotification: boolean;
  pushNotification: boolean;
  fcmToken: string | null;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  sessionVersion: number;
  lastCancelledAt: Timestamp | null;
}

export interface BookingStats {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  lateBookings: number;
}

// --- Bikes & Inventory ---
export interface BikeDocument {
  bikeId: string;
  status: "available" | "in_use" | "maintenance";
  condition: "good" | "flagged" | "user_flagged";
  lastUsedBy: string | null;
  /** Denormalized matrix number of the last rider — set on every return. */
  lastUsedByMatrix?: string | null;
  lastReturnedAt: Timestamp | null;
  flaggedAt: Timestamp | null;
  flaggedReason: string | null;
  currentBookingId: string | null;
  flaggedCount: number;
  maintenanceCount: number;
  totalTrips: number;
  updatedAt?: Timestamp | null;
}

export interface InventorySingleton {
  total: number;
  available: number;
  inUse: number;
  bookedInAdvance: number;
  maintenance: number;
}

// --- Bookings ---
export interface BookingDocument {
  bookingId: string;
  userId: string;
  userFullName: string;
  userMatrixNo: string;
  bikeId: string | null;
  bookingType: "ondemand" | "future" | "class";
  status: "pending" | "active" | "collected" | "completed" | "cancelled" | "late";
  startTime: Timestamp;
  endTime: Timestamp;
  duration: number;
  isLate: boolean;
  lateReturnMinutes: number | null;
  cancelledBy: "user" | "system" | "admin" | null;
  cancelledAt: Timestamp | null;
  collectedAt: Timestamp | null;
  returnedAt: Timestamp | null;
  bikeConditionOnReturn: "good" | "flagged" | null;
  returnPhotoPath: string | null;
  linkedReportIds: string[];
  rescheduleCount: number;
  bikeHistory: string[];      // previous bike IDs when a mid-ride swap occurred
  practicum: string | null;
  classBookingId: string | null;
  createdAt: Timestamp;
}


// --- Policy Details ---
export interface PolicySingleton {
  isBookingOpen: boolean;
  loginDisabled: boolean;
  gpsEnabled: boolean;
  maxBookingDuration: number;
  bookingDurationOptions: number[];
  operatingDays: string[];
  operatingHours: {
    default: { open: string; close: string };
    overrides: Record<string, { open: string; close: string }>;
  };
  pickupGracePeriod: number;
  returnGracePeriod: number;
  standardCooldownDays: number;
  lateReturnCooldownDays: number;
  stationCoordinates: { lat: number; lng: number };
  gpsRadiusMeters: number;
  cancelCooldownMinutes: number;
  updatedAt: Timestamp;
  updatedBy: string;
}

// --- Verification & Admin ---
export interface VerificationListEntry {
  matrixNumber: string;
  displayName: string | null;
  practicum: string | null;
  uploadId: string | null;
  source: "csv" | "manual";
  uploadedAt: Timestamp;
  isUsed: boolean;
  claimedBy: string | null;
}

export interface VerificationUpload {
  uploadId: string;
  uploadedBy: string;
  label: string;
  uploadedAt: Timestamp;
  totalEntries: number;
}

export interface NotificationDocument {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  type: "booking" | "verification" | "block" | "system" | "admin_report";
  isRead: boolean;
  relatedId: string | null;
  createdAt: Timestamp;
}

export interface PracticumDocument {
  practicumId: string;
  code: string;
  label: string | null;
  createdAt: Timestamp;
  createdBy: string;
}

// --- Reports (Unified /reports collection) ---

export type ReportType =
  | "damage_return"      // Bike damage flagged at return — written by returnBike + createReport
  | "damage_midride"     // Student reports damage during an active ride
  | "collection_issue"   // Problem at bike collection point
  | "policy_violation"   // System-generated: late return threshold exceeded
  | "contact_support";   // General support message / feedback

export type ReportSeverity = "low" | "medium" | "high" | "critical";
export type ReportStatus   = "open" | "in_review" | "resolved" | "dismissed";

// ── Shared issue type union ───────────────────────────────────────────────────
export type BikeIssueType =
  | "flat_tire"
  | "loose_chain"
  | "broken_brake"
  | "seat_damage"
  | "frame_damage"
  | "other";

// ── Per-type discriminated payloads ───────────────────────────────────────────
export interface DamageReturnPayload {
  bikeId: string;
  bookingId: string;
  issueType: BikeIssueType;
  issueDescription: string | null;
  issuePhotoPath: string | null;
  returnPhotoPath: string;
}

export interface DamageMidridePayload {
  bikeId: string;
  bookingId: string;
  issueType: BikeIssueType;
  issueDescription: string | null;
  issuePhotoPath: string | null;
  locationLat: number | null;
  locationLng: number | null;
  wantsSwap: boolean;
  swappedToBikeId: string | null;  // null if no swap or none available
}

export interface CollectionIssuePayload {
  bikeId: string | null;
  bookingId: string;
  issueType: "no_bike_available" | "bike_damaged" | "qr_damaged" | "other";
  issueDescription: string | null;
  issuePhotoPath: string | null;
  rescheduleMinutes: number | null;
  action: "rescheduled" | "cancelled" | "reported" | null;
}

export interface PolicyViolationPayload {
  triggerType: "late_return_threshold";
  lateReturnCount: number;
  bookingId: string | null;
}

export interface ContactSupportPayload {
  subject: string;
  message: string;
  category: "app_bug" | "lost_item" | "billing" | "access" | "other";
}

export type ReportPayload =
  | DamageReturnPayload
  | DamageMidridePayload
  | CollectionIssuePayload
  | PolicyViolationPayload
  | ContactSupportPayload;

export interface ReportDocument {
  reportId: string;

  // Classification
  type: ReportType;
  severity: ReportSeverity;
  status: ReportStatus;

  // Type-specific data
  payload: ReportPayload;

  // Optional links (null when not applicable to the type)
  linkedBookingId: string | null;
  linkedBikeId: string | null;

  // Denormalized student info — always populated for user-submitted types
  userId: string;
  userFullName: string;
  userMatrixNo: string;

  // Admin resolution tracking
  resolvedBy: string | null;
  resolvedAt: Timestamp | null;
  resolutionNote: string | null;

  // Notification tracking — populated when emails/push are sent
  notifiedAt: Timestamp | null;
  notifiedVia: ("email" | "push" | "in_app")[] | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- Bike Subcollections ---

export interface BikeDamageDocument {
  id: string; // matches global reportId
  reportType: ReportType;
  issueType: string | null;
  issueDescription: string | null;
  reportedBy: string; // userId
  reportedByMatrix?: string | null;
  reportedAt: Timestamp;
  issuePhotoPath: string | null;
}

export interface MaintenanceDocument {
  maintenanceId: string;
  technicianId: string;
  technicianName: string;
  description: string;
  changedParts: string[] | null;
  previousCondition: string;
  createdAt: Timestamp;
}

