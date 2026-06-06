"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Clock, Bike, ArrowRight, CheckCircle2, AlertCircle,
  AlertTriangle, Ban, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { db, functions } from "@/lib/firebase/client";
import {
  doc, onSnapshot, collection, query, where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { format } from "date-fns";
import type { BookingDocument } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "0800" / "1830" → minutes-since-midnight */
function parseHHMMtoMins(t: string): number {
  const s = t.padStart(4, "0");
  return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
}

/** Abbreviated day for a Date in MYT */
function getMYTDayAbbr(d: Date): string {
  const myt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][myt.getUTCDay()];
}

/** Current MYT time as minutes-since-midnight */
function nowMYTMins(): number {
  const myt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return myt.getUTCHours() * 60 + myt.getUTCMinutes();
}

interface OperatingHours {
  default: { open: string; close: string };
  overrides?: Record<string, { open: string; close: string }>;
}

function getHoursForDay(
  opHours: OperatingHours | undefined,
  dayAbbr: string
): { open: string; close: string } | null {
  if (!opHours) return null;
  return opHours.overrides?.[dayAbbr] ?? opHours.default;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BookPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { policy, loading: policyLoading } = usePolicy();

  const [duration, setDuration] = useState("");
  const [inventory, setInventory] = useState({ total: 0, available: 0, inUse: 0 });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [activeBooking, setActiveBooking] = useState<BookingDocument | null>(null);

  // Live inventory
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "inventory", "current"), (snap) => {
      if (snap.exists()) setInventory(snap.data() as typeof inventory);
    }, (err) => {
      console.error("Error fetching inventory:", err);
    });
    return () => unsub();
  }, [user]);

  // Live active booking check
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "active", "collected", "late"])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setActiveBooking(snap.docs[0].data() as BookingDocument);
      else setActiveBooking(null);
    }, (err) => {
      console.error("Error fetching active booking:", err);
    });
    return () => unsub();
  }, [user]);

  // Default duration once policy loads
  useEffect(() => {
    if (policy && !duration) {
      const max = policy.maxBookingDuration || 120;
      const opts = (policy.bookingDurationOptions || []).filter((d: number) => d <= max);
      if (opts.length > 0) setDuration(String(opts[0]));
    }
  }, [policy, duration]);

  // ── Operating hours ────────────────────────────────────────────────────────

  const opHours = policy?.operatingHours as OperatingHours | undefined;
  const operatingDays: string[] = policy?.operatingDays ?? [];
  const todayAbbr = getMYTDayAbbr(new Date());
  const isOperatingDay = operatingDays.includes(todayAbbr);
  const todayHours = getHoursForDay(opHours, todayAbbr);

  const isWithinHours = useMemo(() => {
    if (!isOperatingDay) return false;
    if (!todayHours) return true;
    const minsNow = nowMYTMins();
    const open = parseHHMMtoMins(todayHours.open);
    const close = parseHHMMtoMins(todayHours.close);
    return minsNow >= open && minsNow < close;
  }, [isOperatingDay, todayHours]);

  const operatingHoursLabel = todayHours
    ? `${todayHours.open.slice(0, 2)}:${todayHours.open.slice(2)} – ${todayHours.close.slice(0, 2)}:${todayHours.close.slice(2)}`
    : "";

  // ── Eligibility ────────────────────────────────────────────────────────────

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

  const hasActiveBooking = !!activeBooking;
  const isBookingClosed = policy?.isBookingOpen === false;

  const canBook = isVerified && !isBlocked && !isOnCooldown && !isUnderCancelCooldown && !hasActiveBooking && !isBookingClosed;

  const durations = useMemo(() => {
    const raw = policy?.bookingDurationOptions ?? [30, 60, 90, 120];
    const max = policy?.maxBookingDuration || 120;
    return raw.filter((d: number) => d <= max);
  }, [policy]);

  const getColSpanClass = (index: number, count: number) => {
    if (count <= 1) return "col-span-6";
    if (count === 2 || count === 4) return "col-span-3";
    if (count === 3 || count === 6) return "col-span-2";
    if (count === 5) {
      return index < 3 ? "col-span-2" : "col-span-3";
    }
    return "col-span-2";
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !policy || !canBook) return;

    setError("");
    setLoading(true);

    try {
      const fn = httpsCallable(functions, "createOnDemandBooking");
      const functionResult = await fn({ duration: parseInt(duration), practicum: user.practicum });
      const result = functionResult.data as { success: boolean; error?: string; bookingId?: string };

      if (result.success) {
        setSuccess(true);
      } else {
        const rawErr = result.error ?? "UNKNOWN_ERROR";
        const errorMap: Record<string, string> = {
          "ACCOUNT_PERMANENTLY_BLOCKED": t("book.error.permanentlyBlocked"),
          "ACCOUNT_SUSPENDED": t("book.error.suspended"),
          "ACCOUNT_ON_COOLDOWN": t("book.error.cooldown"),
          "USER_ALREADY_HAS_ACTIVE_BOOKING": t("book.error.activeBooking"),
          "BOOKING_CLOSED": t("book.error.bookingClosed"),
          "BOOKING_EXCEEDS_OPERATING_HOURS": t("book.error.exceedsHours"),
          "OUTSIDE_OPERATING_HOURS": t("book.error.outsideHours"),
          "CANCEL_COOLDOWN": t("book.error.cancelCooldown"),
        };
        const [code, countStr] = rawErr.split(":");
        if (code === "NO_SLOTS_AVAILABLE") {
          const [count, total] = (countStr || "0/0").split("/").map((s) => parseInt(s, 10));
          setError(
            count >= (total || 0) && total > 0
              ? t("book.error.allBikesInUse").replace("{total}", total.toString())
              : t("book.error.noBikesAvailable")
          );
        } else {
          setError(errorMap[code] || code.replace(/_/g, " "));
        }
      }
    } catch (err: unknown) {
      console.error("Booking error:", err);
      setError(t("book.error.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  // ── Render guards ──────────────────────────────────────────────────────────

  if (policyLoading)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );



  // Disabled reason
  let disabledReason = "";
  if (!canBook) {
    if (isBlocked) disabledReason = t("book.disabled.blocked");
    else if (isOnCooldown) disabledReason = t("book.disabled.cooldown");
    else if (isUnderCancelCooldown) disabledReason = t("book.disabled.cancelCooldown");
    else if (hasActiveBooking) disabledReason = t("book.disabled.activeBooking");
    else if (isBookingClosed) disabledReason = t("book.disabled.bookingClosed");
    else if (!isVerified) disabledReason = t("book.disabled.unverified");
  } else {
    if (!isOperatingDay) disabledReason = t("book.disabled.notOperatingDay").replace("{day}", todayAbbr);
    else if (!isWithinHours) disabledReason = t("book.disabled.outsideHours").replace("{hours}", operatingHoursLabel);
    else if (inventory.available === 0) disabledReason = t("book.disabled.noBikes");
  }

  const submitDisabled = loading || !!disabledReason;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">

      {/* ─── Eligibility banners ─── */}
      {isBlocked && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <Ban className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.blocked.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">{t("book.alert.blocked.desc")}</p>
          </div>
        </div>
      )}
      {isBookingClosed && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.closed.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">{t("book.alert.closed.desc")}</p>
          </div>
        </div>
      )}
      {hasActiveBooking && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-start gap-3 text-blue-800 dark:text-blue-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.active.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">{t("book.alert.active.desc")}</p>
          </div>
        </div>
      )}
      {!isBlocked && isOnCooldown && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-3 text-amber-800 dark:text-amber-400 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.cooldown.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("book.alert.cooldown.desc").replace("{date}", format(
                (user!.cooldownUntil as { toDate: () => Date }).toDate(),
                "MMM dd, yyyy hh:mm a"
              ))}
            </p>
          </div>
        </div>
      )}
      {!isBlocked && !isOnCooldown && isUnderCancelCooldown && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-3 text-amber-800 dark:text-amber-400 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.cancelCooldown.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("book.alert.cancelCooldown.desc").replace("{date}", format(
                new Date(lastCancelledAtMs! + cancelCooldownMinutes * 60 * 1000),
                "MMM dd, yyyy hh:mm a"
              ))}
            </p>
          </div>
        </div>
      )}
      {!isBlocked && !isOnCooldown && user?.verificationStatus === "rejected" && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-3 text-red-800 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.rejected.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">
              {t("book.alert.rejected.desc")}
              {user.verificationRejectedReason && <>{t("book.alert.rejected.reason").replace("{reason}", user.verificationRejectedReason)}</>}
            </p>
          </div>
        </div>
      )}
      {!isBlocked && !isOnCooldown && user?.verificationStatus === "pending" && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-3 text-amber-800 dark:text-amber-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.pending.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">{t("book.alert.pending.desc")}</p>
          </div>
        </div>
      )}
      {!isBlocked && !isOnCooldown && user?.verificationStatus === "unverified" && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-start gap-3 text-blue-800 dark:text-blue-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">{t("book.alert.unverified.title")}</h3>
            <p className="text-[13px] mt-1 opacity-90">{t("book.alert.unverified.desc")}</p>
          </div>
        </div>
      )}

      {/* ─── Page Header ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-y-2 md:gap-y-0 md:gap-x-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("book.title")}</h2>
          </div>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/" className="hover:text-primary transition-colors">{t("dashboard.home")}</Link>
            <span>›</span>
            <span>{t("nav.book")}</span>
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

      {/* ─── Main booking card ─── */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="p-6 md:p-8">
          <form onSubmit={handleBook} className="space-y-6 md:space-y-8">

            {/* Status banner */}
            <div className="flex items-center gap-4 p-5 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="w-10 h-10 bg-card dark:bg-muted/50 rounded-full flex items-center justify-center shadow-sm shrink-0 border border-blue-100 dark:border-blue-900/20">
                <Bike className="h-5 w-5 text-primary dark:text-blue-500" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{inventory.available} Bikes Available</h4>
                <p className="text-[12px] text-muted-foreground mt-0.5">Ready for immediate pickup</p>
              </div>
              <div className="ml-auto text-right hidden md:block">
                {isWithinHours && isOperatingDay && !isBookingClosed ? (
                  <span className="px-2.5 py-1 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-500 text-[10px] font-bold uppercase tracking-wider rounded-md border border-green-200 dark:border-green-900/30">
                    {t("book.operational")}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500 text-[10px] font-bold uppercase tracking-wider rounded-md border border-amber-200 dark:border-amber-900/30">
                    {t("book.closed")}
                  </span>
                )}
              </div>
            </div>

            {/* Outside hours warning */}
            {canBook && (!isOperatingDay || !isWithinHours) && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-amber-800 dark:text-amber-400 text-sm">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Booking unavailable. </span>
                  {!isOperatingDay
                    ? `Today is not an operating day.`
                    : `Operating hours today: ${operatingHoursLabel}.`}
                </div>
              </div>
            )}

            {/* Duration picker */}
            <div className="space-y-3 md:space-y-4">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Select Duration
              </label>
              <div className="grid grid-cols-6 md:flex md:flex-nowrap gap-4 w-full">
                {durations.map((d: number, index: number) => {
                  const colSpan = getColSpanClass(index, durations.length);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d.toString())}
                      className={`md:flex-1 flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all group ${colSpan} ${
                        duration === d.toString()
                          ? "border-primary bg-blue-50 dark:bg-blue-900/20 text-primary dark:text-blue-400"
                          : "border-border bg-card dark:bg-muted/10 text-muted-foreground hover:border-primary hover:text-primary dark:hover:border-blue-800"
                      }`}
                    >
                    <span className={`text-2xl font-light mb-0.5 group-hover:scale-110 transition-transform ${duration === d.toString() ? "text-primary" : "text-foreground"}`}>
                      {d}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-tight">Mins</span>
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2 md:pt-6 space-y-3">
              {error && (
                <div className="bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-4 rounded-xl text-sm border border-red-100 dark:border-red-900/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm shadow-red-100/50 dark:shadow-none mb-4">
                  <div className="w-8 h-8 bg-white dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0 shadow-sm border border-red-100 dark:border-red-800/20">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitDisabled}
                className="w-full py-4 bg-secondary hover:bg-secondary/90 text-white rounded-full font-semibold text-[15px] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 group active:scale-95"
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  <>
                    <span>{t("book.bookNow")}</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {disabledReason && !loading && (
                <p className="text-[12px] text-center text-amber-700 flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {disabledReason}
                </p>
              )}
            </div>

            <p className="text-[12px] text-center text-muted-foreground">
              By confirming, you agree to our{" "}
              <Link href="/policy" className="text-primary hover:underline">Bike Usage Policy</Link>
            </p>
          </form>
        </div>
      </div>

      {success && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card dark:bg-[#1a1f26] p-8 md:p-12 rounded-2xl shadow-2xl border border-border text-center max-w-md w-full animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-green-100 dark:border-green-900/30">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">Booking Confirmed!</h2>
            <p className="text-[14px] text-muted-foreground mb-8">
              Your bike reservation is ready. Scan the QR code at the station to collect your bike within {policy?.pickupGracePeriod || 15} minutes.
            </p>
            <Link
              href="/book/scan"
              className="block bg-primary text-primary-foreground py-3 rounded-full font-medium text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              Open Scanner
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
