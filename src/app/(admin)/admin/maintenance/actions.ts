"use server";

import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { cookies } from "next/headers";
import { verifySessionCookie, getUserRole, logAdminAction } from "@/lib/firebase/admin";

async function verifyAdmin() {
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

// ─── Killswitches ──────────────────────────────────────────────────────────────

export async function signOutAllUsers() {
  const adminUid = await verifyAdmin();

  try {
    const usersRef = adminDb.collection("users");
    const snapshot = await usersRef.get();

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      batch.update(doc.ref, { sessionVersion: FieldValue.increment(1) });
      count++;

      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    await logAdminAction('signOutAllUsers', adminUid, 'bulk', { count });
    return { success: true, message: `Successfully invalidated sessions for all users.` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to sign out all users.";
    console.error("Sign out all error:", error);
    return { success: false, error: msg };
  }
}

export async function setLoginDisabled(disabled: boolean) {
  const adminUid = await verifyAdmin();

  try {
    await adminDb.collection("policy").doc("current").update({
      loginDisabled: disabled
    });
    await logAdminAction('setLoginDisabled', adminUid, 'policy', { disabled });
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update login status.";
    console.error("Set login disabled error:", error);
    return { success: false, error: msg };
  }
}

// ─── Spring Cleaning ───────────────────────────────────────────────────────────

export async function resetAllCooldowns() {
  const adminUid = await verifyAdmin();

  try {
    const snap = await adminDb.collection("users").where("role", "!=", "admin").get();

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        cooldownUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    await logAdminAction('resetAllCooldowns', adminUid, 'bulk', { count: snap.size });
    return { success: true, message: `Cleared cooldowns for ${snap.size} user(s).` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to reset cooldowns.";
    console.error("Reset cooldowns error:", error);
    return { success: false, error: msg };
  }
}

export async function unblockAllUsers() {
  const adminUid = await verifyAdmin();

  try {
    const snap = await adminDb.collection("users")
      .where("isBlocked", "==", true)
      .get();

    if (snap.empty) {
      return { success: true, message: "No blocked users found. Nothing to do." };
    }

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        isBlocked: false,
        blockType: null,
        blockReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    await logAdminAction('unblockAllUsers', adminUid, 'bulk', { count: snap.size });
    return { success: true, message: `Unblocked ${snap.size} user(s).` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to unblock users.";
    console.error("Unblock all users error:", error);
    return { success: false, error: msg };
  }
}

export async function resetLateReturnCounts() {
  const adminUid = await verifyAdmin();

  try {
    const snap = await adminDb.collection("users").where("role", "!=", "admin").get();

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        lateReturnCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    await logAdminAction('resetLateReturnCounts', adminUid, 'bulk', { count: snap.size });
    return { success: true, message: `Reset late return counters for ${snap.size} user(s).` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to reset late return counts.";
    console.error("Reset late return counts error:", error);
    return { success: false, error: msg };
  }
}

export async function runNewSemesterClean(confirmText: string) {
  const adminUid = await verifyAdmin();

  if (confirmText !== "NEW SEMESTER") {
    return { success: false, error: 'Confirmation text does not match.' };
  }

  try {
    const snap = await adminDb.collection("users").where("role", "!=", "admin").get();

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        cooldownUntil: null,
        isBlocked: false,
        blockType: null,
        blockReason: null,
        lateReturnCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    await logAdminAction('runNewSemesterClean', adminUid, 'bulk', { count: snap.size });
    return { success: true, message: `New semester reset complete. ${snap.size} user(s) had cooldowns cleared, blocks lifted, and late return counters zeroed.` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to run new semester clean.";
    console.error("New semester clean error:", error);
    return { success: false, error: msg };
  }
}

export async function resolveStaleBookings() {
  const adminUid = await verifyAdmin();

  try {
    const policySnap = await adminDb.collection("policy").doc("current").get();
    const maxDuration: number = policySnap.data()?.maxBookingDuration ?? 120;
    const returnGrace: number = policySnap.data()?.returnGracePeriod ?? 10;

    // A booking is stale if it's been in an active possession state longer than
    // (maxDuration + returnGrace + 60 min buffer) with no return
    const staleThresholdMs = (maxDuration + returnGrace + 60) * 60 * 1000;
    const now = Date.now();

    const staleSnap = await adminDb.collection("bookings")
      .where("status", "in", ["active", "collected", "late"])
      .get();

    if (staleSnap.empty) {
      return { success: true, message: "No stale bookings found. System is clean." };
    }

    const stale = staleSnap.docs.filter(doc => {
      const data = doc.data();
      const startedAt = data.scheduledStart?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? 0;
      return (now - startedAt) > staleThresholdMs;
    });

    if (stale.length === 0) {
      return { success: true, message: "No stale bookings found. All active bookings are within their time window." };
    }

    const inventoryRef = adminDb.collection("inventory").doc("current");
    const CHUNK = 30;

    let totalResolved = 0;

    for (let i = 0; i < stale.length; i += CHUNK) {
      const chunk = stale.slice(i, i + CHUNK);

      await adminDb.runTransaction(async (t) => {
        let inUseAdj = 0;
        let availableAdj = 0;
        let bookedAdj = 0;

        for (const doc of chunk) {
          const booking = doc.data();

          t.update(doc.ref, {
            status: "cancelled",
            cancelledBy: "admin_stale_resolve",
            cancelledAt: FieldValue.serverTimestamp(),
          });

          const prevStatus = booking.status;
          if (prevStatus === "active") {
            inUseAdj--;
            availableAdj++;
          } else if (prevStatus === "pending") {
            bookedAdj--;
          } else if (prevStatus === "collected" || prevStatus === "late") {
            inUseAdj--;
            availableAdj++;

            if (booking.bikeId) {
              const bikeRef = adminDb.collection("bikes").doc(booking.bikeId as string);
              t.update(bikeRef, {
                status: "available",
                currentBookingId: null,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
        }

        const invUpdates: Record<string, unknown> = {};
        if (inUseAdj !== 0) invUpdates.inUse = FieldValue.increment(inUseAdj);
        if (availableAdj !== 0) invUpdates.available = FieldValue.increment(availableAdj);
        if (bookedAdj !== 0) invUpdates.bookedInAdvance = FieldValue.increment(bookedAdj);
        if (Object.keys(invUpdates).length > 0) t.update(inventoryRef, invUpdates);
      });

      totalResolved += chunk.length;
    }

    await logAdminAction('resolveStaleBookings', adminUid, 'bulk', { count: totalResolved });
    return { success: true, message: `Resolved ${totalResolved} stale booking(s) and returned bikes to fleet.` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to resolve stale bookings.";
    console.error("Resolve stale bookings error:", error);
    return { success: false, error: msg };
  }
}

// ─── Data Sanitization ─────────────────────────────────────────────────────────

export async function purgeIncidentReports(confirmText: string) {
  const adminUid = await verifyAdmin();

  if (confirmText !== "DELETE INCIDENTS") {
    return { success: false, error: "Confirmation text does not match." };
  }

  try {
    await deleteCollection("incidents");
    await logAdminAction('purgeIncidentReports', adminUid, 'bulk');
    return { success: true, message: "All incident reports have been permanently deleted." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to purge incident reports.";
    console.error("Purge incidents error:", error);
    return { success: false, error: msg };
  }
}

export async function deleteAllBookings(confirmText: string) {
  const adminUid = await verifyAdmin();

  if (confirmText !== "DELETE ALL BOOKINGS") {
    return { success: false, error: "Confirmation text does not match." };
  }

  try {
    const inventoryRef = adminDb.collection("inventory").doc("current");

    await adminDb.runTransaction(async (transaction) => {
      const inventorySnap = await transaction.get(inventoryRef);
      if (!inventorySnap.exists) throw new Error("Inventory not found.");
      const total = inventorySnap.data()?.total || 0;

      transaction.update(inventoryRef, {
        available: total,
        inUse: 0,
        bookedInAdvance: 0,
        maintenance: 0,
      });
    });

    await deleteCollection("bookings");

    const bikesSnap = await adminDb.collection("bikes").get();
    let bikeBatch = adminDb.batch();
    let bikeCount = 0;

    for (const doc of bikesSnap.docs) {
      bikeBatch.update(doc.ref, {
        status: "available",
        currentBookingId: null
      });
      bikeCount++;
      if (bikeCount === 500) {
        await bikeBatch.commit();
        bikeBatch = adminDb.batch();
        bikeCount = 0;
      }
    }
    if (bikeCount > 0) {
      await bikeBatch.commit();
    }

    await logAdminAction('deleteAllBookings', adminUid, 'bulk');
    return { success: true, message: "All bookings deleted and inventory reset." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete all bookings.";
    console.error("Delete all bookings error:", error);
    return { success: false, error: msg };
  }
}

export async function deleteAllNonAdminUsers(confirmText: string) {
  const adminUid = await verifyAdmin();

  if (confirmText !== "DELETE ALL USERS") {
    return { success: false, error: "Confirmation text does not match." };
  }

  try {
    const usersSnap = await adminDb.collection("users").where("role", "!=", "admin").get();

    let batch = adminDb.batch();
    let count = 0;

    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      try {
        await adminAuth.deleteUser(uid);
      } catch (authErr) {
        console.warn(`Could not delete auth user ${uid}`, authErr);
      }

      batch.delete(doc.ref);
      count++;

      if (count === 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    await logAdminAction('deleteAllNonAdminUsers', adminUid, 'bulk', { count });
    return { success: true, message: "All non-admin users have been permanently deleted." };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete all users.";
    console.error("Delete all users error:", error);
    return { success: false, error: msg };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function deleteCollection(collectionPath: string) {
  const collectionRef = adminDb.collection(collectionPath);
  const query = collectionRef.limit(500);

  return new Promise<void>((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query: FirebaseFirestore.Query, resolve: () => void) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}
