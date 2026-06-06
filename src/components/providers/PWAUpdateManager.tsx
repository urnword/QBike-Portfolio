"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function PWAUpdateManager() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Helper to display the update prompt
    const showUpdateToast = (worker: ServiceWorker) => {
      toast.info("Update Available", {
        description: "A new version of QBike is ready. Update now to get the latest features and security fixes.",
        action: {
          label: "Update",
          onClick: () => {
            // Signal the service worker to skip waiting and activate immediately
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
        cancel: {
          label: "Later",
          onClick: () => {},
        },
        duration: Infinity, // Keep the toast visible until action is taken
        id: "pwa-update-toast",
      });
    };

    // Retrieve active registration
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      // 1. If there is already a waiting service worker on load, show toast
      if (registration.waiting) {
        showUpdateToast(registration.waiting);
      }

      // 2. Listen for new service workers installing
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed") {
            // Only prompt if there's an active controller (meaning this is a real update, not the first load)
            if (navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          }
        });
      });
    });

    // 3. Listen for active controller changes (skipWaiting was called and activated)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      // Perform a clean reload of the page
      window.location.reload();
    });
  }, []);

  return null;
}
