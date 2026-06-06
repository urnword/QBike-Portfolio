import { getFunctions } from "firebase-admin/functions";
import { logger } from "firebase-functions/v2";

/**
 * Helper to determine if we are running in the Firebase Emulator suite.
 */
function checkIsEmulator(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.FUNCTIONS_EMULATOR === "1" ||
    !!process.env.FIREBASE_EMULATOR_HUB ||
    !!process.env.FIRESTORE_EMULATOR_HOST
  );
}

/**
 * Enqueue a Cloud Task safely.
 * When running in the emulator, it skips enqueuing to the real cloud to prevent
 * accidental production interactions, as the local emulator does not have 
 * a dedicated Cloud Tasks emulator.
 */
export async function enqueueTask(
  functionName: string,
  payload: any,
  options: { scheduleDelaySeconds?: number; id?: string } = {}
) {
  const isEmulator = checkIsEmulator();
  
  if (isEmulator) {
    logger.info(`[EMULATOR] Skipping real task enqueue for ${functionName}`, {
      payload,
      options,
      tip: `Manually trigger: curl -X POST -H "Content-Type: application/json" -d '{"data": ${JSON.stringify(payload)}}' http://localhost:5001/qbike-app/asia-southeast1/${functionName}`
    });
    return;
  }

  const queuePath = `locations/asia-southeast1/functions/${functionName}`;
  try {
    await getFunctions().taskQueue(queuePath).enqueue(payload, options);
  } catch (error) {
    logger.error(`Failed to enqueue task for ${functionName}`, { error, payload, options });
    // Don't throw if it's a "task already exists" error (optional, but good for idempotency)
    const err = error as any;
    if (err.code === 6 || err.status === 'ALREADY_EXISTS') {
        return;
    }
    throw error;
  }
}

/**
 * Deletes a scheduled task.
 */
export async function deleteTask(functionName: string, taskId: string) {
  const isEmulator = checkIsEmulator();
  
  if (isEmulator) {
    logger.info(`[EMULATOR] Skipping real task deletion for ${functionName}`, { taskId });
    return;
  }

  const queuePath = `locations/asia-southeast1/functions/${functionName}`;
  try {
    await getFunctions().taskQueue(queuePath).delete(taskId);
  } catch (error: any) {
    // If the task already started or was deleted, ignore the error
    if (error.code === 5 || error.code === 404 || error.status === 'NOT_FOUND') {
       return;
    }
    logger.error(`Failed to delete task for ${functionName}`, { error, taskId });
  }
}
