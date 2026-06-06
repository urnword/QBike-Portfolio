import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { ensureSingletons } from "@/lib/firebase/seed-singletons";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "QBike",
  description: "Secure and efficient college bike booking system.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/logo/qbike-192x192.webp", sizes: "192x192", type: "image/webp" },
      { url: "/images/logo/qbike-512x512.webp", sizes: "512x512", type: "image/webp" }
    ],
    shortcut: "/favicon.ico",
    apple: "/images/logo/qbike-192x192.webp",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QBike",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: import("next").Viewport = {
  themeColor: "#1B3392",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ensure required Firestore singletons exist (skip during build)
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    await ensureSingletons();
  }

  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <body className="antialiased font-sans flex min-h-dvh flex-col">
        <Providers>
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
