"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bike, Calendar, Clock, AlertCircle, CheckCircle2,
  MapPin, ArrowRight, AlertTriangle, XCircle, Ban,
  X, Wrench, AlertOctagon, QrCode, MessageSquare, Camera,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { haversineDistance } from "@/lib/utils/haversine";
import { db, messaging } from "@/lib/firebase/client";
import {
  doc, onSnapshot, collection, query, where,
  orderBy, limit, updateDoc
} from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import { BookingDocument } from "@/types";
import { DataTable } from "@/components/shared/DataTable";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { QrScannerOverlay } from "@/components/shared/QrScannerOverlay";
import { compressImage } from "@/lib/utils/imageCompression";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [inventory, setInventory] = useState({
    total: 0,
    available: 0,
    inUse: 0,
    bookedInAdvance: 0,
    maintenance: 0,
  });
  const [activeBooking, setActiveBooking] = useState<Record<string, any> | null>(null);
  const [recentActivity, setRecentActivity] = useState<(BookingDocument & { id: string; date?: string })[]>([]);
  const { policy } = usePolicy();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [distanceToStation, setDistanceToStation] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Report Issue Modal State
  const [reportModal, setReportModal] = useState<"collection" | "midride" | null>(null);
  const [reportIssueType, setReportIssueType] = useState<string>("");
  const [reportBikeId, setReportBikeId] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [rescheduleMinutes, setRescheduleMinutes] = useState<number | null>(null);

  // Mid-ride specific state
  const [midrideWantsSwap, setMidrideWantsSwap] = useState<boolean | null>(null);
  const [midridePhotoPath, setMidridePhotoPath] = useState<string | null>(null);
  const [midridePhotoBlob, setMidridePhotoBlob] = useState<Blob | null>(null);
  const [midridePhotoUploading, setMidridePhotoUploading] = useState(false);
  const [midrideNewBikeId, setMidrideNewBikeId] = useState("");
  const [isCapturingMidridePhoto, setIsCapturingMidridePhoto] = useState(false);
  const [isScanningMidrideQr, setIsScanningMidrideQr] = useState(false);
  const [midrideDamageType, setMidrideDamageType] = useState<string>("");

  // Collection damage specific state
  const [collectionDamageType, setCollectionDamageType] = useState<string>("");
  const [collectionPhotoPath, setCollectionPhotoPath] = useState<string | null>(null);
  const [collectionPhotoBlob, setCollectionPhotoBlob] = useState<Blob | null>(null);
  const [collectionPhotoUploading, setCollectionPhotoUploading] = useState(false);
  const [isCapturingCollectionPhoto, setIsCapturingCollectionPhoto] = useState(false);

  const handleCollectionPhotoCaptured = (blob: Blob) => {
    setIsCapturingCollectionPhoto(false);
    setCollectionPhotoBlob(blob);
    setCollectionPhotoPath(URL.createObjectURL(blob));
  };

  const handleMidridePhotoCaptured = (blob: Blob) => {
    setIsCapturingMidridePhoto(false);
    setMidridePhotoBlob(blob);
    setMidridePhotoPath(URL.createObjectURL(blob)); // Local preview URL
  };

  const closeReportModal = () => {
    if (reportSubmitting) return;
    setReportModal(null);
    setReportIssueType("");
    setReportBikeId("");
    setReportDescription("");
    setReportSuccess(null);
    setReportError(null);
    setRescheduleMinutes(null);
    setMidrideWantsSwap(null);
    setMidrideDamageType("");
    setMidrideNewBikeId("");
    if (midridePhotoPath) {
      URL.revokeObjectURL(midridePhotoPath);
    }
    setMidridePhotoPath(null);
    setMidridePhotoBlob(null);
    setMidridePhotoUploading(false);
    
    setCollectionDamageType("");
    if (collectionPhotoPath) {
      URL.revokeObjectURL(collectionPhotoPath);
    }
    setCollectionPhotoPath(null);
    setCollectionPhotoBlob(null);
    setCollectionPhotoUploading(false);
  };

  const activityColumns = [
    {
      key: "id" as keyof (BookingDocument & { id: string; date?: string }),
      label: t("history.bookingId"),
      align: "center" as const,
      render: (val: string) => (
        <button
          onClick={() => {
            navigator.clipboard.writeText(val);
            alert(`Copied Booking ID: ${val}`);
          }}
          className="font-mono text-xs hover:text-primary hover:underline cursor-pointer focus:outline-none transition-colors"
          title="Click to copy full Booking ID"
        >
          {val ? val.slice(-8).toUpperCase() : "-"}
        </button>
      ),
    },
    {
      key: "date" as keyof (BookingDocument & { id: string; date?: string }),
      label: t("history.date"),
      align: "center" as const,
    },
    {
      key: "bookingType" as keyof (BookingDocument & { id: string; date?: string }),
      label: t("history.type"),
      align: "center" as const,
      render: (val: string) => {
        if (!val) return <span className="text-muted-foreground">-</span>;
        const normalized = val.toLowerCase();
        if (normalized === "ondemand") {
          return <span>On-Demand</span>;
        }
        return <span className="capitalize">{normalized}</span>;
      },
    },
    {
      key: "status" as keyof (BookingDocument & { id: string; date?: string }),
      label: t("history.status"),
      align: "center" as const,
      render: (val: string) => {
        const s = val ? val.toLowerCase() : "";
        const translationKey = `status.${s}`;
        const translatedText = t(translationKey);
        const displayStatus = translatedText === translationKey ? val : translatedText;
        return (
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider ${val === "completed"
              ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-500"
              : val === "cancelled"
                ? "bg-red-100 dark:bg-red-950/30 text-destructive dark:text-red-500"
                : val === "late"
                  ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500"
                  : "bg-blue-100 dark:bg-blue-950/30 text-primary dark:text-blue-500"
              }`}
          >
            {displayStatus}
          </span>
        );
      },
    },
  ];


  useEffect(() => {
    let unsubInventory = () => { };
    let unsubBooking = () => { };
    let unsubActivity = () => { };
    let unsubPolicy = () => { };

    if (user) {
      // 1. Inventory listener — fires only when inventory changes, far cheaper than 60s polling.
      const inventoryRef = doc(db, "inventory", "current");
      unsubInventory = onSnapshot(inventoryRef, (snap) => {
        if (snap.exists()) setInventory(snap.data() as typeof inventory);
      }, (err) => {
        console.error("Error fetching inventory:", err);
      });

      // 2. Active booking listener
      const bookingsRef = collection(db, "bookings");
      const activeQuery = query(
        bookingsRef,
        where("userId", "==", user.uid),
        where("status", "in", ["pending", "active", "collected", "late"])
      );

      unsubBooking = onSnapshot(activeQuery, (snap) => {
        if (!snap.empty) {
          setActiveBooking({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setActiveBooking(null);
        }
      }, (err) => {
        console.error("Error fetching active booking:", err);
      });

      // 3. Recent activity listener — server-sorted DESC, limited to 5.
      //    Uses composite index: bookings(userId ASC, createdAt DESC).
      const activityQuery = query(
        bookingsRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(5)
      );

      unsubActivity = onSnapshot(activityQuery, (snap) => {
        const activities = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as BookingDocument),
        }))
          .map(act => ({
            ...act,
            date: act.createdAt
              ? format(act.createdAt.toDate(), "MMM dd, hh:mm a")
              : "Pending...",
          }));

        setRecentActivity(activities);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching activity:", err);
        setLoading(false);
      });

    } else {
      setLoading(false);
    }

    return () => {
      unsubInventory();
      unsubBooking();
      unsubActivity();
    };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (!policy?.stationCoordinates?.lat || !policy?.stationCoordinates?.lng) return;

    if (typeof window !== "undefined" && navigator.geolocation) {
      const getPos = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            const dist = haversineDistance(
              lat,
              lng,
              policy.stationCoordinates.lat,
              policy.stationCoordinates.lng
            );
            setDistanceToStation(dist);
          },
          (err) => {
            console.error("Error getting geolocation: ", err);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };

      getPos();
      const interval = setInterval(getPos, 30000);
      return () => clearInterval(interval);
    }
  }, [policy]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // FCM Token Logic
    if (user && typeof window !== "undefined" && "Notification" in window) {
      const setupFCM = async () => {
        try {
          if (Notification.permission === "default") {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
              const msg = await messaging();
              if (msg) {
                const token = await getToken(msg, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
                if (token && (user.fcmToken !== token || user.pushNotification !== true)) {
                  await updateDoc(doc(db, "users", user.uid), {
                    fcmToken: token,
                    pushNotification: true,
                  });
                }
              }
            } else {
              await updateDoc(doc(db, "users", user.uid), {
                pushNotification: false,
              });
            }
          } else if (Notification.permission === "granted") {
            const msg = await messaging();
            if (msg) {
              const token = await getToken(msg, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
              if (token && user.fcmToken !== token) {
                await updateDoc(doc(db, "users", user.uid), {
                  fcmToken: token,
                });
              }
            }
          }
        } catch (e) {
          console.log("FCM setup failed", e);
        }
      };
      setupFCM();
    }
  }, [user?.uid, user?.fcmToken, user?.pushNotification]);

  const formatCountdown = (target: Date) => {
    const diff = target.getTime() - currentTime.getTime();
    if (diff <= 0) return "00:00";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (authLoading || loading)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );

  // Determine user eligibility for booking
  const isVerified = user?.verificationStatus === "verified";
  
  const isBlocked = !!user?.isBlocked;
  
  const cooldownUntilMs = user?.cooldownUntil
    ? (user.cooldownUntil as { toMillis: () => number }).toMillis()
    : null;
  const isOnCooldown = !!cooldownUntilMs && cooldownUntilMs > Date.now();

  const lastCancelledAtMs = user?.lastCancelledAt
    ? (user.lastCancelledAt as { toMillis: () => number }).toMillis()
    : null;
  const cancelCooldownMinutes = policy?.cancelCooldownMinutes ?? 10;
  const isUnderCancelCooldown = !!lastCancelledAtMs && (Date.now() - lastCancelledAtMs < cancelCooldownMinutes * 60 * 1000);

  const canBook = isVerified && !isBlocked && !isOnCooldown && !isUnderCancelCooldown && policy?.isBookingOpen !== false;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">

      {/* ─── Status Banners ─── */}

      {/* Blocked */}
      {isBlocked && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <Ban className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">
              {isBlocked ? t("dashboard.status.blocked.title") : t("dashboard.status.blocked.temp")}
            </h3>
            <p className="text-[13px] mt-1 opacity-90">
              {isBlocked
                ? t("dashboard.status.blocked.perm")
                : t("dashboard.status.blocked.temp")}
            </p>
          </div>
        </div>
      )}

      {/* Booking System Closed */}
      {policy && !policy.isBookingOpen && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("dashboard.status.maintenance.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("dashboard.status.maintenance.desc")}
            </p>
          </div>
        </div>
      )}

      {/* Cooldown */}
      {isOnCooldown && (
        <div className={`mb-6 p-4 border ${activeBooking?.status === "late" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-400" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400"} rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2`}>
          {activeBooking?.status === "late" ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
          <div>
            <h3 className="text-sm font-semibold">
              {activeBooking?.status === "late" ? t("dashboard.status.cooldown.late") : t("dashboard.status.cooldown.title")}
            </h3>
            <p className="text-[13px] mt-1 opacity-90">
              {activeBooking?.status === "late"
                ? t("dashboard.status.cooldown.lateDesc")
                : (
                  <>
                    {t("dashboard.status.cooldown.desc")}{" "}
                    {format(
                      (user!.cooldownUntil as { toDate: () => Date }).toDate(),
                      "MMM dd, yyyy hh:mm a"
                    )}.
                  </>
                )}
            </p>
          </div>
        </div>
      )}
      {!isBlocked && !isOnCooldown && isUnderCancelCooldown && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-3 text-amber-800 dark:text-amber-400 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("dashboard.status.cooldown.cancelTitle")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("dashboard.status.cooldown.cancelDesc")}{" "}
              {format(
                new Date(lastCancelledAtMs! + cancelCooldownMinutes * 60 * 1000),
                "MMM dd, yyyy hh:mm a"
              )}.
            </p>
          </div>
        </div>
      )}

      {/* Rejected */}
      {!isBlocked && user?.verificationStatus === "rejected" && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("dashboard.status.rejected.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("dashboard.status.rejected.desc")}
              {user.verificationRejectedReason && (
                <> {t("dashboard.status.rejected.reason")} <span className="font-medium">{user.verificationRejectedReason}</span></>
              )}
            </p>
            <Link href="/profile" className="inline-block mt-2 text-[13px] font-semibold underline">
              {t("dashboard.status.rejected.resubmit")}
            </Link>
          </div>
        </div>
      )}

      {!isBlocked && user?.verificationStatus === "pending" && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-3 text-amber-800 dark:text-amber-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("dashboard.status.pending.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("dashboard.status.pending.desc")}
            </p>
          </div>
        </div>
      )}

      {!isBlocked && user?.verificationStatus === "unverified" && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-start gap-3 text-blue-800 dark:text-blue-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("dashboard.status.unverified.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("dashboard.status.unverified.desc")}
            </p>
          </div>
        </div>
      )}


      {/* ─── Page Header ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-y-2 md:gap-y-0 md:gap-x-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("dashboard.title")}</h2>
            {user?.role === 'staff' && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded-md border border-blue-200 dark:border-blue-800/50">
                Staff
              </span>
            )}
            {user?.role === 'admin' && (
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-bold uppercase tracking-wider rounded-md border border-purple-200 dark:border-purple-800/50">
                Admin
              </span>
            )}
          </div>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/" className="hover:text-primary transition-colors">{t("dashboard.home")}</Link>
            <span>›</span>
            <span>{t("dashboard.title")}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full md:w-auto md:flex md:items-center md:gap-4 mt-1 md:mt-0">
          <div className="bg-card dark:bg-muted/30 border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm w-full md:w-44 transition-colors">
            <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-500 shrink-0">
              <Bike className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">{t("dashboard.available")}</span>
              <span className="text-green-600 dark:text-green-500 text-lg font-semibold leading-none">{inventory.available}</span>
            </div>
          </div>

          <div className="bg-card dark:bg-muted/30 border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm w-full md:w-44 transition-colors">
            <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-destructive dark:text-red-500 shrink-0">
              <Bike className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">{t("dashboard.inUse")}</span>
              <span className="text-destructive dark:text-red-500 text-lg font-semibold leading-none">{inventory.inUse}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
        {/* User Booking Status Card */}
        <div className="lg:col-span-2 bg-card rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col">
          <div className="p-4 md:p-6 border-b border-border">
            <h3 className="text-base md:text-lg font-medium text-foreground">{t("dashboard.bookingStatus")}</h3>
            <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("dashboard.reservationDetails")}</p>
          </div>

          <div className="flex-1 p-4 md:p-6 flex flex-col justify-center items-center text-center">
            {!activeBooking && (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h4 className="text-base font-semibold text-foreground">{t("dashboard.noActiveBookings")}</h4>
                <p className="text-[13px] text-muted-foreground mt-1 mb-6 px-4">
                  {canBook
                    ? t("dashboard.noBookingsStartRiding")
                    : t("dashboard.notEligibleToBook")}
                </p>
                {canBook ? (
                  <Link
                    href="/book"
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full font-medium text-sm transition-all shadow-md active:scale-95"
                  >
                    {t("dashboard.bookABike")} <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="flex items-center gap-2 bg-muted text-muted-foreground px-6 py-2.5 rounded-full font-medium text-sm cursor-not-allowed opacity-60">
                    {t("dashboard.bookABike")} <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </div>
            )}

            {activeBooking && ["collected", "late"].includes(activeBooking.status) && (() => {
              const endTime = activeBooking.endTime ? (activeBooking.endTime as { toDate: () => Date }).toDate() : null;
              const isLate = endTime ? currentTime.getTime() > endTime.getTime() : false;

              return (
                <div className="w-full">
                  <div className="flex items-center justify-center pt-2 mb-6">
                    <div className="relative">
                      <div className={`absolute inset-0 ${isLate ? "bg-red-100 dark:bg-red-950/20" : "bg-green-100 dark:bg-green-950/20"} rounded-full scale-150 animate-pulse opacity-50`} />
                      <div className={`relative w-16 h-16 rounded-full ${isLate ? "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-500" : "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-500"} flex items-center justify-center`}>
                        <Bike className="w-8 h-8" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${isLate ? "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-500" : "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-500"} text-[11px] font-bold uppercase tracking-wider mb-2`}>
                      {isLate ? <AlertTriangle className="w-3.5 h-3.5" /> : null}
                      {isLate ? t("dashboard.lateReturn") : t("dashboard.activeSession")}
                    </div>

                    {endTime && (
                      <div className={`p-3 rounded-lg border flex justify-center ${isLate ? "bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900/50" : "bg-blue-50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900/50"}`}>
                        <div className={`flex items-center gap-2 ${isLate ? "text-red-600 dark:text-red-500 animate-pulse" : "text-primary dark:text-blue-500"} font-bold`}>
                          <Clock className="w-4 h-4" />
                          <span className="text-sm uppercase tracking-wider">
                            {isLate ? t("dashboard.lateBy") : t("dashboard.timeLeft")}
                            {(() => {
                              const diff = Math.abs(endTime.getTime() - currentTime.getTime());
                              const h = Math.floor(diff / 3600000);
                              const m = Math.floor((diff % 3600000) / 60000);
                              const s = Math.floor((diff % 60000) / 1000);
                              return h > 0
                                ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
                                : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
                            })()}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-left">
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">{t("dashboard.bikeId")}</span>
                        <span className="text-sm font-semibold text-foreground">{activeBooking.bikeId as string}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">{t("dashboard.returnBy")}</span>
                        <span className="text-sm font-semibold text-foreground">
                          {endTime ? format(endTime, "hh:mm a") : "---"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                      <Link
                        href="/book/scan?mode=return"
                        className="flex items-center justify-center gap-2 w-full bg-secondary hover:bg-secondary/90 text-white py-3 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 md:flex-1"
                      >
                        {t("dashboard.scanToReturn")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          closeReportModal();
                          setReportModal("midride");
                        }}
                        className="flex items-center justify-center gap-2 w-full bg-red-50 dark:bg-red-950/20 text-[#EC1C24] dark:text-red-500 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30 py-3 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 md:flex-1 cursor-pointer"
                      >
                        <AlertCircle className="w-4 h-4" />
                        {t("dashboard.reportIssue")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeBooking &&
              (activeBooking.status === "pending" || activeBooking.status === "active") && (
                <div className="w-full text-center">
                  <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-500 mx-auto mb-4">
                    <Calendar className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-semibold text-foreground">
                    {activeBooking.bookingType === "future" ? t("dashboard.futureReservation") : t("dashboard.readyToCollect")}
                  </h4>
                  <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-left">
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {format(
                            (activeBooking.startTime as { toDate: () => Date }).toDate(),
                            "MMM dd, hh:mm a"
                          )}
                        </span>
                      </div>

                      {activeBooking.status === "pending" && (
                        <div className="flex items-center gap-2 text-primary dark:text-blue-500 font-bold animate-pulse">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm uppercase tracking-wider">
                            {t("dashboard.startsIn")} {formatCountdown((activeBooking.startTime as { toDate: () => Date }).toDate())}
                          </span>
                        </div>
                      )}

                      {activeBooking.status === "active" && policy && (
                        <div className="flex items-center gap-2 text-destructive dark:text-red-500 font-bold animate-pulse">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm uppercase tracking-wider">
                            {t("dashboard.pickupDeadline")} {formatCountdown(
                              new Date((activeBooking.startTime as { toDate: () => Date }).toDate().getTime() + (policy.pickupGracePeriod || 15) * 60000)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {policy?.stationCoordinates?.lat && policy?.stationCoordinates?.lng ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${policy.stationCoordinates.lat},${policy.stationCoordinates.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors cursor-pointer group"
                      >
                        <MapPin className="w-4 h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="text-xs uppercase font-bold tracking-tight group-hover:underline">
                          {t("dashboard.collectionPoint")}
                          {distanceToStation !== null && (
                            <span className="text-primary font-bold ml-1.5 normal-case">
                              ({distanceToStation < 1000 ? `${Math.round(distanceToStation)}m` : `${(distanceToStation / 1000).toFixed(1)}km`})
                            </span>
                          )}
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs uppercase font-bold tracking-tight">
                          {t("dashboard.collectionPoint")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <div className="flex flex-col md:flex-row gap-3">
                      <Link
                        href="/book/scan?mode=collect"
                        className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 md:flex-1"
                      >
                        {t("dashboard.scanToCollect")}
                      </Link>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={async () => {
                          if (!confirm("Are you sure you want to cancel this booking?")) return;
                          setCancelling(true);
                          try {
                            const { httpsCallable } = await import("firebase/functions");
                            const { functions } = await import("@/lib/firebase/client");
                            const cancelFn = httpsCallable(functions, "cancelBooking");
                            const result = await cancelFn({ bookingId: activeBooking.id });
                            const data = result.data as { success: boolean; error?: string };
                            if (!data.success) {
                              alert("Failed to cancel: " + data.error);
                            }
                          } catch (err: any) {
                            alert("Failed to cancel: " + err.message);
                          } finally {
                            setCancelling(false);
                          }
                        }}
                        className="flex items-center justify-center gap-2 w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 py-3 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 md:flex-1 cursor-pointer disabled:opacity-50"
                      >
                        {cancelling ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-700 dark:border-slate-300 border-t-transparent rounded-full animate-spin" />
                            {t("dashboard.cancelling")}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            {t("dashboard.cancelBooking")}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeReportModal();
                          setReportModal("collection");
                        }}
                        className="flex items-center justify-center gap-2 w-full bg-red-50 dark:bg-red-950/20 text-[#EC1C24] dark:text-red-500 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30 py-3 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 md:flex-1 cursor-pointer"
                      >
                        <AlertCircle className="w-4 h-4" />
                        {t("dashboard.reportIssue")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Bike Status Donut */}
        <div className="bg-card rounded-2xl shadow-sm border border-border">
          <div className="p-4 md:p-6 border-b border-border">
            <h3 className="text-base md:text-lg font-medium text-foreground">{t("dashboard.bikeStatus")}</h3>
            <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("dashboard.inventoryAvailability")}</p>
          </div>
          <div className="p-6 flex flex-col items-center">
            <div className="relative w-44 h-44 shrink-0 rounded-full border-[12px] border-muted flex items-center justify-center">
              {/* Overlapping segments ring */}
              <div
                className="absolute inset-[-12px] rounded-full"
                style={{
                  background: `conic-gradient(
                    #EF4444 0% ${inventory.total > 0 ? (inventory.inUse / inventory.total) * 100 : 0}%, 
                    #22C55E ${inventory.total > 0 ? (inventory.inUse / inventory.total) * 100 : 0}% ${inventory.total > 0 ? ((inventory.inUse + inventory.available) / inventory.total) * 100 : 0}%, 
                    #9CA3AF ${inventory.total > 0 ? ((inventory.inUse + inventory.available) / inventory.total) * 100 : 0}% ${inventory.total > 0 ? ((inventory.inUse + inventory.available + inventory.maintenance) / inventory.total) * 100 : 0}%,
                    transparent ${inventory.total > 0 ? ((inventory.inUse + inventory.available + inventory.maintenance) / inventory.total) * 100 : 0}% 100%
                  )`,
                  WebkitMaskImage: "radial-gradient(transparent 58%, black 60%)",
                  maskImage: "radial-gradient(transparent 58%, black 60%)",
                }}
              />

              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-foreground leading-none">{inventory.total}</span>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">{t("dashboard.totalBikes")}</span>
              </div>
            </div>

            <div className="mt-8 w-full space-y-2.5 pt-6 border-t border-border">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-[13px] font-medium text-muted-foreground">{t("dashboard.available")}</span>
                </div>
                <span className="text-[13px] font-bold text-foreground">{inventory.available}</span>
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-[13px] font-medium text-muted-foreground">{t("dashboard.inUse")}</span>
                </div>
                <span className="text-[13px] font-bold text-foreground">{inventory.inUse}</span>
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <span className="text-[13px] font-medium text-muted-foreground">{t("dashboard.maintenance")}</span>
                </div>
                <span className="text-[13px] font-bold text-foreground">{inventory.maintenance}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log (Recent Activity) */}
        <div className="lg:col-span-3 bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
          <div className="p-6 border-b border-border flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-foreground">{t("dashboard.recentActivity")}</h3>
              <p className="text-[13px] text-muted-foreground">{t("dashboard.recentActivityDesc")}</p>
            </div>
            <Link href="/history" className="text-[13px] text-primary font-medium hover:underline">View All</Link>
          </div>
          <div className="p-0 flex-1">
            {recentActivity.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                {t("dashboard.noRecentActivity")}
              </div>
            ) : (
              <DataTable columns={activityColumns as any} data={recentActivity as any} pageSize={5} />
            )}
          </div>
        </div>








      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          REPORT ISSUE MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      {reportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !reportSubmitting && closeReportModal()} />

          {/* Modal */}
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-card p-5 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {reportModal === "collection" ? t("dashboard.report.collection.title") : t("dashboard.report.midride.title")}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {reportModal === "collection"
                    ? t("dashboard.report.collection.desc")
                    : t("dashboard.report.midride.desc")}
                </p>
              </div>
              <button
                onClick={() => !reportSubmitting && closeReportModal()}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                disabled={reportSubmitting}
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
              {!reportSuccess && (
                <>
                  {/* ─── Collection Issue Types ─── */}
                  {reportModal === "collection" && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">{t("dashboard.report.whatHappened")}</label>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { key: "no_bike_available", icon: <AlertOctagon className="w-5 h-5" />, label: t("dashboard.report.noBike.title"), desc: t("dashboard.report.noBike.desc") },
                            { key: "bike_damaged", icon: <Wrench className="w-5 h-5" />, label: t("dashboard.report.damaged.title"), desc: t("dashboard.report.damaged.desc") },
                            { key: "qr_damaged", icon: <QrCode className="w-5 h-5" />, label: t("dashboard.report.qr.title"), desc: t("dashboard.report.qr.desc") },
                            { key: "other", icon: <MessageSquare className="w-5 h-5" />, label: t("dashboard.report.other.title"), desc: t("dashboard.report.other.desc") },
                          ].map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => { setReportIssueType(opt.key); setReportError(null); }}
                              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                reportIssueType === opt.key
                                  ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                  : "border-border bg-card hover:bg-muted/40"
                              }`}
                            >
                              <div className={`mt-0.5 ${reportIssueType === opt.key ? "text-primary" : "text-muted-foreground"}`}>{opt.icon}</div>
                              <div>
                                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                <span className="text-[12px] text-muted-foreground block mt-0.5">{opt.desc}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* no_bike_available: reschedule or cancel */}
                      {reportIssueType === "no_bike_available" && (
                        <div>
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">What would you like to do?</label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[5, 10, 15].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setRescheduleMinutes(mins)}
                                className={`py-3 rounded-lg border text-sm font-semibold transition-all active:scale-95 ${
                                  rescheduleMinutes === mins
                                    ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary ring-1 ring-primary"
                                    : "border-border bg-card hover:bg-muted/40 text-foreground"
                                }`}
                              >
                                +{mins} min
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setRescheduleMinutes(0)}
                            className={`w-full py-3 rounded-lg border text-sm font-semibold transition-all active:scale-95 ${
                              rescheduleMinutes === 0
                                ? "border-destructive bg-red-50 dark:bg-red-950/20 text-destructive ring-1 ring-destructive"
                                : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            Cancel Without Penalty
                          </button>
                        </div>
                      )}

                      {/* bike_damaged / qr_damaged: optional bike ID */}
                      {(reportIssueType === "bike_damaged" || reportIssueType === "qr_damaged") && (
                        <div>
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                            Bike ID {reportIssueType === "qr_damaged" ? <span className="text-destructive">*</span> : "(Optional)"}
                          </label>
                          <input
                            type="text"
                            value={reportBikeId}
                            onChange={(e) => setReportBikeId(e.target.value.toUpperCase())}
                            placeholder="e.g. B001"
                            maxLength={4}
                            className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                          />
                        </div>
                      )}

                      {/* What's wrong with the bike (for collection bike_damaged) */}
                      {reportIssueType === "bike_damaged" && (
                        <div>
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">{t("dashboard.report.whatsWrong")}</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: "flat_tire", label: t("dashboard.report.flatTire") },
                              { key: "loose_chain", label: t("dashboard.report.looseChain") },
                              { key: "broken_brake", label: t("dashboard.report.brokenBrake") },
                              { key: "seat_damage", label: t("dashboard.report.seatDamage") },
                              { key: "frame_damage", label: t("dashboard.report.frameDamage") },
                              { key: "other", label: t("dashboard.report.otherDamage") },
                            ].map((opt) => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => { setCollectionDamageType(opt.key); setReportError(null); }}
                                className={`py-3 px-3 rounded-xl border text-sm font-medium transition-all active:scale-[0.98] ${
                                  collectionDamageType === opt.key
                                    ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary ring-1 ring-primary"
                                    : "border-border bg-card hover:bg-muted/40 text-foreground"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Photo for collection bike_damaged */}
                      {reportIssueType === "bike_damaged" && (
                        <div>
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Photo (Optional)</label>
                          {collectionPhotoPath ? (
                            <div className="relative animate-in fade-in duration-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={collectionPhotoPath} alt="Collection Issue" className="w-full h-36 object-cover rounded-lg border border-border" />
                              <button
                                type="button"
                                onClick={() => {
                                  if (collectionPhotoPath) URL.revokeObjectURL(collectionPhotoPath);
                                  setCollectionPhotoPath(null);
                                  setCollectionPhotoBlob(null);
                                }}
                                className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/80 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsCapturingCollectionPhoto(true)}
                              disabled={collectionPhotoUploading}
                              className="w-full py-3 rounded-lg border border-dashed border-border bg-card hover:bg-muted/40 text-muted-foreground text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {collectionPhotoUploading ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Camera className="w-4 h-4" /> Take Photo
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Description for bike_damaged, qr_damaged, other */}
                      {(reportIssueType === "bike_damaged" || reportIssueType === "qr_damaged" || reportIssueType === "other") && (
                        <div>
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                            Description{(reportIssueType === "other" || (reportIssueType === "bike_damaged" && collectionDamageType === "other")) ? <span className="text-destructive ml-1">*</span> : " (Optional)"}
                          </label>
                          <textarea
                            value={reportDescription}
                            onChange={(e) => setReportDescription(e.target.value)}
                            placeholder="Describe the issue briefly..."
                            rows={3}
                            maxLength={500}
                            className={`w-full px-4 py-2.5 rounded-lg border bg-card text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                              ((reportIssueType === "other" || (reportIssueType === "bike_damaged" && collectionDamageType === "other")) && !reportDescription.trim())
                                ? "border-destructive focus:border-destructive"
                                : "border-border focus:border-primary"
                            }`}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* ─── Mid-Ride Damage Types ─── */}
                  {reportModal === "midride" && (
                    <>
                      {/* Step 1: Issue Category */}
                      <div>
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">What happened?</label>
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={() => { setReportIssueType("bike_damaged"); setReportError(null); }}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                              reportIssueType === "bike_damaged"
                                ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/40"
                            }`}
                          >
                            <Wrench className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium text-foreground">Bike is Damaged</span>
                              <span className="text-[12px] text-muted-foreground block mt-0.5">An available bike is unrideable</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => { setReportIssueType("qr_damaged"); setReportError(null); }}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                              reportIssueType === "qr_damaged"
                                ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/40"
                            }`}
                          >
                            <QrCode className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium text-foreground">QR Code Damaged</span>
                              <span className="text-[12px] text-muted-foreground block mt-0.5">Can't scan — enter bike ID manually</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => { setReportIssueType("other"); setReportError(null); }}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                              reportIssueType === "other"
                                ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                : "border-border bg-card hover:bg-muted/40"
                            }`}
                          >
                            <MessageSquare className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium text-foreground">Other Issue</span>
                              <span className="text-[12px] text-muted-foreground block mt-0.5">Something else went wrong</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Step 2: Details — shown once category is picked */}
                      {reportIssueType && (
                        <>
                          {reportIssueType === "qr_damaged" && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                                Bike ID <span className="text-destructive ml-1">*</span>
                              </label>
                              <input
                                type="text"
                                value={reportBikeId}
                                onChange={(e) => setReportBikeId(e.target.value.toUpperCase())}
                                placeholder="e.g. B001"
                                maxLength={4}
                                className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                              />
                            </div>
                          )}

                          {reportIssueType === "bike_damaged" && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">{t("dashboard.report.whatsWrong")}</label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { key: "flat_tire", label: t("dashboard.report.flatTire") },
                                  { key: "loose_chain", label: t("dashboard.report.looseChain") },
                                  { key: "broken_brake", label: t("dashboard.report.brokenBrake") },
                                  { key: "seat_damage", label: t("dashboard.report.seatDamage") },
                                  { key: "frame_damage", label: t("dashboard.report.frameDamage") },
                                  { key: "other", label: t("dashboard.report.otherDamage") },
                                ].map((opt) => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => { setMidrideDamageType(opt.key); setReportError(null); }}
                                    className={`py-3 px-3 rounded-xl border text-sm font-medium transition-all active:scale-[0.98] ${
                                      midrideDamageType === opt.key
                                        ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary ring-1 ring-primary"
                                        : "border-border bg-card hover:bg-muted/40 text-foreground"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Description */}
                          {(reportIssueType === "other" || reportIssueType === "bike_damaged") && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                                Description{reportIssueType === "other" || midrideDamageType === "other" ? <span className="text-destructive ml-1">*</span> : " (Optional)"}
                              </label>
                              <textarea
                                value={reportDescription}
                                onChange={(e) => setReportDescription(e.target.value)}
                                placeholder="Describe the issue briefly..."
                                rows={3}
                                maxLength={500}
                                className={`w-full px-4 py-2.5 rounded-lg border bg-card text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                                  (reportIssueType === "other" || midrideDamageType === "other") && !reportDescription.trim()
                                    ? "border-destructive focus:border-destructive"
                                    : "border-border focus:border-primary"
                                }`}
                              />
                            </div>
                          )}

                          {/* Optional photo */}
                          {(reportIssueType === "other" || reportIssueType === "bike_damaged") && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Photo (Optional)</label>
                              {midridePhotoPath ? (
                                <div className="relative animate-in fade-in duration-200">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={midridePhotoPath} alt="Mid-ride Issue" className="w-full h-36 object-cover rounded-lg border border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (midridePhotoPath) URL.revokeObjectURL(midridePhotoPath);
                                      setMidridePhotoPath(null);
                                      setMidridePhotoBlob(null);
                                    }}
                                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/80 transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setIsCapturingMidridePhoto(true)}
                                  disabled={midridePhotoUploading}
                                  className="w-full py-3 rounded-lg border border-dashed border-border bg-card hover:bg-muted/40 text-muted-foreground text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                  {midridePhotoUploading ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Camera className="w-4 h-4" /> Take Photo
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Swap preference */}
                          {reportIssueType === "bike_damaged" && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 block">What would you like to do?</label>
                              <div className="grid grid-cols-1 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setMidrideWantsSwap(true)}
                                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                    midrideWantsSwap === true
                                      ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                      : "border-border bg-card hover:bg-muted/40"
                                  }`}
                                >
                                  <ArrowRight className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
                                  <div>
                                    <span className="text-sm font-medium text-foreground">Swap to another bike</span>
                                    <span className="text-[12px] text-muted-foreground block mt-0.5">
                                      Scan or enter the ID of the new bike you want to ride
                                    </span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMidrideWantsSwap(false)}
                                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                    midrideWantsSwap === false
                                      ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                                      : "border-border bg-card hover:bg-muted/40"
                                  }`}
                                >
                                  <Bike className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                                  <div>
                                    <span className="text-sm font-medium text-foreground">Continue with this bike</span>
                                    <span className="text-[12px] text-muted-foreground block mt-0.5">Report the issue — we'll flag it for admin review</span>
                                  </div>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Scanned/Entered Bike ID for Swap */}
                          {reportIssueType === "bike_damaged" && midrideWantsSwap === true && (
                            <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 animate-in fade-in duration-200 mt-4">
                              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                                New Bike ID to Swap <span className="text-destructive ml-1">*</span>
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={midrideNewBikeId}
                                  onChange={(e) => setMidrideNewBikeId(e.target.value.toUpperCase())}
                                  placeholder="e.g. B002"
                                  maxLength={4}
                                  className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                />
                                <button
                                  type="button"
                                  onClick={() => setIsScanningMidrideQr(true)}
                                  className="shrink-0 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-sm flex items-center gap-2 transition-colors active:scale-95"
                                >
                                  <QrCode className="w-4 h-4" />
                                  Scan
                                </button>
                              </div>
                              <span className="text-[11px] text-muted-foreground block mt-1.5">
                                Please make sure the bike is available at the station.
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* Error state */}
                  {reportError && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-700 dark:text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <p className="text-sm">{reportError}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="button"
                    disabled={
                      reportSubmitting ||
                      !reportIssueType ||
                      (reportIssueType === "other" && !reportDescription.trim()) ||
                      (reportIssueType === "qr_damaged" && !reportBikeId.trim()) ||
                      (reportIssueType === "no_bike_available" && rescheduleMinutes === null) ||
                      (reportModal === "collection" && reportIssueType === "bike_damaged" && !collectionDamageType) ||
                      (reportModal === "collection" && reportIssueType === "bike_damaged" && collectionDamageType === "other" && !reportDescription.trim()) ||
                      (reportModal === "midride" && reportIssueType === "bike_damaged" && !midrideDamageType) ||
                      (reportModal === "midride" && reportIssueType === "bike_damaged" && midrideDamageType === "other" && !reportDescription.trim()) ||
                      (reportModal === "midride" && reportIssueType === "bike_damaged" && midrideWantsSwap === null) ||
                      (reportModal === "midride" && reportIssueType === "bike_damaged" && midrideWantsSwap === true && (!midrideNewBikeId.trim() || !/^B\d{3}$/.test(midrideNewBikeId.trim())))
                    }
                    onClick={async () => {
                      setReportSubmitting(true);
                      setReportError(null);
                      try {
                        const { httpsCallable } = await import("firebase/functions");
                        const { functions } = await import("@/lib/firebase/client");

                        if (reportModal === "collection") {
                          if (reportIssueType === "qr_damaged") {
                            closeReportModal();
                            router.push(`/book/scan?bikeId=${reportBikeId.trim().toUpperCase()}`);
                            return;
                          }

                          // Get GPS
                          let lat = 0, lng = 0;
                          try {
                            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
                            );
                            lat = pos.coords.latitude;
                            lng = pos.coords.longitude;
                          } catch {
                            setReportError("Could not get your GPS location. Please enable location services.");
                            setReportSubmitting(false);
                            return;
                          }

                          let uploadedPath: string | undefined = undefined;
                          if (reportIssueType === "bike_damaged" && collectionPhotoBlob) {
                            const { getStorage, ref: storageRef, uploadBytes } = await import("firebase/storage");
                            const { storage } = await import("@/lib/firebase/client");
                            const compressed = await compressImage(collectionPhotoBlob, 300);
                            const path = `issue-photos/${user?.uid}/${Date.now()}_collection.jpg`;
                            const sRef = storageRef(getStorage(storage.app), path);
                            await uploadBytes(sRef, compressed, { contentType: "image/jpeg" });
                            uploadedPath = path;
                          }

                          const callFn = httpsCallable<Record<string, unknown>, { success: boolean; reportId?: string; action?: string }>(functions, "reportCollectionIssue");
                          const payload: Record<string, unknown> = {
                            issueType: reportIssueType,
                            lat,
                            lng,
                          };
                          if (reportIssueType === "no_bike_available") {
                            payload.rescheduleMinutes = rescheduleMinutes === 0 ? undefined : rescheduleMinutes;
                          }
                          if (reportBikeId.trim()) payload.bikeId = reportBikeId.trim();
                          if (reportDescription.trim()) payload.issueDescription = reportDescription.trim();
                          if (reportIssueType === "bike_damaged") {
                            if (collectionDamageType) payload.damageType = collectionDamageType;
                            if (uploadedPath) payload.issuePhotoPath = uploadedPath;
                          }

                          const result = await callFn(payload);
                          const data = result.data;
                          if (data.success) {
                            const actionMsg = data.action === "rescheduled"
                              ? `Your booking has been rescheduled by ${rescheduleMinutes} minutes.`
                              : data.action === "cancelled"
                                ? "Your booking has been cancelled without penalty."
                                : data.action === "collected"
                                  ? `Bike ${reportBikeId} collected successfully via manual entry.`
                                  : "Your report has been submitted. Thank you.";
                            setReportSuccess(actionMsg);
                          } else {
                            setReportError("Failed to submit report.");
                          }
                        } else {
                          // Mid-ride report
                          if (reportIssueType === "qr_damaged") {
                            closeReportModal();
                            router.push(`/book/scan?bikeId=${reportBikeId.trim().toUpperCase()}`);
                            return;
                          } else {
                            // Mid-ride damage report
                            let uploadedPath: string | undefined = undefined;
                            if (midridePhotoBlob) {
                              const { getStorage, ref: storageRef, uploadBytes } = await import("firebase/storage");
                              const { storage } = await import("@/lib/firebase/client");
                              const compressed = await compressImage(midridePhotoBlob, 300);
                              const path = `issue-photos/${user?.uid}/${Date.now()}_midride.jpg`;
                              const sRef = storageRef(getStorage(storage.app), path);
                              await uploadBytes(sRef, compressed, { contentType: "image/jpeg" });
                              uploadedPath = path;
                            }

                            const callFn = httpsCallable<Record<string, unknown>, { success: boolean; reportId?: string; swapResult?: string; newBikeId?: string }>(functions, "reportMidRideDamage");
                            const payload: Record<string, unknown> = {
                              issueType: reportIssueType === "bike_damaged" ? midrideDamageType : "other",
                              wantsSwap: midrideWantsSwap === true,
                            };
                            if (midrideWantsSwap && midrideNewBikeId.trim()) {
                              payload.newBikeId = midrideNewBikeId.trim().toUpperCase();
                            }
                            if (reportDescription.trim()) payload.issueDescription = reportDescription.trim();
                            if (uploadedPath) payload.issuePhotoPath = uploadedPath;

                            const result = await callFn(payload);
                            const d = result.data;
                            if (d.success) {
                              const msg =
                                d.swapResult === "swapped"
                                  ? `Damage reported. You've been swapped to bike ${d.newBikeId}. Continue your ride!`
                                  : d.swapResult === "no_bikes_available"
                                    ? "Damage reported. No spare bikes available — please return as soon as possible."
                                    : "Damage report submitted. Thank you for letting us know.";
                              setReportSuccess(msg);
                            } else {
                              setReportError("Failed to submit report.");
                            }
                          }
                        }
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : "An error occurred";
                        setReportError(message);
                      } finally {
                        setReportSubmitting(false);
                      }
                    }}
                    className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reportSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t("dashboard.report.submitting")}
                      </span>
                    ) : (
                      reportIssueType === "no_bike_available" && rescheduleMinutes === 0
                        ? t("dashboard.report.cancelPenalty")
                        : reportIssueType === "no_bike_available" && rescheduleMinutes
                          ? t("dashboard.report.reschedule").replace("{mins}", rescheduleMinutes.toString())
                          : reportIssueType === "qr_damaged" && reportModal === "collection"
                            ? t("dashboard.report.continueCollect")
                            : reportIssueType === "qr_damaged" && reportModal === "midride"
                              ? t("dashboard.report.continueReturn")
                              : t("dashboard.report.submit")
                    )}
                  </button>
                </>
              )}

              {reportSuccess && (
                <>
                  {/* Success state */}
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-lg flex items-start gap-3 text-green-700 dark:text-green-400 animate-in fade-in slide-in-from-top-1 duration-200">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Report Submitted</p>
                      <p className="text-[13px] mt-1 opacity-90">{reportSuccess}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeReportModal}
                    className="w-full py-3 rounded-lg border border-border bg-card hover:bg-muted/40 text-foreground font-semibold text-sm transition-all active:scale-95"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isCapturingMidridePhoto && (
        <CameraCapture
          title="Take Issue Photo"
          subtitle="Capture the damaged area clearly"
          onCapture={handleMidridePhotoCaptured}
          onCancel={() => setIsCapturingMidridePhoto(false)}
        />
      )}

      {isCapturingCollectionPhoto && (
        <CameraCapture
          title="Take Collection Issue Photo"
          subtitle="Capture the damaged area clearly"
          onCapture={handleCollectionPhotoCaptured}
          onCancel={() => setIsCapturingCollectionPhoto(false)}
        />
      )}

      {isScanningMidrideQr && (
        <QrScannerOverlay
          onScan={(val) => {
            setMidrideNewBikeId(val);
            setIsScanningMidrideQr(false);
          }}
          onCancel={() => setIsScanningMidrideQr(false)}
          title="Scan New Bike QR"
          subtitle="Point your camera at the QR code on the new bike"
        />
      )}
    </div>
  );
}
