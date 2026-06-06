"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { Toaster } from "sonner";
import { PushNotificationManager } from "./PushNotificationManager";
import { AuthProvider } from "./AuthProvider";
import { PWAUpdateManager } from "./PWAUpdateManager";
import { PWAInstallPrompt } from "@/components/shared/PWAInstallPrompt";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LanguageProvider>
        <AuthProvider>
          {children}
          <Toaster />
          <PushNotificationManager />
          <PWAUpdateManager />
          <PWAInstallPrompt />
        </AuthProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}
