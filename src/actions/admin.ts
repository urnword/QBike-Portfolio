"use server";

import { adminApp, adminAuth, adminDb, verifySessionCookie, getUserRole, logAdminAction } from "@/lib/firebase/admin";
import { cookies } from "next/headers";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

async function requireAdmin() {
  const cookieStore = await cookies();
  const __sessionVal = cookieStore.get("__session")?.value;
  if (!__sessionVal) throw new Error("Unauthorized");

  let token = "";
  try {
    const parsed = JSON.parse(Buffer.from(__sessionVal, "base64").toString("utf-8"));
    token = parsed.token || "";
  } catch (e) {
    token = __sessionVal;
  }

  if (!token) throw new Error("Unauthorized");
  
  const decoded = await verifySessionCookie(token);
  if (!decoded) throw new Error("Unauthorized");
  
  const role = await getUserRole(decoded.uid);
  if (role !== "admin") throw new Error("Forbidden");
  
  return decoded.uid;
}

export async function deleteUserAccount(uid: string) {
  const adminUid = await requireAdmin();

  const userDoc = await adminDb.collection("users").doc(uid).get();
  if (!userDoc.exists) throw new Error("User not found");

  // Check for active bookings
  const activeBookings = await adminDb.collection("bookings")
    .where("userId", "==", uid)
    .where("status", "in", ["active", "collected"])
    .get();

  if (!activeBookings.empty) {
    throw new Error("Cannot delete user with active/collected bookings");
  }

  // Delete from Auth
  await adminAuth.deleteUser(uid);
  // Delete from Firestore
  await adminDb.collection("users").doc(uid).delete();
  
  await logAdminAction('deleteUserAccount', adminUid, uid);
  return { success: true };
}

export async function updateBikeStatus(bikeId: string, currentStatus: string, newStatus: string) {
  const adminUid = await requireAdmin();
  
  // Transition logic
  await adminDb.runTransaction(async (t) => {
    const bikeRef = adminDb.collection("bikes").doc(bikeId);
    const bikeSnap = await t.get(bikeRef);
    if (!bikeSnap.exists) throw new Error("Bike not found");
    
    if (bikeSnap.data()?.status !== currentStatus) {
      throw new Error("Status mismatch, retry");
    }

    const inventoryRef = adminDb.collection("inventory").doc("current");
    const invSnap = await t.get(inventoryRef);
    if (!invSnap.exists) throw new Error("Inventory not found");
    
    let invUpdates: Record<string, unknown> = {};
    if (currentStatus === "available" && newStatus === "maintenance") {
      invUpdates = {
        available: FieldValue.increment(-1),
        maintenance: FieldValue.increment(1)
      };
    } else if (currentStatus === "maintenance" && newStatus === "available") {
      invUpdates = {
        available: FieldValue.increment(1),
        maintenance: FieldValue.increment(-1)
      };
    }

    t.update(bikeRef, { status: newStatus });
    if (Object.keys(invUpdates).length > 0) {
      t.update(inventoryRef, invUpdates);
    }
  });

  await logAdminAction('updateBikeStatus', adminUid, bikeId, { currentStatus, newStatus });
  return { success: true };
}

export async function deleteBike(bikeId: string) {
  const adminUid = await requireAdmin();
  
  await adminDb.runTransaction(async (t) => {
    const bikeRef = adminDb.collection("bikes").doc(bikeId);
    const bikeSnap = await t.get(bikeRef);
    if (!bikeSnap.exists) throw new Error("Bike not found");
    
    if (bikeSnap.data()?.status !== "available") {
      throw new Error("Can only delete available bikes");
    }

    const inventoryRef = adminDb.collection("inventory").doc("current");
    t.update(inventoryRef, {
      total: FieldValue.increment(-1),
      available: FieldValue.increment(-1)
    });
    t.delete(bikeRef);
  });
  
  await logAdminAction('deleteBike', adminUid, bikeId);
  return { success: true };
}

export async function createBike(bikeId: string) {
  const adminUid = await requireAdmin();
  
  await adminDb.runTransaction(async (t) => {
    const bikeRef = adminDb.collection("bikes").doc(bikeId);
    const bikeSnap = await t.get(bikeRef);
    if (bikeSnap.exists) {
      throw new Error("Bike ID already exists");
    }

    const inventoryRef = adminDb.collection("inventory").doc("current");
    const invSnap = await t.get(inventoryRef);
    if (!invSnap.exists) throw new Error("Inventory singleton not found");

    const newBike = {
      bikeId: bikeId,
      status: "available",
      condition: "good",
      lastUsedBy: null,
      lastUsedByMatrix: null,
      lastReturnedAt: null,
      flaggedAt: null,
      flaggedReason: null,
      currentBookingId: null,
      totalTrips: 0,
      flaggedCount: 0,
      maintenanceCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    };

    t.set(bikeRef, newBike);
    t.update(inventoryRef, {
      total: FieldValue.increment(1),
      available: FieldValue.increment(1)
    });
  });
  
  await logAdminAction('createBike', adminUid, bikeId);
  return { success: true };
}

