import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export async function sendPushNotification(userId: string, title: string, body: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return;

  const userData = userDoc.data()!;
  
  // If pushNotification is disabled in settings, don't send
  if (userData.pushNotification === false) return;

  const token = userData.fcmToken as string | undefined;

  if (!token) {
    return; // Silently return if no token
  }

  try {
    await getMessaging().send({
      token,
      notification: {
        title,
        body,
      },
      // You can add data payload or android/apns specific configs here if needed later
    });
    logger.debug(`Successfully sent push notification to ${userId}`);
  } catch (error: any) {
    logger.error(`Error sending push notification to ${userId}:`, error);
    
    // If token is invalid or unregistered, clear it from the user document
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      await userRef.update({
        fcmToken: null
      });
      logger.info(`Cleared invalid FCM token for user ${userId}`);
    }
  }
}
