"use client";

import React, { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";

interface QrScannerOverlayProps {
  onScan: (bikeId: string) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

export function QrScannerOverlay({
  onScan,
  onCancel,
  title = "Scan Bike QR",
  subtitle = "Point camera at the QR code on the bike",
}: QrScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);

  // Keep callback reference updated without triggering effect
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let scanner: any = null;
    let destroyed = false;

    (async () => {
      try {
        if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
          setError(
            "Camera access requires a secure connection (HTTPS or localhost). " +
            "If testing locally on mobile, please configure your browser to treat this origin as secure."
          );
          return;
        }

        const QrScanner = (await import("qr-scanner")).default;
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
          setError("No camera detected on this device.");
          return;
        }

        if (!videoRef.current) return;

        scanner = new QrScanner(
          videoRef.current,
          (result: any) => {
            const val = result.data.trim().toUpperCase();
            if (/^B\d{3}$/.test(val)) {
              if (scanner) scanner.pause();
              onScanRef.current(val);
            }
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
          }
        );

        if (!destroyed) {
          try {
            await scanner.start();
            // Check again after async start resolves!
            if (destroyed) {
              try { scanner.destroy(); } catch (e) {}
              if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
                videoRef.current.srcObject = null;
              }
            }
          } catch (e: any) {
            if (!destroyed && e?.name !== "AbortError") {
              throw e;
            }
          }
        }
      } catch (err) {
        if (!destroyed) {
          console.error("Scanner start error:", err);
          setError("Camera permission denied or camera in use. Please check browser settings.");
        }
      }
    })();

    return () => {
      destroyed = true;
      if (scanner) {
        try {
          scanner.destroy();
        } catch (e) {
          console.warn("Error destroying scanner:", e);
        }
      }
      // Explicitly stop all tracks on the video element's srcObject just in case
      const video = videoRef.current;
      if (video && video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
      <div className="p-4 flex items-center justify-between bg-black/80">
        <button onClick={onCancel} className="text-white/70 text-sm font-medium hover:text-white transition-colors">
          ← Cancel
        </button>
        <span className="text-white font-semibold text-sm">{title}</span>
        <div className="w-16" />
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-black">
        {error ? (
          <div className="text-red-400 text-sm p-4 text-center">{error}</div>
        ) : (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
        )}

        {!error && subtitle && (
          <div className="absolute top-10 left-0 right-0 z-10 flex justify-center pointer-events-none">
            <div className="bg-black/50 backdrop-blur-md rounded-full px-6 py-2 border border-white/10 shadow-xl">
              <p className="text-white text-sm font-medium">{subtitle}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