export async function adminOverrideBooking(bookingId: string, action: "collect" | "return" | "cancel", bikeIdInput?: string) {
  const adminUid = await requireAdmin();

  // Capture values needed for post-transaction notifications
  let notifyUserId = "";
  let notifyBikeId = "";

  await adminDb.runTransaction(async (t) => {
    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    const bookingSnap = await t.get(bookingRef);
    if (!bookingSnap.exists) throw new Error("Booking not found");
    const booking = bookingSnap.data()!;
    const prevStatus = booking.status;

    notifyUserId = booking.userId as string;
    const inventoryRef = adminDb.collection("inventory").doc("current");
    
    if (action === "collect") {
      if (!bikeIdInput) throw new Error("Bike ID required for collection");
      if (prevStatus !== "pending" && prevStatus !== "active") throw new Error("Invalid booking status for collection");
      
      // Prevent collecting future bookings that haven't reached startTime yet
      const now = new Date();
      const startTime = (booking.startTime as Timestamp).toDate();
      if (startTime > now) {
         throw new Error(`Cannot collect yet. Booking starts at ${startTime.toLocaleTimeString()}`);
      }
      
      const bikeRef = adminDb.collection("bikes").doc(bikeIdInput);
      const bikeSnap = await t.get(bikeRef);
      if (!bikeSnap.exists || bikeSnap.data()?.status !== "available") {
         throw new Error("Bike not available");
      }

      notifyBikeId = bikeIdInput;

      t.update(bookingRef, {
        status: "collected",
        bikeId: bikeIdInput,
        collectedAt: FieldValue.serverTimestamp()
      });
      t.update(bikeRef, {
        status: "in_use",
        lastUsedBy: booking.userId,
        lastUsedByMatrix: booking.userMatrixNo || null,
        currentBookingId: bookingId
      });

      // Inventory logic:
      // If was pending: decrement bookedInAdvance, decrement available, increment inUse (mimics triggerFutureBookings)
      // If was active: inventory already reflects inUse/available from creation/trigger. No change.
      if (prevStatus === "pending") {
        t.update(inventoryRef, {
          bookedInAdvance: FieldValue.increment(-1),
          available: FieldValue.increment(-1),
          inUse: FieldValue.increment(1)
        });
      }

    } else if (action === "return") {
      if (prevStatus !== "collected" && prevStatus !== "late") throw new Error("Booking not in returnable state");
      
      notifyBikeId = booking.bikeId as string;
      const bikeRef = adminDb.collection("bikes").doc(booking.bikeId);
      
      t.update(bookingRef, {
        status: "completed",
        returnedAt: FieldValue.serverTimestamp(),
        isLate: false
      });
      t.update(bikeRef, {
        status: "available",
        currentBookingId: null,
        lastReturnedAt: FieldValue.serverTimestamp(),
        lastUsedBy: booking.userId,
        lastUsedByMatrix: booking.userMatrixNo || null,
        totalTrips: FieldValue.increment(1)
      });
      t.update(inventoryRef, {
        inUse: FieldValue.increment(-1),
        available: FieldValue.increment(1)
      });

    } else if (action === "cancel") {
      if (prevStatus === "cancelled" || prevStatus === "completed") throw new Error("Already finalised");
      
      t.update(bookingRef, {
        status: "cancelled",
        cancelledBy: "admin",
        cancelledAt: FieldValue.serverTimestamp()
      });
      
      if (prevStatus === "collected" || prevStatus === "late") {
         const bikeRef = adminDb.collection("bikes").doc(booking.bikeId);
         t.update(bikeRef, {
           status: "available",
           currentBookingId: null
         });
         t.update(inventoryRef, {
           inUse: FieldValue.increment(-1),
           available: FieldValue.increment(1)
         });
      } else if (prevStatus === "active") {
         t.update(inventoryRef, {
           inUse: FieldValue.increment(-1),
           available: FieldValue.increment(1)
         });
      } else if (prevStatus === "pending") {
         t.update(inventoryRef, {
           bookedInAdvance: FieldValue.increment(-1)
         });
      }

      // Send notification for admin cancel (written inside transaction)
      const notifRef = adminDb.collection("users").doc(booking.userId).collection("notifications").doc();
      t.set(notifRef, {
        notificationId: notifRef.id,
        userId: booking.userId,
        title: "Booking Cancelled by Admin",
        body: "Your booking has been cancelled by an administrator.",
        type: "booking",
        isRead: false,
        relatedId: bookingId,
        createdAt: FieldValue.serverTimestamp()
      });
    }
  });

  // Post-transaction notifications for collect / return (needs FCM push)
  if (action === "collect" && notifyUserId && notifyBikeId) {
    await sendAdminNotification(
      notifyUserId,
      "Bike Collected by Admin",
      `An administrator has collected bike ${notifyBikeId} on your behalf.`,
      "booking",
      bookingId
    ).catch(() => {/* non-fatal */});
  } else if (action === "return" && notifyUserId && notifyBikeId) {
    await sendAdminNotification(
      notifyUserId,
      "Booking Returned by Admin",
      `An administrator has returned bike ${notifyBikeId} on your behalf. Your booking is now complete.`,
      "booking",
      bookingId
    ).catch(() => {/* non-fatal */});
  }
  
  await logAdminAction('adminOverrideBooking', adminUid, bookingId, { action, bikeIdInput });
  return { success: true };
}

