"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { CheckCircle2, ShieldX, QrCode, Bike, AlertCircle, MapPin, Loader2, Camera, RotateCcw, Upload, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { db, functions, storage } from "@/lib/firebase/client";
import { doc, getDoc, collection, query, where, onSnapshot, Timestamp, addDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { format } from "date-fns";
import { haversineDistance } from "@/lib/utils/haversine";
import { compressImage } from "@/lib/utils/imageCompression";
import type QrScannerType from "qr-scanner";

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase = "loading" | "gps-check" | "gps-error" | "scanning" | "confirm" | "photo-capture" | "photo-preview" | "condition-report" | "issue-photo-capture" | "uploading" | "success";
type IssueType = "flat_tire" | "loose_chain" | "broken_brake" | "seat_damage" | "frame_damage" | "other";
const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  flat_tire: "Flat Tire",
  loose_chain: "Loose Chain",
  broken_brake: "Broken Brake",
  seat_damage: "Seat Damage",
  frame_damage: "Frame Damage",
  other: "Other",
};
type ScanMode = "collect" | "return";

interface ActiveBooking {
  id: string;
  startTime: Timestamp;
  endTime: Timestamp;
  mode: ScanMode;
  bikeId: string | null;
}

interface GpsCoords { lat: number; lng: number }

// ── Error code → human readable ───────────────────────────────────────────────
function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("GPS_OUT_OF_RANGE"))     return "You must be at the bike station to collect or return a bike.";
  if (msg.includes("GRACE_PERIOD_EXPIRED")) return "Your pickup window has expired. Please make a new booking.";
  if (msg.includes("NO_ACTIVE_BOOKING"))    return "No active booking found on your account.";
  if (msg.includes("NO_COLLECTED_BOOKING")) return "No collected bike found on your account.";
  if (msg.includes("BIKE_NOT_AVAILABLE"))   return "This bike is currently unavailable. Please scan a different bike.";
  if (msg.includes("BIKE_MISMATCH"))        return "This bike does not match your active booking. Please scan the correct bike.";
  if (msg.includes("unauthenticated"))      return "Session expired. Please sign in again.";
  return msg || "An unexpected error occurred.";
}

function formatShortBookingId(id: string): string {
  if (!id) return "";
  const parts = id.split("-");
  if (parts.length === 3) {
    const timestampStr = parts[1];
    const randomStr = parts[2];
    const lastDigitOfTimestamp = timestampStr.charAt(timestampStr.length - 1);
    return `${lastDigitOfTimestamp}-${randomStr}`;
  }
  return id;
}

function formatDamageReason(reason: string): string {
  let formatted = reason;
  const keys: Record<string, string> = {
    flat_tire: "Flat Tire",
    loose_chain: "Loose Chain",
    broken_brake: "Broken Brake",
    seat_damage: "Seat Damage",
    frame_damage: "Frame Damage",
    other: "Other Issue",
    broken_bike: "Broken Bike",
    qr_damaged: "QR Code Damaged",
    bike_damaged: "Bike Damaged",
  };
  
  for (const [key, label] of Object.entries(keys)) {
    const regex = new RegExp(key, "gi");
    formatted = formatted.replace(regex, label);
  }
  return formatted;
}

const scanContent = {
  en: {
    title: "Scan QR",
    home: "Home",
    nav: "Scanner",
    locCheck: "Checking your location...",
    locCheckDesc: "Please allow location access when prompted.",
    locFail: "Location Check Failed",
    processing: "Processing...",
    requestLoc: "Request Location Access",
    noBooking: "No Active Booking",
    noBookingDesc: "You don't have an active booking to collect or return a bike.",
    bookNow: "Book a Bike Now",
    invalidQr: "Invalid QR Code",
    invalidQrDesc: "Please scan a valid QBike QR code on the bike.",
    scanBike: "Scan Bike QR",
    scanBikeDesc: "Align the QR code within the frame to scan",
    statusCollecting: "Collecting Bike...",
    statusReturning: "Returning Bike...",
    collectBike: "Collect Bike",
    returnBike: "Return Bike"
  },
  ms: {
    title: "Imbas QR",
    home: "Utama",
    nav: "Pengimbas",
    locCheck: "Menyemak lokasi anda...",
    locCheckDesc: "Sila benarkan akses lokasi apabila diminta.",
    locFail: "Semakan Lokasi Gagal",
    processing: "Memproses...",
    requestLoc: "Minta Akses Lokasi",
    noBooking: "Tiada Tempahan Aktif",
    noBookingDesc: "Anda tidak mempunyai tempahan aktif untuk mengambil atau memulangkan basikal.",
    bookNow: "Tempah Basikal Sekarang",
    invalidQr: "Kod QR Tidak Sah",
    invalidQrDesc: "Sila imbas kod QR QBike yang sah pada basikal.",
    scanBike: "Imbas QR Basikal",
    scanBikeDesc: "Sejajarkan kod QR di dalam bingkai untuk mengimbas",
    statusCollecting: "Mengambil Basikal...",
    statusReturning: "Memulangkan Basikal...",
    collectBike: "Ambil Basikal",
    returnBike: "Pulang Basikal"
  }
};

