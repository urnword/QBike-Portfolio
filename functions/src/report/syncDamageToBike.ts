import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export const syncDamageToBike = onDocumentCreated("reports/{reportId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const reportData = snapshot.data();
  const reportId = snapshot.id;

  // We only sync if there is a linked bike.
  if (!reportData.linkedBikeId) return;

  const validTypes = ["damage_return", "damage_midride", "collection_issue"];
  if (!validTypes.includes(reportData.type)) return;

  // For collection issues, maybe it's not damage. But any issue linked to the bike
  // is good to log in the bike's history. We'll write it anyway.
  
  const bikeId = reportData.linkedBikeId;
  const payload = reportData.payload || {};

  try {
    const db = getFirestore();
    const damageRef = db.collection("bikes").doc(bikeId).collection("damages").doc(reportId);

    let matrixNumber: string | null = null;
    const userId = reportData.userId;
    if (userId && userId !== "system") {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        matrixNumber = userSnap.data()?.matrixNumber || null;
      }
    }

    const damageData = {
      id: reportId,
      reportType: reportData.type,
      issueType: payload.issueType || null,
      issueDescription: payload.issueDescription || null,
      reportedBy: reportData.userId || "system",
      reportedByMatrix: matrixNumber,
      reportedAt: reportData.createdAt || Timestamp.now(),
      issuePhotoPath: payload.issuePhotoPath || payload.returnPhotoPath || null,
    };

    await damageRef.set(damageData);
    logger.info(`syncDamageToBike: Synced report ${reportId} to bike ${bikeId} damages.`);
  } catch (error) {
    logger.error(`syncDamageToBike: Failed to sync report ${reportId} to bike ${bikeId}`, { error });
  }
});