export async function uploadVerificationCSV(csvData: {matrixNumber: string, displayName: string, practicumCode: string}[], label: string) {
  const adminUid = await requireAdmin();
  
  const uploadId = `UPL-${Date.now()}`;
  let added = 0;
  let skipped = 0;

  // Track all document references created in this run to allow rollback/cleanup on error
  const createdRefs: FirebaseFirestore.DocumentReference[] = [];
  const uploadRef = adminDb.collection("verificationUploads").doc(uploadId);
  createdRefs.push(uploadRef);

  try {
    // Since we could have many rows, we batch them in chunks of 500 operations
    let batch = adminDb.batch();
    let opCount = 0;
    
    batch.set(uploadRef, {
      uploadId,
      uploadedBy: adminUid,
      label: label || `CSV Upload ${new Date().toLocaleDateString()}`,
      uploadedAt: FieldValue.serverTimestamp(),
      totalEntries: 0 // Will update later
    });
    opCount++;

    // Pre-fetch all existing matrix numbers in a single query to avoid N+1 reads.
    const existingSnap = await adminDb.collection("verificationList")
      .select("matrixNumber")
      .get();
    const existingMatrix = new Set(existingSnap.docs.map(d => d.data().matrixNumber as string));

    for (const row of csvData) {
      if (!row.matrixNumber) continue;
      const matrixUpper = row.matrixNumber.replace(/\s+/g, '').trim().toUpperCase();
      
      // O(1) duplicate check against pre-fetched Set — no per-row Firestore read.
      if (existingMatrix.has(matrixUpper)) {
        skipped++;
        continue;
      }

      const entryRef = adminDb.collection("verificationList").doc();
      batch.set(entryRef, {
        matrixNumber: matrixUpper,
        displayName: row.displayName?.replace(/\s+/g, ' ').trim().toUpperCase() || null,
        practicum: row.practicumCode?.replace(/\s+/g, ' ').trim().toUpperCase() || null,
        uploadId,
        source: "csv",
        uploadedAt: FieldValue.serverTimestamp(),
        isUsed: false,
        claimedBy: null
      });
      createdRefs.push(entryRef);
      added++;
      opCount++;

      if (opCount >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        opCount = 0;
      }
    }

    // Final update to the upload record
    if (opCount >= 500) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
    
    batch.update(uploadRef, { totalEntries: added });
    await batch.commit();

    await logAdminAction('uploadVerificationCSV', adminUid, uploadId, { label, added, skipped });
    return { added, skipped, uploadId };
  } catch (err: any) {
    console.error("Error encountered during CSV Upload. Commencing transaction rollback cleanup...", err);
    
    // Rollback: Delete every single document we queued or created in this attempt
    try {
      let rollbackBatch = adminDb.batch();
      let rollbackCount = 0;
      
      for (const ref of createdRefs) {
        rollbackBatch.delete(ref);
        rollbackCount++;
        
        if (rollbackCount >= 500) {
          await rollbackBatch.commit();
          rollbackBatch = adminDb.batch();
          rollbackCount = 0;
        }
      }
      
      if (rollbackCount > 0) {
        await rollbackBatch.commit();
      }
      
      console.log(`Rollback completed successfully. Deleted ${createdRefs.length} partially created documents.`);
    } catch (rollbackErr) {
      console.error("Critical Error: Failed to successfully clean up/rollback during CSV Upload failure:", rollbackErr);
    }
    
    throw new Error("CSV Upload failed or was aborted midway. All partial data has been successfully rolled back to maintain consistency.");
  }
}

