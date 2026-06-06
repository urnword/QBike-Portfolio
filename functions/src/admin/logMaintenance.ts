import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

interface LogMaintenanceData {
  bikeId: string;
  description: string;
  changedParts?: string[];
}

export const logMaintenance = onCall(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { bikeId, description, changedParts } = data as LogMaintenanceData;
  const userId = auth.uid;

  logger.info("logMaintenance start", { userId, bikeId });

  // --- 1. Validation ---
  if (!bikeId || !/^B\d{3}$/.test(bikeId)) {
    throw new HttpsError("invalid-argument", "Invalid bike ID format. Expected B001–B999.");
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    throw new HttpsError("invalid-argument", "Description is required.");
  }
  if (changedParts && !Array.isArray(changedParts)) {
    throw new HttpsError("invalid-argument", "changedParts must be an array of strings.");
  }

  const db = getFirestore();

  // --- 2. Check admin role ---
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "User record not found.");
  }
  const user = userSnap.data()!;
  if (user.role !== "admin") {
    throw new HttpsError("permission-denied", "Only administrators can log maintenance.");
  }

  const technicianName = (user.displayName as string) || "Unknown Admin";

  try {
    await db.runTransaction(async (transaction) => {
      const bikeRef = db.collection("bikes").doc(bikeId);
      const bikeSnap = await transaction.get(bikeRef);

      if (!bikeSnap.exists) {
        throw new HttpsError("not-found", `Bike ${bikeId} not found.`);
      }

      const bikeData = bikeSnap.data()!;
      
      // We can perform maintenance on available or flagged bikes.
      // But probably not when it's actively in use.
      if (bikeData.status === "in_use") {
        throw new HttpsError("failed-precondition", `Bike ${bikeId} is currently in use and cannot undergo maintenance.`);
      }

      const previousCondition = bikeData.condition || "unknown";
      const previousStatus = bikeData.status as string;

      // Update the bike — always set to available + good condition after maintenance
      transaction.update(bikeRef, {
        status: "available",
        condition: "good",
        maintenanceCount: FieldValue.increment(1),
        flaggedReason: null, // Clear any active flagged reason
      });

      // Adjust inventory to reflect the status transition.
      // logMaintenance is only permitted on non-in_use bikes, so previous status
      // is either "available" (no-op on available counter) or "maintenance".
      if (previousStatus === "maintenance") {
        const inventoryRef = db.collection("inventory").doc("current");
        transaction.update(inventoryRef, {
          maintenance: FieldValue.increment(-1),
          available: FieldValue.increment(1),
        });
      }

      // Write to maintenance subcollection
      const maintenanceRef = bikeRef.collection("maintenance").doc();
      const maintenanceData = {
        maintenanceId: maintenanceRef.id,
        technicianId: userId,
        technicianName,
        description: description.trim(),
        changedParts: changedParts || null,
        previousCondition,
        createdAt: FieldValue.serverTimestamp(),
      };

      transaction.set(maintenanceRef, maintenanceData);

      // Write to audit log
      const auditLogRef = db.collection("auditLog").doc();
      transaction.set(auditLogRef, {
        action: "logMaintenance",
        adminUid: userId,
        targetId: bikeId,
        timestamp: FieldValue.serverTimestamp(),
        details: {
          description: description.trim(),
          changedParts: changedParts || null,
        },
      });
    });

    logger.info("logMaintenance success", { userId, bikeId });
    return { success: true, bikeId };
  } catch (error: unknown) {
    logger.error("logMaintenance error", { userId, bikeId, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Transaction failed.");
  }
});
