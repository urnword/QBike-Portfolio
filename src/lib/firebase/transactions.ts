import { runTransaction, doc, collection, query, where, Timestamp, getDocs } from "firebase/firestore";
import { db } from "./client";
import { UserDocument, PolicySingleton, InventorySingleton, BookingDocument } from "@/types";

export type BookingErrorCode =
  | "NO_SLOTS_AVAILABLE"
  | "USER_NOT_ELIGIBLE"
  | "POLICY_VIOLATION"
  | "OUTSIDE_OPERATING_HOURS"
  | "BOOKING_CLOSED"
  | "TRANSACTION_FAILED";

export type SafeBookingResult =
  | { success: true; bookingId: string }
  | { success: false; error: BookingErrorCode; meta?: any };

// DELIVERABLE 4 - Firestore Transaction: Safe Booking



// Haversine helper
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371e3; // metres
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
