"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already running in standalone mode (installed PWA)
    const isStandalone = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    // 2. Check if user dismissed the prompt recently
    const dismissedTime = localStorage.getItem("qbike-pwa-prompt-dismissed");
    if (dismissedTime) {
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      // Show again only after 1 day
      if (now - parseInt(dismissedTime) < oneDay) {
        return;
      }
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const safari = /safari/.test(ua) && !/crios|fxios|opios|twitter|fbios|focus/.test(ua);
    setIsIOS(ios && safari);

    // 4. Capture the beforeinstallprompt event for Android / Chromium browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. For iOS, we can show the prompt immediately after 3 seconds of browsing
    if (ios && safari) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Trigger browser prompt
    await deferredPrompt.prompt();
    
    // Check outcome
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("qbike-pwa-prompt-dismissed", new Date().getTime().toString());
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-6 right-6 left-6 md:left-auto md:max-w-md z-50 rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/95 dark:bg-gray-950/95 shadow-xl backdrop-blur-md p-5 flex flex-col gap-4"
        >
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#1B3392]/10 dark:bg-[#1B3392]/20 text-[#1B3392] flex items-center justify-center">
                <Download className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                  Install QBike App
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Get real-time push notifications for active bookings, return reminders, and instant updates.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Dismiss install prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isIOS ? (
            <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex items-start gap-2.5">
              <Share className="w-4 h-4 text-[#1B3392] shrink-0 mt-0.5" />
              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                To install, tap the <span className="font-semibold">Share</span> icon in Safari, scroll down, and select <span className="font-semibold">"Add to Home Screen"</span>.
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5 w-full mt-1">
              <button
                onClick={handleDismiss}
                className="flex-1 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 transition-all cursor-pointer"
              >
                Later
              </button>
              <button
                onClick={handleInstallClick}
                className="flex-1 py-2 text-xs font-semibold text-white bg-[#1B3392] rounded-xl hover:bg-[#1B3392]/90 shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Install Now
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
