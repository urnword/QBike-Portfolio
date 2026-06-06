"use client";

import { useEffect } from "react";
import { onMessage } from "firebase/messaging";
import { messaging } from "@/lib/firebase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/useAuth";

export function PushNotificationManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let unsubscribe = () => {};

    const setupMessaging = async () => {
      try {
        const msg = await messaging();
        if (msg) {
          unsubscribe = onMessage(msg, (payload) => {
            console.log("Received foreground message:", payload);
            
            const title = payload.notification?.title || "New Notification";
            const body = payload.notification?.body || "";
            
            toast(title, {
              description: body,
              duration: 5000,
              position: "top-right",
            });
          });
        }
      } catch (err) {
        console.error("Failed to setup foreground messaging listener:", err);
      }
    };

    setupMessaging();

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  return null;
}