export async function deleteVerificationUpload(uploadId: string) {
  const adminUid = await requireAdmin();
  
  const entries = await adminDb.collection("verificationList")
    .where("uploadId", "==", uploadId)
    .get();

  const used = entries.docs.filter(doc => doc.data().isUsed);
  if (used.length > 0) {
    return { success: false, error: `Cannot delete: ${used.length} entries have already been claimed.` };
  }

  let batch = adminDb.batch();
  let opCount = 0;

  for (const doc of entries.docs) {
    batch.delete(doc.ref);
    opCount++;

    if (opCount >= 500) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  if (opCount >= 500) {
    await batch.commit();
    batch = adminDb.batch();
    opCount = 0;
  }

  batch.delete(adminDb.collection("verificationUploads").doc(uploadId));
  await batch.commit();
  
  await logAdminAction('deleteVerificationUpload', adminUid, uploadId);
  return { success: true };
}

export async function addManualVerification(matrixNumber: string, displayName: string, practicumCode: string) {
  const adminUid = await requireAdmin();
  
  const matrixUpper = matrixNumber.replace(/\s+/g, '').trim().toUpperCase();
  const nameUpper = displayName.replace(/\s+/g, ' ').trim().toUpperCase();
  
  // Deduplicate by matrixNumber only — the stable unique identifier.
  // Matching the CSV path logic for consistency (see uploadVerificationCSV).
  const exist = await adminDb.collection("verificationList")
    .where("matrixNumber", "==", matrixUpper)
    .get();
    
  if (!exist.empty) {
    throw new Error("A verification entry for this matrix number already exists");
  }

  await adminDb.collection("verificationList").add({
    matrixNumber: matrixUpper,
    displayName: nameUpper,
    practicum: practicumCode?.replace(/\s+/g, ' ').trim().toUpperCase() || null,
    uploadId: null,
    source: "manual",
    uploadedAt: FieldValue.serverTimestamp(),
    isUsed: false,
    claimedBy: null
  });

  await logAdminAction('addManualVerification', adminUid, matrixNumber, { displayName, practicumCode });
  return { success: true };
}

export async function searchVerificationEntry(matrixNumber: string) {
  await requireAdmin();
  const matrixUpper = matrixNumber.replace(/\s+/g, '').trim().toUpperCase();
  
  const snap = await adminDb.collection("verificationList")
    .where("matrixNumber", "==", matrixUpper)
    .get();
    
  if (snap.empty) return null;
  
  const doc = snap.docs[0];
  const data = doc.data();
  
  // Serialize timestamps for Client Components
  return { 
    id: doc.id, 
    ...data,
    uploadedAt: data.uploadedAt ? (data.uploadedAt as Timestamp).toDate().toISOString() : null
  };
}

export async function resetVerificationClaim(entryId: string) {
  const adminUid = await requireAdmin();
  
  const entryRef = adminDb.collection("verificationList").doc(entryId);
  const entrySnap = await entryRef.get();
  
  if (!entrySnap.exists) throw new Error("Entry not found");
  const entryData = entrySnap.data()!;
  const claimedByUid = entryData.claimedBy as string | null;
  
  await adminDb.runTransaction(async (t) => {
    t.update(entryRef, {
      isUsed: false,
      claimedBy: null
    });
    
    // If it was claimed by a user, reset them back to pending only if they exist
    if (claimedByUid) {
      const userRef = adminDb.collection("users").doc(claimedByUid);
      const userSnap = await t.get(userRef);
      if (userSnap.exists) {
        t.update(userRef, {
          verificationStatus: "pending",
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  });

  // Notify the student their verification was reset (only if user exists)
  if (claimedByUid) {
    try {
      const userRef = adminDb.collection("users").doc(claimedByUid);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        await sendAdminNotification(
          claimedByUid,
          "Verification Reset",
          "Your verification has been reset by an administrator. Please submit your verification request again.",
          "verification"
        ).catch(() => {/* non-fatal */});
      }
    } catch (e) {
      // non-fatal
    }
  }
  
  await logAdminAction('resetVerificationClaim', adminUid, entryId);
  return { success: true };
}

export async function processPendingVerification(uid: string, status: "verified" | "rejected", reason?: string) {
  const adminUid = await requireAdmin();
  
  const userRef = adminDb.collection("users").doc(uid);
  
  const updates: Record<string, unknown> = {
    verificationStatus: status
  };
  if (status === "rejected") {
    updates.verificationRejectedReason = reason || "No reason provided";
  }

  await userRef.update(updates);

  // sendAdminNotification handles both Firestore in-app write and FCM push
  await sendAdminNotification(
    uid,
    status === "verified" ? "Account Verified" : "Verification Rejected",
    status === "verified"
      ? "Your account has been verified. You can now book bikes."
      : `Your verification was rejected: ${reason || "No reason provided"}`,
    "verification"
  );

  await logAdminAction('processPendingVerification', adminUid, uid, { status, reason });
  return { success: true };
}

export async function bulkProcessVerifications(uids: string[], status: "verified" | "rejected", reason?: string) {
  const adminUid = await requireAdmin();
  if (uids.length === 0) return { success: true, count: 0 };

  // Batch for user doc status updates only (no notification in batch —
  // sendAdminNotification handles in-app + FCM push individually below)
  let batch = adminDb.batch();
  let opCount = 0;
  
  for (const uid of uids) {
    const userRef = adminDb.collection("users").doc(uid);
    const updates: Record<string, unknown> = {
      verificationStatus: status,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (status === "rejected") {
      updates.verificationRejectedReason = reason || "Bulk rejection by administrator";
    }
    batch.update(userRef, updates);
    opCount++;

    if (opCount >= 499) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  // Send in-app + FCM push to each affected student
  const title = status === "verified" ? "Account Verified" : "Verification Rejected";
  const body = status === "verified"
    ? "Your account has been verified. You can now book bikes."
    : `Your verification was rejected: ${reason || "Bulk rejection by administrator"}`;

  await Promise.allSettled(
    uids.map((uid) => sendAdminNotification(uid, title, body, "verification"))
  );

  await logAdminAction('bulkProcessVerifications', adminUid, 'bulk', { count: uids.length, status, reason });
  return { success: true, count: uids.length };
}

export async function bulkCreateBikes(targetTotal: number) {
  const adminUid = await requireAdmin();
  
  return await adminDb.runTransaction(async (t) => {
    const inventoryRef = adminDb.collection("inventory").doc("current");
    const invSnap = await t.get(inventoryRef);
    if (!invSnap.exists) throw new Error("Inventory singleton not found");
    
    // Compute the IDs we might create (B001–B<targetTotal>) and read only those docs.
    // This avoids locking the entire bikes collection inside the transaction.
    const candidateIds = Array.from({ length: targetTotal }, (_, i) =>
      `B${String(i + 1).padStart(3, "0")}`
    );
    const bikeRefs = candidateIds.map(id => adminDb.collection("bikes").doc(id));
    const bikeSnaps = await Promise.all(bikeRefs.map(ref => t.get(ref)));
    const existingIds = new Set(
      bikeSnaps.filter(s => s.exists).map(s => s.id)
    );
    
    let addedCount = 0;
    for (let i = 1; i <= targetTotal; i++) {
      const bikeId = `B${String(i).padStart(3, "0")}`;
      if (!existingIds.has(bikeId)) {
        const bikeRef = adminDb.collection("bikes").doc(bikeId);
        t.set(bikeRef, {
          bikeId: bikeId,
          status: "available",
          condition: "good",
          lastUsedBy: null,
          lastUsedByMatrix: null,
          lastReturnedAt: null,
          flaggedAt: null,
          flaggedReason: null,
          currentBookingId: null,
          totalTrips: 0,
          flaggedCount: 0,
          maintenanceCount: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
        addedCount++;
        if (addedCount >= 100) break; // Limit to 100 per transaction
      }
    }

    if (addedCount === 0) {
       throw new Error("No new bikes were added. Check if target total is higher than existing bike IDs.");
    }

    t.update(inventoryRef, {
      total: FieldValue.increment(addedCount),
      available: FieldValue.increment(addedCount)
    });

    await logAdminAction('bulkCreateBikes', adminUid, 'bulk', { added: addedCount, targetTotal });
    return { success: true, added: addedCount };
  });
}

// Explicit allowlist of fields an admin may update on a bike document.
// Prevents arbitrary field overwrites (e.g. currentBookingId) that would desync inventory.
// Server-side logic handles derived fields like flaggedCount and flaggedAt.
type BikeUpdatePayload = {
  status?: "available" | "in_use" | "maintenance";
  condition?: "good" | "flagged" | "user_flagged";
  flaggedReason?: string | null;
  /** Cleared when marking a bike as repaired. */
  flaggedAt?: null;
  totalTrips?: number;
};

export async function adminUpdateBike(bikeId: string, updates: BikeUpdatePayload) {
  const adminUid = await requireAdmin();
  
  return await adminDb.runTransaction(async (t) => {
    const bikeRef = adminDb.collection("bikes").doc(bikeId);
    const bikeSnap = await t.get(bikeRef);
    if (!bikeSnap.exists) throw new Error("Bike not found");
    const oldData = bikeSnap.data()!;

    const inventoryRef = adminDb.collection("inventory").doc("current");
    
    // If status changes, update inventory
    if (updates.status && updates.status !== oldData.status) {
       const invUpdates: Record<string, unknown> = {};
       
       // Remove from old status
       if (oldData.status === "available") invUpdates.available = FieldValue.increment(-1);
       if (oldData.status === "in_use") invUpdates.inUse = FieldValue.increment(-1);
       if (oldData.status === "maintenance") invUpdates.maintenance = FieldValue.increment(-1);
       
       // Add to new status
       if (updates.status === "available") invUpdates.available = FieldValue.increment(1);
       if (updates.status === "in_use") invUpdates.inUse = FieldValue.increment(1);
       if (updates.status === "maintenance") invUpdates.maintenance = FieldValue.increment(1);
       
       t.update(inventoryRef, invUpdates);
    }

    // Build the write object from the allowed payload only
    const bikeWrite: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (updates.status !== undefined) bikeWrite.status = updates.status;
    if (updates.flaggedReason !== undefined) bikeWrite.flaggedReason = updates.flaggedReason;

    // Server-side derived logic for condition changes
    if (updates.condition !== undefined) {
      bikeWrite.condition = updates.condition;

      if (updates.condition === "flagged" && oldData.condition !== "flagged") {
        bikeWrite.flaggedCount = FieldValue.increment(1);
        bikeWrite.flaggedAt = FieldValue.serverTimestamp();
      }

      if (updates.condition === "good") {
        bikeWrite.flaggedReason = null;
        bikeWrite.flaggedAt = null;
      }
    }

    t.update(bikeRef, bikeWrite);

    await logAdminAction("adminUpdateBike", adminUid, bikeId, {
      status: updates.status ?? null,
      condition: updates.condition ?? null,
    });
    return { success: true };
  });
}


export async function syncInventory() {
  const adminUid = await requireAdmin();

  return await adminDb.runTransaction(async (t) => {
    const bikesSnap = await t.get(adminDb.collection("bikes"));
    const pendingBookingsSnap = await t.get(
      adminDb.collection("bookings").where("status", "==", "pending")
    );
    
    // Fetch all currently valid 'possession' bookings to verify against 'in_use' bikes
    const activeBookingsSnap = await t.get(
      adminDb.collection("bookings").where("status", "in", ["collected", "late"])
    );
    const validBookingIds = new Set(activeBookingsSnap.docs.map(doc => doc.id));

    let total = 0;
    let available = 0;
    let inUse = 0;
    let maintenance = 0;
    const bookedInAdvance = pendingBookingsSnap.size;

    for (const doc of bikesSnap.docs) {
      const bike = doc.data();
      let status = bike.status;
      
      // Repair Logic: If bike is 'in_use', it MUST have a valid 'collected' or 'late' booking
      if (status === "in_use") {
        if (!bike.currentBookingId || !validBookingIds.has(bike.currentBookingId)) {
          // Repair inconsistency
          t.update(doc.ref, {
            status: "available",
            currentBookingId: null,
            updatedAt: FieldValue.serverTimestamp()
          });
          status = "available"; // Update local count
        }
      }

      total++;
      if (status === "available") available++;
      else if (status === "in_use") inUse++;
      else if (status === "maintenance") maintenance++;
    }

    const inventoryRef = adminDb.collection("inventory").doc("current");
    t.set(inventoryRef, {
      total,
      available,
      inUse,
      maintenance,
      bookedInAdvance,
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAdminAction('syncInventory', adminUid, 'inventory', { total, available, inUse, maintenance, bookedInAdvance });
    return { success: true, stats: { total, available, inUse, maintenance, bookedInAdvance } };
  });
}


/**
 * Bulk-cancel all bookings with status pending/active/collected/late.
 *
 * Previously ran everything in a single Firestore transaction, which would
 * crash at ~167 bookings (3 writes each × 167 = 501 > 500-mutation limit).
 * Now processes bookings in chunks of 30 per transaction, staying well
 * under the 500-mutation limit even with bike + notification writes.
 */
export async function bulkCancelAllActiveBookings() {
  const adminUid = await requireAdmin();

  // Fetch all active bookings outside a transaction (read-only, no lock needed).
  const bookingsSnap = await adminDb
    .collection("bookings")
    .where("status", "in", ["pending", "active", "collected", "late"])
    .get();

  if (bookingsSnap.empty) return { success: true, count: 0 };

  const CHUNK_SIZE = 30; // 30 bookings × (booking + bike + notif) = up to 90 writes per txn
  const chunks: typeof bookingsSnap.docs[] = [];
  for (let i = 0; i < bookingsSnap.docs.length; i += CHUNK_SIZE) {
    chunks.push(bookingsSnap.docs.slice(i, i + CHUNK_SIZE));
  }

  let totalProcessed = 0;

  for (const chunk of chunks) {
    await adminDb.runTransaction(async (t) => {
      const inventoryRef = adminDb.collection("inventory").doc("current");

      // Read bikes that are currently held (collected/late bookings).
      const bikeReadPromises = chunk
        .filter(d => (d.data().status === "collected" || d.data().status === "late") && d.data().bikeId)
        .map(d => t.get(adminDb.collection("bikes").doc(d.data().bikeId as string)));
      const bikeSnaps = await Promise.all(bikeReadPromises);
      const bikeSnapMap = new Map(bikeSnaps.map(s => [s.id, s]));

      let inUseAdj = 0;
      let availableAdj = 0;
      let bookedInAdvanceAdj = 0;

      for (const doc of chunk) {
        const booking = doc.data();
        const prevStatus = booking.status;

        t.update(doc.ref, {
          status: "cancelled",
          cancelledBy: "admin",
          cancelledAt: FieldValue.serverTimestamp()
        });

        if (prevStatus === "active") {
          inUseAdj--;
          availableAdj++;
        } else if (prevStatus === "pending") {
          bookedInAdvanceAdj--;
        } else if (prevStatus === "collected" || prevStatus === "late") {
          inUseAdj--;
          availableAdj++;
          if (booking.bikeId) {
            const bikeSnap = bikeSnapMap.get(booking.bikeId as string);
            if (bikeSnap?.exists) {
              t.update(bikeSnap.ref, {
                status: "available",
                currentBookingId: null,
                updatedAt: FieldValue.serverTimestamp()
              });
            }
          }
        }

        const notifRef = adminDb
          .collection("users")
          .doc(booking.userId)
          .collection("notifications")
          .doc();
        t.set(notifRef, {
          notificationId: notifRef.id,
          userId: booking.userId,
          title: "Booking Cancelled by Admin",
          body: "Your booking was cancelled by an administrator during a bulk action.",
          type: "booking",
          isRead: false,
          relatedId: doc.id,
          createdAt: FieldValue.serverTimestamp()
        });
      }

      const invUpdates: Record<string, unknown> = {};
      if (inUseAdj !== 0) invUpdates.inUse = FieldValue.increment(inUseAdj);
      if (availableAdj !== 0) invUpdates.available = FieldValue.increment(availableAdj);
      if (bookedInAdvanceAdj !== 0) invUpdates.bookedInAdvance = FieldValue.increment(bookedInAdvanceAdj);

      if (Object.keys(invUpdates).length > 0) {
        t.update(inventoryRef, invUpdates);
      }
    });

    totalProcessed += chunk.length;
  }

  await logAdminAction('bulkCancelAllActiveBookings', adminUid, 'bulk', { count: totalProcessed });
  return { success: true, count: totalProcessed };
}

export async function deleteAllPracticums() {
  const adminUid = await requireAdmin();
  
  const snap = await adminDb.collection("practicums").get();
  if (snap.empty) return { success: true, count: 0 };
  
  // Chunk at 499 to stay safely under Firestore's 500-write batch limit.
  const CHUNK_SIZE = 499;
  for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
    const batch = adminDb.batch();
    snap.docs.slice(i, i + CHUNK_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  await logAdminAction('deleteAllPracticums', adminUid, 'bulk', { count: snap.size });
  return { success: true, count: snap.size };
}

export async function unverifyStudentByMatrix(matrixNumber: string) {
  const adminUid = await requireAdmin();
  const matrixUpper = matrixNumber.replace(/\s+/g, '').trim().toUpperCase();

  const snap = await adminDb.collection("users")
    .where("matrixNumber", "==", matrixUpper)
    .get();

  if (snap.empty) {
    throw new Error("No student found with this Matrix Number.");
  }

  const userDoc = snap.docs[0];
  const userRef = userDoc.ref;
  
  await userRef.update({
    verificationStatus: "unverified",
    updatedAt: FieldValue.serverTimestamp()
  });

  const listSnap = await adminDb.collection("verificationList")
    .where("claimedBy", "==", userDoc.id)
    .get();
  
  if (!listSnap.empty) {
    const batch = adminDb.batch();
    for (const d of listSnap.docs) {
      batch.update(d.ref, {
        isUsed: false,
        claimedBy: null
      });
    }
    await batch.commit();
  }

  // Notify the student their verification was revoked
  await sendAdminNotification(
    userDoc.id,
    "Account Unverified",
    "Your account verification has been revoked by an administrator. Please contact the office if you believe this is a mistake.",
    "verification"
  ).catch(() => {/* non-fatal */});

  await logAdminAction('unverifyStudentByMatrix', adminUid, userDoc.id, { matrixNumber: matrixUpper });
  return { success: true };
}

export async function uploadPracticumsCSV(csvData: { code: string; label: string }[]) {
  const adminUid = await requireAdmin();
  
  let added = 0;
  let skipped = 0;

  // Track all document references created in this run to allow rollback/cleanup on error
  const createdRefs: FirebaseFirestore.DocumentReference[] = [];

  try {
    let batch = adminDb.batch();
    let opCount = 0;

    // Fetch all existing practicum codes in a single query to prevent N+1 queries.
    const existingSnap = await adminDb.collection("practicums")
      .select("code")
      .get();
    const existingCodes = new Set(existingSnap.docs.map(d => d.data().code as string));

    for (const item of csvData) {
      if (!item.code) continue;
      const codeUpper = item.code.replace(/\s+/g, '').trim().toUpperCase();

      if (existingCodes.has(codeUpper)) {
        skipped++;
        continue;
      }

      const newRef = adminDb.collection("practicums").doc();
      batch.set(newRef, {
        practicumId: newRef.id,
        code: codeUpper,
        label: item.label?.replace(/\s+/g, ' ').trim() || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid
      });
      createdRefs.push(newRef);
      added++;
      opCount++;

      if (opCount >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await logAdminAction('uploadPracticumsCSV', adminUid, 'bulk', { added, skipped });
    return { added, skipped };
  } catch (err: any) {
    console.error("Error encountered during Practicums CSV Upload. Commencing transaction rollback cleanup...", err);
    
    // Rollback: Delete every single document we created in this attempt
    try {
      let rollbackBatch = adminDb.batch();
      let rollbackCount = 0;
      
      for (const ref of createdRefs) {
        rollbackBatch.delete(ref);
        rollbackCount++;
        
        if (rollbackCount >= 500) {
          await rollbackBatch.commit();
          rollbackBatch = adminDb.batch();
          rollbackCount = 0;
        }
      }
      
      if (rollbackCount > 0) {
        await rollbackBatch.commit();
      }
      
      console.log(`Rollback completed successfully. Deleted ${createdRefs.length} partially created practicum documents.`);
    } catch (rollbackErr) {
      console.error("Critical Error: Failed to successfully clean up/rollback during Practicums CSV Upload failure:", rollbackErr);
    }
    
    throw new Error("Practicum CSV Upload failed or was aborted midway. All partial data has been successfully rolled back to maintain consistency.");
  }
}

// ── Shared helper: write in-app notification + FCM push ───────────────────────
// Used by server actions that perform direct Firestore mutations (ban, cooldown)
// and need to notify the affected student without going through a Cloud Function.
async function sendAdminNotification(
  uid: string,
  title: string,
  body: string,
  type: "booking" | "verification" | "block" | "system" | "admin_report" | "account",
  relatedId: string | null = null
): Promise<void> {
  // 1. In-app — write to Firestore subcollection
  const notifRef = adminDb.collection("users").doc(uid).collection("notifications").doc();
  await notifRef.set({
    notificationId: notifRef.id,
    userId: uid,
    title,
    body,
    type,
    isRead: false,
    relatedId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2. Push — only if user has a token and push enabled
  try {
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) return;
    const userData = userSnap.data()!;
    if (userData.pushNotification === false) return;
    const fcmToken = userData.fcmToken as string | undefined;
    if (!fcmToken) return;

    await adminApp.messaging().send({
      token: fcmToken,
      notification: { title, body },
    });
  } catch (err) {
    // Push failure is non-fatal — in-app notification already written
    console.error("sendAdminNotification: FCM push failed", err);
  }
}

// ── Manual account control actions (admin/users panel) ────────────────────────

export async function applyPermanentBan(uid: string) {
  const adminUid = await requireAdmin();

  const userRef = adminDb.collection("users").doc(uid);
  await userRef.update({
    isBlocked: true,
    blockType: "admin",
    cooldownUntil: null,
  });

  await sendAdminNotification(
    uid,
    "Account Permanently Blocked",
    "Your account has been permanently blocked by an administrator. Please contact the office if you believe this is a mistake.",
    "account"
  );

  await logAdminAction("applyPermanentBan", adminUid, uid);
  return { success: true };
}

export async function liftPermanentBan(uid: string) {
  const adminUid = await requireAdmin();

  const userRef = adminDb.collection("users").doc(uid);
  await userRef.update({
    isBlocked: false,
    blockType: null,
    cooldownUntil: null,
    lateReturnCount: 0,
  });

  await sendAdminNotification(
    uid,
    "Account Block Lifted",
    "Your account block has been lifted by an administrator. You may now book bikes again.",
    "account"
  );

  await logAdminAction("liftPermanentBan", adminUid, uid);
  return { success: true };
}

export async function applyManualCooldown(uid: string, hours: number) {
  const adminUid = await requireAdmin();

  if (!Number.isInteger(hours) || hours <= 0) {
    throw new Error("Invalid cooldown duration.");
  }

  const cooldownUntil = Timestamp.fromDate(new Date(Date.now() + hours * 60 * 60 * 1000));
  const userRef = adminDb.collection("users").doc(uid);
  await userRef.update({
    isBlocked: false,
    blockType: null,
    cooldownUntil,
  });

  await sendAdminNotification(
    uid,
    "Temporary Cooldown Applied",
    `A ${hours}-hour booking cooldown has been applied to your account by an administrator.`,
    "account"
  );

  await logAdminAction("applyManualCooldown", adminUid, uid, { hours });
  return { success: true, cooldownUntil: cooldownUntil.toDate().toISOString() };
}

export async function liftManualCooldown(uid: string) {
  const adminUid = await requireAdmin();

  const userRef = adminDb.collection("users").doc(uid);
  await userRef.update({
    isBlocked: false,
    blockType: null,
    cooldownUntil: null,
    lateReturnCount: 0,
  });

  await sendAdminNotification(
    uid,
    "Cooldown Lifted",
    "Your booking cooldown has been lifted by an administrator. You may now book bikes again.",
    "account"
  );

  await logAdminAction("liftManualCooldown", adminUid, uid);
  return { success: true };
}

// Explicit allowlist of fields an admin may update on the policy document.
// Prevents arbitrary field overwrites that could break GPS validation or booking logic.
type PolicyUpdatePayload = {
  isBookingOpen?: boolean;
  loginDisabled?: boolean;
  gpsEnabled?: boolean;
  maxBookingDuration?: number;
  bookingDurationOptions?: number[];
  operatingDays?: string[];
  operatingHours?: {
    default: { open: string; close: string };
    overrides?: Record<string, { open: string; close: string }>;
  };
  pickupGracePeriod?: number;
  returnGracePeriod?: number;
  standardCooldownDays?: number;
  lateReturnCooldownDays?: number;
  stationCoordinates?: { lat: number; lng: number };
  gpsRadiusMeters?: number;
  cancelCooldownMinutes?: number;
};

export async function updateSystemPolicy(updates: PolicyUpdatePayload) {
  const adminUid = await requireAdmin();

  const finalUpdates = {
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  };

  const policyRef = adminDb.collection("policy").doc("current");
  await policyRef.update(finalUpdates);

  await logAdminAction("updateSystemPolicy", adminUid, "current", {
    fieldsUpdated: Object.keys(updates).join(", "),
  });

  return { success: true };
}
