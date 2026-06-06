"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { RotateCcw, CheckCircle2 } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

export function CameraCapture({ onCapture, onCancel, title = "Take Photo", subtitle }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
        setError(
          "Camera access requires a secure connection (HTTPS or localhost). " +
          "If testing locally on mobile, please configure your browser to treat this origin as secure."
        );
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Camera API is not supported in this browser environment.");
        return;
      }

      // First try with back camera and high res
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          if (playErr.name !== "AbortError") console.error("Video play error:", playErr);
        }
      }
    } catch (err) {
      console.warn("High-res environment camera failed, trying fallback constraints:", err);
      try {
        if (!isMountedRef.current) return;
        // Fallback to any available camera with standard resolution
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playErr: any) {
            if (playErr.name !== "AbortError") console.error("Video play error:", playErr);
          }
        }
      } catch (fallbackErr) {
        console.error("Camera access failed completely:", fallbackErr);
        if (isMountedRef.current) {
          setError("Camera access denied. Please allow camera permissions in your browser settings.");
        }
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video && video.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return stopStream;
  }, [startCamera, stopStream]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.92)
    );
    setCapturedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    stopStream();
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  }, [previewUrl, startCamera]);

  const handleAccept = useCallback(() => {
    if (capturedBlob) {
      onCapture(capturedBlob);
    }
  }, [capturedBlob, onCapture]);

  if (previewUrl) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
        <div className="p-4 flex items-center justify-between bg-black/80">
          <span className="text-white font-semibold text-sm">Preview Photo</span>
        </div>
        <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
        <div className="p-4 bg-black/80 flex gap-3">
          <button onClick={handleRetake}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 border border-white/20 transition-colors">
            <RotateCcw className="h-4 w-4" /> Retake
          </button>
          <button onClick={handleAccept}
            className="flex-[2] px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Use Photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
      <div className="p-4 flex items-center justify-between bg-black/80">
        <button onClick={() => { stopStream(); onCancel(); }}
          className="text-white/70 text-sm font-medium hover:text-white transition-colors">
          ← Back
        </button>
        <span className="text-white font-semibold text-sm">{title}</span>
        <div className="w-12" />
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-red-400 text-sm p-4 text-center">{error}</div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover" />
            {subtitle && (
              <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-24">
                <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                  <p className="text-white/80 text-xs text-center">{subtitle}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-6 bg-black/80 flex justify-center">
        <button onClick={handleCapture} disabled={!!error}
          className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:hover:scale-100">
          <div className="w-14 h-14 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}