// ── Main content ──────────────────────────────────────────────────────────────
function ScannerContent() {
  const { language } = useLanguage();
  const t = scanContent[language];
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryBikeId = (() => {
    const bId = searchParams.get("bikeId")?.trim().toUpperCase();
    return bId && /^B\d{3}$/.test(bId) ? bId : null;
  })();
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase]                 = useState<Phase>("loading");
  const [gpsCoords, setGpsCoords]         = useState<GpsCoords | null>(null);
  const [gpsError, setGpsError]           = useState<string | null>(null);
  const [stationCoords, setStationCoords] = useState<GpsCoords | null>(null);
  const [gpsEnabled, setGpsEnabled]       = useState(true);

  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [noBooking, setNoBooking]         = useState(false);

  const [detectedBike, setDetectedBike]   = useState<string | null>(null);
  const [bikeDocData, setBikeDocData]     = useState<any>(null);
  const [condition, setCondition]         = useState<"good" | "flagged">("good");
  const [confirming, setConfirming]       = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

  const [manualId, setManualId]           = useState("");
  const [cameraError, setCameraError]     = useState<string | null>(null);
  const [performedAction, setPerformedAction] = useState<ScanMode | null>(null);

  // ── Photo capture state ──────────────────────────────────────────────────
  const [capturedPhoto, setCapturedPhoto]     = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCameraError, setPhotoCameraError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress]   = useState("");

  // ── Condition report state ───────────────────────────────────────────────
  const [issueType, setIssueType]             = useState<IssueType>("loose_chain");
  const [issueDescription, setIssueDescription] = useState("");
  const [issuePhoto, setIssuePhoto]           = useState<Blob | null>(null);
  const [issuePhotoPreview, setIssuePhotoPreview] = useState<string | null>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const scannerRef  = useRef<QrScannerType | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const photoVideoRef  = useRef<HTMLVideoElement>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const issueVideoRef  = useRef<HTMLVideoElement>(null);
  const issueStreamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef(false);

  // ── Listen to active booking ───────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid),
      where("status", "in", ["active", "collected", "late"])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (isProcessingRef.current) return;
      if (snap.empty) {
        setActiveBooking(null);
        setNoBooking(true);
      } else {
        const d = snap.docs[0].data();
        setActiveBooking({
          id: snap.docs[0].id,
          startTime: d.startTime as Timestamp,
          endTime:   d.endTime as Timestamp,
          mode:      d.status === "active" ? "collect" : "return",
          bikeId:    d.bikeId as string | null,
        });
        setNoBooking(false);
      }
    });
    return () => unsub();
  }, [authLoading, user]);

  // ── Auto-mismatch check ───────────────────────────────────────────────────
  useEffect(() => {
    if (!detectedBike || !activeBooking) return;
    if (activeBooking.mode === "return" && activeBooking.bikeId && detectedBike !== activeBooking.bikeId) {
      setActionError(`This bike (${detectedBike}) does not match your booked bike (${activeBooking.bikeId}).`);
    } else {
      setActionError(null);
    }
  }, [detectedBike, activeBooking]);

  // ── Fetch bike doc details when detectedBike is set ─────────────────────────
  useEffect(() => {
    if (!detectedBike) {
      setBikeDocData(null);
      return;
    }
    const bikeRef = doc(db, "bikes", detectedBike);
    getDoc(bikeRef).then((snap) => {
      if (snap.exists()) {
        setBikeDocData(snap.data());
      }
    }).catch((err) => {
      console.error("Error fetching bike data:", err);
    });
  }, [detectedBike]);

  // ── Fetch policy then start GPS ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user || phase !== "loading") return;
    setPhase("gps-check");

    (async () => {
      try {
        const policySnap = await getDoc(doc(db, "policy", "current"));
        const policy = policySnap.data() ?? {};
        const enabled        = (policy.gpsEnabled as boolean) ?? true;
        const station        = (policy.stationCoordinates as GpsCoords) ?? { lat: 0, lng: 0 };
        const radiusMeters   = (policy.gpsRadiusMeters as number) ?? 100;

        setGpsEnabled(enabled);
        setStationCoords(station);

        if (!enabled) {
          setGpsCoords({ lat: 0, lng: 0 });
          if (queryBikeId) {
            setDetectedBike(queryBikeId);
            setPhase("confirm");
          } else {
            setPhase("scanning");
          }
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            const dist = haversineDistance(lat, lng, station.lat, station.lng);
            if (dist > radiusMeters) {
              setGpsError(
                `You are ${Math.round(dist)}m from the bike station (max ${radiusMeters}m). ` +
                `Please move closer to the station at ${station.lat.toFixed(5)}, ${station.lng.toFixed(5)}.`
              );
              setPhase("gps-error");
            } else {
              setGpsCoords({ lat, lng });
              if (queryBikeId) {
                setDetectedBike(queryBikeId);
                setPhase("confirm");
              } else {
                setPhase("scanning");
              }
            }
          },
          () => {
            setGpsError("Location access was denied. Please allow location access and try again.");
            setPhase("gps-error");
          },
          { enableHighAccuracy: true, timeout: 10_000 }
        );
      } catch {
        setGpsCoords({ lat: 0, lng: 0 });
        if (queryBikeId) {
          setDetectedBike(queryBikeId);
          setPhase("confirm");
        } else {
          setPhase("scanning");
        }
      }
    })();
  }, [authLoading, user, phase, queryBikeId]);

  // ── Start QR scanner when phase = scanning ─────────────────────────────────
  useEffect(() => {
    if (phase !== "scanning" || !videoRef.current) return;

    let destroyed = false;
    setCameraError(null);

    (async () => {
      try {
        // Security check for mobile browsers
        if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
          setCameraError("Camera access requires a secure connection (HTTPS). Please access via localhost or HTTPS.");
          return;
        }

        const QrScanner = (await import("qr-scanner")).default;
        
        // Check if camera is available
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
          setCameraError("No camera detected on this device. Please use manual entry.");
          return;
        }

        const scanner = new QrScanner(
          videoRef.current!,
          (result) => {
            const val = result.data.trim().toUpperCase();
            if (/^B\d{3}$/.test(val)) {
              scanner.pause();
              if (activeBooking?.mode === "return" && activeBooking.bikeId && val !== activeBooking.bikeId) {
                setActionError(`This bike (${val}) does not match your booked bike (${activeBooking.bikeId}). Please scan the correct bike.`);
              } else {
                setActionError(null);
              }
              setDetectedBike(val);
              setPhase("confirm");
            }
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
          }
        );

        if (!destroyed) {
          scannerRef.current = scanner;
          try {
            await scanner.start();
            // Keep a ref to the stream for cleanup
            const vid = videoRef.current;
            if (vid && vid.srcObject instanceof MediaStream) {
              streamRef.current = vid.srcObject;
            }
          } catch (err) {
            console.error("Scanner start error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
              setCameraError("Camera permission was denied. Please enable it in browser settings.");
            } else {
              setCameraError("Failed to start camera. It might be in use by another app.");
            }
          }
        }
      } catch (err) {
        console.error("QrScanner init error:", err);
        setCameraError("Could not initialize the camera. Please use manual entry.");
      }
    })();

    return () => {
      destroyed = true;
      scannerRef.current?.destroy();
      scannerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [phase]);


  // ── Helper: stop a camera stream ──────────────────────────────────────────
  const stopStream = useCallback((streamRefObj: React.MutableRefObject<MediaStream | null>) => {
    streamRefObj.current?.getTracks().forEach((t) => t.stop());
    streamRefObj.current = null;
  }, []);

  // ── Start photo camera (return photo or issue photo) ──────────────────────
  const startCamera = useCallback(async (
    vidRef: React.RefObject<HTMLVideoElement | null>,
    strmRef: React.MutableRefObject<MediaStream | null>,
    onError: (msg: string) => void,
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      strmRef.current = stream;
      if (vidRef.current) {
        vidRef.current.srcObject = stream;
        await vidRef.current.play();
      }
    } catch {
      onError("Camera access denied. Please allow camera permissions.");
    }
  }, []);


  // ── Photo capture effect — start camera when entering photo-capture ───────
  useEffect(() => {
    if (phase !== "photo-capture") return;
    setPhotoCameraError(null);
    startCamera(photoVideoRef, photoStreamRef, setPhotoCameraError);
    return () => stopStream(photoStreamRef);
  }, [phase, startCamera, stopStream]);

  // ── Issue camera effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "issue-photo-capture") return;
    startCamera(issueVideoRef, issueStreamRef, () => setPhase("condition-report"));
    return () => stopStream(issueStreamRef);
  }, [phase, startCamera, stopStream]);

  // ── Handle confirm (collect: call directly, return: go to photo capture) ──
  const handleConfirm = async () => {
    if (!activeBooking || !detectedBike || !gpsCoords) return;
    if (activeBooking.mode === "return") {
      // Ensure scanned bike matches expected return bike
      if (activeBooking.bikeId && detectedBike !== activeBooking.bikeId) {
        setActionError(`This bike (${detectedBike}) does not match your booked bike (${activeBooking.bikeId}). Please scan the correct bike.`);
        return;
      }
      // For returns, move to photo capture first
      setPhase("photo-capture");
      return;
    }
    // Collect mode — unchanged
    isProcessingRef.current = true;
    setConfirming(true);
    setActionError(null);
    try {
      const fn = httpsCallable(functions, "collectBike");
      await fn({ bikeId: detectedBike, lat: gpsCoords.lat, lng: gpsCoords.lng });
      
      // If they collected via a manually entered bike ID (indicating damaged QR), automatically log a report
      if (queryBikeId && user) {
        try {
          const reportId = doc(collection(db, "reports")).id;
          await addDoc(collection(db, "reports"), {
            reportId,
            type: "collection_issue",
            severity: "medium",
            status: "open",
            payload: {
              bikeId: queryBikeId,
              bookingId: activeBooking.id,
              issueType: "qr_damaged",
              issueDescription: "User collected bike manually because QR code sticker was damaged.",
            },
            linkedBookingId: activeBooking.id,
            linkedBikeId: queryBikeId,
            userId: user.uid,
            userFullName: (user.displayName || "Unknown").replace(/\s+/g, " ").trim(),
            userMatrixNo: (user.matrixNumber || "Unknown").replace(/\s+/g, "").trim(),
            resolvedBy: null,
            resolvedAt: null,
            resolutionNote: null,
            notifiedAt: null,
            notifiedVia: null,
            createdAt: new Date(),
          });
        } catch (reportErr) {
          console.error("Failed to automatically report damaged QR on collection:", reportErr);
        }
      }

      setPerformedAction("collect");
      setPhase("success");
    } catch (err) {
      isProcessingRef.current = false;
      setActionError(parseError(err));
    } finally {
      setConfirming(false);
    }
  };

  // ── Capture return photo ──────────────────────────────────────────────────
  const handleCapturePhoto = useCallback(async () => {
    const video = photoVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.92)
    );
    setCapturedPhoto(blob);
    const url = URL.createObjectURL(blob);
    setPhotoPreviewUrl(url);
    stopStream(photoStreamRef);
    setPhase("photo-preview");
  }, [stopStream]);

  // ── Retake return photo ───────────────────────────────────────────────────
  const handleRetakePhoto = useCallback(() => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setCapturedPhoto(null);
    setPhotoPreviewUrl(null);
    setPhase("photo-capture");
  }, [photoPreviewUrl]);

  // ── Confirm photo → go to condition report ────────────────────────────────
  const handlePhotoAccepted = useCallback(() => {
    // Phase 1: AI stub always passes. In Phase 2, add Gemini vision call here.
    setCondition("good");
    setPhase("condition-report");
  }, []);

  // ── Capture issue photo ───────────────────────────────────────────────────
  const handleCaptureIssuePhoto = useCallback(async () => {
    const video = issueVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.92)
    );
    setIssuePhoto(blob);
    setIssuePhotoPreview(URL.createObjectURL(blob));
    stopStream(issueStreamRef);
    setPhase("condition-report");
  }, [stopStream]);

  // ── Final return submission: compress → upload → call returnBike ───────────
  const handleReturnSubmit = useCallback(async () => {
    // Validate: description required when issueType is 'other'
    if (condition === "flagged" && issueType === "other" && !issueDescription.trim()) {
      setActionError("Please describe the issue when selecting \"Other\".");
      return;
    }
    if (!activeBooking || !detectedBike || !gpsCoords || !capturedPhoto || !user) return;
    isProcessingRef.current = true;
    setPhase("uploading");
    setActionError(null);

    try {
      // 1. Compress return photo
      setUploadProgress("Compressing photo...");
      const compressed = await compressImage(capturedPhoto, 300);

      // 2. Upload return photo
      setUploadProgress("Uploading return photo...");
      const returnPath = `return-photos/${user.uid}/${activeBooking.id}.jpg`;
      const returnRef = ref(storage, returnPath);
      await uploadBytes(returnRef, compressed, { contentType: "image/jpeg" });

      // 3. Upload issue photo if present
      let issuePath: string | undefined;
      if (condition === "flagged" && issuePhoto) {
        setUploadProgress("Uploading issue photo...");
        const compressedIssue = await compressImage(issuePhoto, 300);
        issuePath = `issue-photos/${user.uid}/${activeBooking.id}.jpg`;
        const issueRef = ref(storage, issuePath);
        await uploadBytes(issueRef, compressedIssue, { contentType: "image/jpeg" });
      }

      // 4. Call returnBike Cloud Function
      setUploadProgress("Completing return...");
      const fn = httpsCallable(functions, "returnBike");
      await fn({
        bikeId: detectedBike,
        lat: gpsCoords.lat,
        lng: gpsCoords.lng,
        condition,
        returnPhotoPath: returnPath,
        ...(condition === "flagged" && {
          issueType,
          issueDescription: issueDescription.trim() || undefined,
          issuePhotoPath: issuePath,
        }),
      });

      setPerformedAction("return");
      
      // If they returned via a manually entered bike ID (indicating damaged QR), automatically log a collection_issue report
      if (queryBikeId && user) {
        try {
          const reportId = doc(collection(db, "reports")).id;
          await addDoc(collection(db, "reports"), {
            reportId,
            type: "collection_issue",
            severity: "medium",
            status: "open",
            payload: {
              bikeId: queryBikeId,
              bookingId: activeBooking.id,
              issueType: "qr_damaged",
              issueDescription: "User returned bike manually because QR code sticker was damaged.",
              issuePhotoPath: null,
              rescheduleMinutes: null,
              action: "reported",
            },
            linkedBookingId: activeBooking.id,
            linkedBikeId: queryBikeId,
            userId: user.uid,
            userFullName: (user.displayName || "Unknown").replace(/\s+/g, " ").trim(),
            userMatrixNo: (user.matrixNumber || "Unknown").replace(/\s+/g, "").trim(),
            resolvedBy: null,
            resolvedAt: null,
            resolutionNote: null,
            notifiedAt: null,
            notifiedVia: null,
            createdAt: new Date(),
          });
        } catch (reportErr) {
          console.error("Failed to automatically report damaged QR on return:", reportErr);
        }
      }

      setPhase("success");
    } catch (err) {
      isProcessingRef.current = false;
      setActionError(parseError(err));
      setPhase("condition-report");
    }
  }, [activeBooking, detectedBike, gpsCoords, capturedPhoto, user, condition, issueType, issueDescription, issuePhoto]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualId.trim().toUpperCase();
    if (!/^B\d{3}$/.test(val)) {
      setActionError("Bike ID must match format B001–B999.");
      return;
    }
    if (activeBooking?.mode === "return" && activeBooking.bikeId && val !== activeBooking.bikeId) {
      setActionError(`This bike (${val}) does not match your booked bike (${activeBooking.bikeId}).`);
      return;
    }
    setActionError(null);
    setDetectedBike(val);
    setPhase("confirm");
  };

  const restartScan = () => {
    setDetectedBike(null);
    setActionError(null);
    setManualId("");
    setCapturedPhoto(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setCondition("good");
    setIssueType("loose_chain");
    setIssueDescription("");
    setIssuePhoto(null);
    if (issuePhotoPreview) URL.revokeObjectURL(issuePhotoPreview);
    setIssuePhotoPreview(null);
    setPhase("scanning");
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading || phase === "loading") return <LoadingSpinner className="mx-auto mt-20" />;


  if (noBooking && phase !== "success") return (
    <Shell>
      <EmptyState icon={<AlertCircle className="h-10 w-10 text-amber-500" />} title="No Active Booking" body="You need an active reservation to use the scanner.">
        <Link href="/book" className="mt-6 inline-block bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
          Book a Bike
        </Link>
      </EmptyState>
    </Shell>
  );

  // ── GPS checking ───────────────────────────────────────────────────────────
  if (phase === "gps-check") return (
    <Shell>
      <div className="flex flex-col items-center justify-center gap-4 p-16 bg-card rounded-2xl border border-border shadow-sm text-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="font-semibold text-foreground">{t.locCheck}</p>
        <p className="text-sm text-muted-foreground">{t.locCheckDesc}</p>
      </div>
    </Shell>
  );

  // ── GPS error ──────────────────────────────────────────────────────────────
  if (phase === "gps-error") return (
    <Shell>
      <div className="flex flex-col items-center justify-center gap-4 p-10 bg-card rounded-2xl border border-destructive/30 shadow-sm text-center">
        <div className="h-14 w-14 bg-red-50 rounded-full flex items-center justify-center">
          <ShieldX className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{t.locFail}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{gpsError}</p>
        {stationCoords && (
          <a
            href={`https://maps.google.com/?q=${stationCoords.lat},${stationCoords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary font-medium hover:underline"
          >
            <MapPin className="h-4 w-4" /> View Station on Maps
          </a>
        )}
        <button onClick={() => { setPhase("loading"); }} className="mt-2 bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors text-sm">
          Retry
        </button>
      </div>
    </Shell>
  );



  // ── Confirm popup + scanner view ───────────────────────────────────────────
  return (
    <Shell>
      <div className="grid grid-cols-1 gap-7">
        {/* Scanner card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-5 md:p-8 border-b border-border">
            <h1 className="text-xl md:text-[22px] font-medium text-foreground mb-1">
              {activeBooking?.mode === "return" ? "Return Bike" : "Collect Bike"}
            </h1>
            <p className="text-muted-foreground text-[14px]">
              Scan the QR code on the bike to proceed.
            </p>
          </div>

          <div className="p-4 md:p-10 flex flex-col items-center">
            {/* Viewfinder */}
            <div className="w-full max-w-xl aspect-square bg-[#0a0a0c] rounded-3xl relative overflow-hidden flex items-center justify-center shadow-2xl border-4 border-muted/30 group">
              {/* Video */}
              <video ref={videoRef} autoPlay playsInline muted
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${cameraError ? "opacity-20" : "opacity-80 group-hover:opacity-100"}`} />

              {/* Camera Error State */}
              {cameraError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/40 backdrop-blur-sm">
                  <div className="h-12 w-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <ShieldX className="h-6 w-6 text-red-400" />
                  </div>
                  <p className="text-sm font-medium text-white mb-4 max-w-[240px]">
                    {cameraError}
                  </p>
                  <button 
                    type="button"
                    onClick={() => { setPhase("loading"); setTimeout(() => setPhase("scanning"), 100); }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-all border border-white/20"
                  >
                    Try Camera Again
                  </button>
                </div>
              )}

              {/* Scanning overlay */}
              {!cameraError && (
                <div className="absolute inset-8 md:inset-12 border-2 border-dashed border-white/40 rounded-2xl z-10 pointer-events-none">
                  <div className="h-1 w-full bg-primary absolute top-0 left-0 animate-[scan_3s_ease-in-out_infinite] blur-[2px] shadow-[0_0_20px_rgba(27,51,146,0.8)]" />
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-md" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-md" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-md" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-md" />
                </div>
              )}
            </div>


            {/* Manual entry */}
            <div className="mt-8 w-full max-w-xl text-center">
              <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center">
                <QrCode className="h-4 w-4" /> Center QR code to scan
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {phase === "confirm" && activeBooking && detectedBike && (() => {
        const isMaintenanceOrFlagged = activeBooking.mode === "collect" && (bikeDocData?.status === "maintenance" || bikeDocData?.condition === "flagged");
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal header */}
              <div className="p-6 border-b border-border bg-muted/10 flex items-center gap-4">
                <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Bike className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Confirm {activeBooking.mode === "collect" ? "Pickup" : "Return"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Bike ID: <span className="font-bold text-primary dark:text-blue-500">{detectedBike}</span>
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  <Row label="Booking ID" value={formatShortBookingId(activeBooking.id)} mono />
                  <Row label="Start"      value={format(activeBooking.startTime.toDate(), "hh:mm a, d MMM")} />
                  <Row label="Return by"  value={format(activeBooking.endTime.toDate(),   "hh:mm a, d MMM")} />
                  {activeBooking.mode === "return" && activeBooking.bikeId && (
                    <Row label="Expected bike" value={activeBooking.bikeId} mono />
                  )}
                </div>

                {isMaintenanceOrFlagged && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-800 dark:text-red-300 text-xs flex flex-col gap-1.5 animate-pulse">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-500" />
                      <span>Bike Locked: Under Maintenance</span>
                    </div>
                    <p className="text-red-700 dark:text-red-400 font-medium">
                      This bike is marked for maintenance by college administration. Checkout is disabled.
                    </p>
                  </div>
                )}

                {activeBooking.mode === "collect" && bikeDocData?.condition === "user_flagged" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex flex-col gap-1.5 animate-pulse">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500 animate-[bounce_1.5s_infinite]" />
                      <span>Caution: Reported Damage</span>
                    </div>
                    <p className="text-amber-700 dark:text-amber-400 leading-normal font-medium font-sans">
                      {(() => {
                        const reason = bikeDocData.flaggedReason || "";
                        let extracted = reason;
                        if (reason.includes("damage reported by")) {
                          const parts = reason.split(":");
                          extracted = parts.length > 1 ? parts.slice(1).join(":").trim() : reason;
                        } else if (reason.includes("damage on return:")) {
                          const parts = reason.split("return:");
                          extracted = parts.length > 1 ? parts.slice(1).join("return:").trim() : reason;
                        }
                        return formatDamageReason(extracted) || "This bike has a reported issue. Please ride with caution.";
                      })()}
                    </p>
                    <p className="text-[10px] text-amber-500/80 dark:text-amber-500/80 font-medium">
                      You can still ride this bike, but please verify it is safe before starting.
                    </p>
                  </div>
                )}

                {actionError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />{actionError}
                  </div>
                )}

                {/* Photo requirement note — return only */}
                {activeBooking.mode === "return" && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg text-blue-700 dark:text-blue-400 text-xs flex items-center gap-2">
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>A photo of the bike is required to complete the return.</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-6 bg-muted/20 flex gap-3">
                <button onClick={restartScan}
                  className="flex-1 px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleConfirm} disabled={confirming || isMaintenanceOrFlagged}
                  className="flex-[2] px-4 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
                  {confirming
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {t.processing}</>
                    : activeBooking.mode === "collect" ? "Confirm Pickup" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Photo capture (return only) ──────────────────────────────────── */}
      {phase === "photo-capture" && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="p-4 flex items-center justify-between bg-black/80">
            <button onClick={restartScan} className="text-white/70 text-sm font-medium hover:text-white transition-colors">
              ← Back
            </button>
            <span className="text-white font-semibold text-sm">Take Bike Photo</span>
            <div className="w-12" />
          </div>

          {/* Camera viewfinder */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <video ref={photoVideoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover" />

            {photoCameraError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/60">
                <ShieldX className="h-10 w-10 text-red-400 mb-3" />
                <p className="text-white text-sm mb-4">{photoCameraError}</p>
                <button onClick={() => setPhase("photo-capture")}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium border border-white/20">
                  Retry
                </button>
              </div>
            )}

            {/* Guide overlay */}
            {!photoCameraError && (
              <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-24">
                <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                  <p className="text-white/80 text-xs text-center">
                    Capture a full side view of the bike
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Capture button */}
          {!photoCameraError && (
            <div className="p-6 bg-black/80 flex justify-center">
              <button onClick={handleCapturePhoto}
                className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                <div className="w-14 h-14 rounded-full bg-white" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Photo preview ────────────────────────────────────────────────── */}
      {phase === "photo-preview" && photoPreviewUrl && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
          <div className="p-4 bg-black/80">
            <span className="text-white font-semibold text-sm">Review Photo</span>
          </div>

          <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreviewUrl} alt="Captured bike" className="max-w-full max-h-full object-contain rounded-xl" />
          </div>

          <div className="p-4 bg-black/80 flex gap-3">
            <button onClick={handleRetakePhoto}
              className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 border border-white/20 transition-colors">
              <RotateCcw className="h-4 w-4" /> Retake
            </button>
            <button onClick={handlePhotoAccepted}
              className="flex-[2] px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Use Photo
            </button>
          </div>
        </div>
      )}

      {/* ── Condition report ─────────────────────────────────────────────── */}
      {phase === "condition-report" && activeBooking && detectedBike && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            <div className="p-6 border-b border-border bg-muted/10">
              <h3 className="text-lg font-bold text-foreground">Bike Condition</h3>
              <p className="text-xs text-muted-foreground mt-1">How was the bike when you returned it?</p>
            </div>

            <div className="p-6 space-y-5">
              {actionError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{actionError}
                </div>
              )}

              {/* Condition selector */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Condition
                </label>
                <div className="flex gap-4">
                  <ConditionBtn active={condition === "good"} onClick={() => setCondition("good")}
                    icon={<CheckCircle2 className={`h-4 w-4 ${condition === "good" ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`} />}
                    label="All Good"
                    activeClass="bg-green-50 dark:bg-green-900/20 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                    labelClass={condition === "good" ? "text-green-800 dark:text-green-400" : "text-muted-foreground"}
                  />
                  <ConditionBtn active={condition === "flagged"} onClick={() => setCondition("flagged")}
                    icon={<AlertCircle className={`h-4 w-4 ${condition === "flagged" ? "text-red-600 dark:text-red-500" : "text-muted-foreground"}`} />}
                    label="Report Issue"
                    activeClass="bg-red-50 dark:bg-red-950/20 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                    labelClass={condition === "flagged" ? "text-red-800 dark:text-red-400" : "text-muted-foreground"}
                  />
                </div>
              </div>

              {/* Issue details — only when flagged */}
              {condition === "flagged" && (
                <div className="space-y-4 pt-4 border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Issue Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(ISSUE_TYPE_LABELS) as [IssueType, string][]).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setIssueType(key)}
                          className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            issueType === key
                              ? "border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                              : "border-border bg-card text-muted-foreground hover:border-red-200"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Description{issueType === "other" ? <span className="text-destructive ml-1">*</span> : " (Optional)"}
                    </label>
                    <textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)}
                      placeholder={issueType === "other" ? "Please describe the issue..." : "Describe the issue briefly..."}
                      className={`w-full px-3 py-2 rounded-lg border bg-card text-foreground text-sm resize-none h-20 focus:outline-none focus:ring-2 transition-all ${
                        issueType === "other" && !issueDescription.trim()
                          ? "border-red-300 dark:border-red-700 focus:ring-red-200 focus:border-red-400"
                          : "border-border focus:ring-primary/30 focus:border-primary"
                      }`}
                      maxLength={500} />
                    {issueType === "other" && !issueDescription.trim() && (
                      <p className="text-xs text-destructive mt-1">Required when selecting &quot;Other&quot;</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Issue Photo (Optional)
                    </label>
                    {issuePhotoPreview ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={issuePhotoPreview} alt="Issue" className="w-full h-32 object-cover rounded-lg border border-border" />
                        <button onClick={() => { if (issuePhotoPreview) URL.revokeObjectURL(issuePhotoPreview); setIssuePhoto(null); setIssuePhotoPreview(null); }}
                          className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/80">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setPhase("issue-photo-capture")}
                        className="w-full px-4 py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground text-xs font-medium hover:border-primary/30 hover:text-primary transition-colors flex items-center justify-center gap-2">
                        <Camera className="h-4 w-4" /> Take Issue Photo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 bg-muted/20 flex gap-3">
              <button onClick={handleRetakePhoto}
                className="flex-1 px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Back
              </button>
              <button onClick={handleReturnSubmit}
                className="flex-[2] px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
                <Upload className="h-4 w-4" /> Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Issue photo capture (full-screen) ───────────────────────────── */}
      {phase === "issue-photo-capture" && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="p-4 flex items-center justify-between bg-black/80">
            <button onClick={() => { stopStream(issueStreamRef); setPhase("condition-report"); }}
              className="text-white/70 text-sm font-medium hover:text-white transition-colors">
              ← Back
            </button>
            <span className="text-white font-semibold text-sm">Take Issue Photo</span>
            <div className="w-12" />
          </div>

          {/* Camera viewfinder */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <video ref={issueVideoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover" />

            {/* Guide overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-24">
              <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                <p className="text-white/80 text-xs text-center">
                  Capture the damaged area clearly
                </p>
              </div>
            </div>
          </div>

          {/* Capture button */}
          <div className="p-6 bg-black/80 flex justify-center">
            <button onClick={handleCaptureIssuePhoto}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
              <div className="w-14 h-14 rounded-full bg-white" />
            </button>
          </div>
        </div>
      )}

      {/* ── Uploading overlay ────────────────────────────────────────────── */}
      {phase === "uploading" && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-200">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">Processing Return</h3>
            <p className="text-sm text-muted-foreground">{uploadProgress}</p>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-8 overflow-y-auto animate-in fade-in duration-200">
          <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-card rounded-2xl border border-border shadow-xl text-center max-w-md w-full animate-in zoom-in-95 duration-300 my-auto">
            <div className="h-20 w-20 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mb-6 border border-green-100 dark:border-green-900/30">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {performedAction === "collect" ? "Bike Collected!" : "Bike Returned!"}
            </h2>
            <p className="text-muted-foreground text-[15px] mb-8 leading-relaxed">
              {performedAction === "collect" 
                ? "Your ride has officially started. Please ensure you follow all safety guidelines." 
                : "The bike has been safely returned to the station. We hope you enjoyed your ride!"}
            </p>
            <button 
              onClick={() => router.push("/dashboard")} 
              className="bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary/90 transition-all w-full shadow-lg shadow-primary/20 active:scale-95"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(calc(100cqb - 8px)); }
          100% { transform: translateY(0); }
        }
      ` }} />
    </Shell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const t = scanContent[language];
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 font-sans gap-y-2 md:gap-y-0">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t.title}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/" className="hover:text-primary transition-colors">{t.home}</Link>
            <span>›</span><span>{t.nav}</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center mt-10 bg-card rounded-2xl border border-border shadow-sm">
      {icon}
      <h2 className="text-xl font-bold mt-4">{title}</h2>
      <p className="text-muted-foreground mt-2 mb-2">{body}</p>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ConditionBtn({ active, onClick, icon, label, activeClass, labelClass }: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  label: string; activeClass: string; labelClass: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 p-3 rounded-xl border-2 transition-all ${active ? activeClass : "bg-card border-border hover:border-primary/20"}`}>
      <div className="flex items-center justify-center gap-2">
        {icon}
        <span className={`text-xs font-bold ${labelClass}`}>{label}</span>
      </div>
    </button>
  );
}

export default function QRScanPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="mx-auto mt-20" />}>
      <ScannerContent />
    </Suspense>
  );
}
