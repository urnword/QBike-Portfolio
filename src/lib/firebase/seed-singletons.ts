import { adminDb } from "./admin";
import { Timestamp } from "firebase-admin/firestore";
import { PolicySingleton, InventorySingleton } from "../../types";

export const DEFAULT_POLICY: PolicySingleton = {
  isBookingOpen: true,
  loginDisabled: false,
  gpsEnabled: true,
  maxBookingDuration: 60,
  bookingDurationOptions: [30, 60, 90, 120],
  operatingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  operatingHours: {
    default: { open: "0800", close: "1830" },
    overrides: {
      "Sat": { open: "0800", close: "1200" },
      "Sun": { open: "0800", close: "1200" }
    }
  },
  pickupGracePeriod: 15,
  returnGracePeriod: 15,
  standardCooldownDays: 0,
  lateReturnCooldownDays: 3,
  stationCoordinates: { lat: 1.8410, lng: 102.9304 }, // KMJ Coordinates (Approx)
  gpsRadiusMeters: 100,
  cancelCooldownMinutes: 10,
  updatedAt: Timestamp.now() as unknown as PolicySingleton["updatedAt"],
  updatedBy: "system"
};

export const DEFAULT_INVENTORY: InventorySingleton = {
  total: 0,
  available: 0,
  inUse: 0,
  bookedInAdvance: 0,
  maintenance: 0
};

let initializationPromise: Promise<void> | null = null;

/**
 * Ensures that the required singleton documents exist in Firestore.
 * If they don't exist, they are created with default values.
 */
export async function ensureSingletons() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const policyRef = adminDb.collection("policy").doc("current");
      const inventoryRef = adminDb.collection("inventory").doc("current");

      const [policyDoc, inventoryDoc] = await Promise.all([
        policyRef.get(),
        inventoryRef.get()
      ]);

      const batch = adminDb.batch();
      let needsCommit = false;

      if (!policyDoc.exists) {
        console.log("[Seed] Creating /policy/current with default values...");
        batch.set(policyRef, DEFAULT_POLICY);
        needsCommit = true;
      } else {
        const policyData = policyDoc.data() as PolicySingleton;
        if (policyData.gpsEnabled === undefined) {
          console.log("[Seed] Updating /policy/current to include gpsEnabled...");
          batch.update(policyRef, { gpsEnabled: true });
          needsCommit = true;
        }
        if (policyData.cancelCooldownMinutes === undefined) {
          console.log("[Seed] Updating /policy/current to include cancelCooldownMinutes...");
          batch.update(policyRef, { cancelCooldownMinutes: 10 });
          needsCommit = true;
        }
      }

      if (!inventoryDoc.exists) {
        console.log("[Seed] Creating /inventory/current with default values...");
        batch.set(inventoryRef, DEFAULT_INVENTORY);
        needsCommit = true;
      }

      if (needsCommit) {
        await batch.commit();
        console.log("[Seed] Singletons initialized successfully.");
      }
    } catch (error) {
      console.error("[Seed] Failed to ensure singletons:", error);
      initializationPromise = null; // Allow retry on next call
    }
  })();

  return initializationPromise;
}
