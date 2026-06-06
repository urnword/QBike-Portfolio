import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

let _cachedPolicy: Record<string, unknown> | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns /policy/current with a 5-minute module-level in-memory cache.
 *
 * IMPORTANT: Only use this for reads that occur OUTSIDE of Firestore
 * transactions. Inside transactions, always read the policy ref directly
 * via `transaction.get(policyRef)` so Firestore can enforce optimistic locking.
 *
 * Cache is per Cloud Function instance. Multiple instances do not share state,
 * which is expected — policy staleness of up to 5 minutes per instance is safe.
 */
export async function getCachedPolicy(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (_cachedPolicy !== null && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedPolicy;
  }
  const db = getFirestore();
  const snap = await db.collection("policy").doc("current").get();
  if (!snap.exists) {
    throw new Error("POLICY_VIOLATION");
  }
  _cachedPolicy = snap.data() as Record<string, unknown>;
  _cacheTimestamp = now;
  logger.debug("policyCache: refreshed", { age: 0 });
  return _cachedPolicy;
}

/**
 * Immediately invalidates the in-process policy cache.
 * Call this from admin actions that update /policy/current so the
 * next function invocation in the same instance picks up fresh data.
 */
export function invalidatePolicyCache(): void {
  _cachedPolicy = null;
  _cacheTimestamp = 0;
}
