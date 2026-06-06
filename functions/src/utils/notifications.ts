import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { sendPushNotification } from "./push";
import { sendEmail } from "./email";

type NotificationType = "booking" | "verification" | "block" | "system" | "admin_report" | "account";

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType,
  relatedId: string | null = null,
  sendEmailHtml?: string
): Promise<void> {
  const db = getFirestore();
  const notifRef = db.collection("users").doc(userId).collection("notifications").doc();

  // 1. Write to Firestore
  try {
    await notifRef.set({
      notificationId: notifRef.id,
      userId,
      title,
      body,
      type,
      isRead: false,
      relatedId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`Error saving notification to Firestore for user ${userId}:`, error);
    return; // Don't proceed to push/email if DB write fails
  }

  // 2. Send Push Notification
  // Wrap in try-catch so push failures don't block emails
  try {
    await sendPushNotification(userId, title, body);
  } catch (error) {
    logger.error(`Error in sendPushNotification wrapper for user ${userId}:`, error);
  }

  // 3. Send Email (if requested and user has emailNotification enabled)
  if (sendEmailHtml) {
    try {
      // Email notifications are temporarily fully disabled ("coming soon")
      const isEmailEnabled = false; // Flag to easily re-enable in the future
      if (isEmailEnabled) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data()!;
          if (userData.emailNotification === true && userData.email) {
            await sendEmail(
              userData.email as string,
              (userData.displayName as string) || "QBike User",
              title,
              sendEmailHtml
            );
          }
        }
      }
    } catch (error) {
      logger.error(`Error in sendEmail wrapper for user ${userId}:`, error);
    }
  }
}
