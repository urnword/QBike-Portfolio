"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BookingDocument } from "@/types";
import { Calendar, CheckCircle2, XCircle, Clock, Copy, Check, Bike, Info, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { db, functions } from "@/lib/firebase/client";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function HistoryPage() {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  // ── Personal bookings ──────────────────────────────────────────────────────
  const [history, setHistory] = useState<BookingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [setSelectedBooking, setSelectedBookingState] = useState<BookingDocument | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCancel = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    setCancellingId(bookingId);
    try {
      const cancelFn = httpsCallable(functions, "cancelBooking");
      const result = await cancelFn({ bookingId });
      const data = result.data as { success: boolean; error?: string };
      if (!data.success) {
        alert("Failed to cancel: " + data.error);
      }
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setCancellingId(null);
    }
  };

  // ── Data subscriptions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ bookingId: d.id, ...d.data() })) as unknown as BookingDocument[];
      // Client-side sort to fix missing composite index issue
      const sorted = [...docs].sort((a, b) => {
        const dateA = (a.createdAt as any)?.toMillis?.() || 0;
        const dateB = (b.createdAt as any)?.toMillis?.() || 0;
        return dateB - dateA;
      });
      setHistory(sorted);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching booking history:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalBookings: history.length,
    completedBookings: history.filter((b) => b.status === "completed").length,
    cancelledBookings: history.filter((b) => b.status === "cancelled").length,
    lateBookings: history.filter((b) => b.status === "late" || b.isLate).length,
  }), [history]);

  // ── Personal bookings columns ──────────────────────────────────────────────
  const columns = [
    {
      key: "bookingId" as keyof BookingDocument,
      label: t("history.bookingId"),
      align: "center" as const,
      sortable: true,
      render: (val: string) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(val);
            alert(`${t("dashboard.report.bikeId")}: ${val}`); // Reusing bikeId or general string
          }}
          className="font-mono text-xs hover:text-primary hover:underline cursor-pointer focus:outline-none transition-colors"
          title="Copy"
        >
          {val ? val.slice(-8).toUpperCase() : "-"}
        </button>
      ),
    },
    {
      key: "startTime" as keyof BookingDocument,
      label: t("history.date"),
      align: "center" as const,
      sortable: true,
      render: (val: unknown) =>
        val ? format((val as { toDate: () => Date }).toDate(), "dd/MM/yyyy HH:mm") : "-",
    },
    {
      key: "bookingType" as keyof BookingDocument,
      label: t("history.type"),
      align: "center" as const,
      sortable: true,
      render: (val: string) => {
        if (!val) return <span className="text-muted-foreground">-</span>;
        const normalized = val.toLowerCase();
        if (normalized === "ondemand") {
          return <span>{t("book.onDemand")}</span>;
        }
        return <span className="capitalize">{normalized}</span>;
      },
    },
    {
      key: "duration" as keyof BookingDocument,
      label: t("book.selectDuration"),
      align: "center" as const,
      sortable: true,
      render: (val: number) => `${val} ${t("book.mins")}`,
    },
    {
      key: "bikeId" as keyof BookingDocument,
      label: t("dashboard.bikeId"),
      align: "center" as const,
      render: (val: string | null) => val ? <span className="font-mono font-bold text-primary dark:text-blue-500">{val}</span> : "-",
    },
    {
      key: "status" as keyof BookingDocument,
      label: t("history.status"),
      align: "center" as const,
      sortable: true,
      render: (val: string) => <StatusBadge status={val} />,
    },
    {
      key: "bikeConditionOnReturn" as keyof BookingDocument,
      label: "Note",
      align: "center" as const,
      render: (val: any, item: BookingDocument) => {
        const isLate = item.isLate || item.status === "late";
        const isFlagged = item.bikeConditionOnReturn === "flagged";

        if (isLate && isFlagged) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-950/30 text-destructive dark:text-red-400 border border-red-200 dark:border-red-900/50">
              Late & Damaged
            </span>
          );
        }
        if (isLate) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
              Late Return
            </span>
          );
        }
        if (isFlagged) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-950/30 text-destructive dark:text-red-400 border border-red-200 dark:border-red-900/50">
              Damaged
            </span>
          );
        }
        return <span className="text-muted-foreground text-xs font-normal">-</span>;
      },
    },
  ];

  // ── Loading state ──────────────────────────────────────────────────────────
  if (authLoading || loading)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("history.title")}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t("dashboard.home")}</Link>
            <span>›</span>
            <span>{t("nav.history")}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: t("history.allBookings"), value: stats.totalBookings, color: "text-primary dark:text-blue-500", icon: Calendar, bgColor: "bg-primary/10 dark:bg-blue-900/10" },
          { label: t("history.completed"), value: stats.completedBookings, color: "text-green-600 dark:text-green-500", icon: CheckCircle2, bgColor: "bg-green-50 dark:bg-green-900/10" },
          { label: t("history.cancelled"), value: stats.cancelledBookings, color: "text-muted-foreground", icon: XCircle, bgColor: "bg-muted dark:bg-muted/30" },
          { label: t("dashboard.lateReturn"), value: stats.lateBookings, color: "text-destructive dark:text-red-500", icon: Clock, bgColor: "bg-destructive/10 dark:bg-red-950/10" },
        ].map((stat, i) => (
          <div key={i} className="bg-card p-6 rounded-2xl shadow-sm border border-border flex items-center gap-4 transition-all hover:shadow-md">
            <div className={`w-12 h-12 rounded-xl ${stat.bgColor} ${stat.color} flex items-center justify-center shrink-0`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-0.5">{stat.label}</span>
              <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-10">
        {/* ── Personal Bookings Table ──────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-5 md:p-7 border-b border-border flex items-center justify-between bg-muted/5">
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("history.title")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("history.desc")}</p>
            </div>
          </div>
          <div className="p-0">
            {history.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-5 text-muted-foreground">
                  <Calendar className="w-10 h-10" />
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">{t("history.noBookingsFound")}</h4>
                <p className="text-sm text-muted-foreground mb-8">{t("history.noBookingsDesc")}</p>
                <Link
                  href="/book"
                  className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-xl text-[14px] font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
                >
                  {t("dashboard.bookABike")}
                </Link>
              </div>
            ) : (
              <DataTable 
                columns={columns as any} 
                data={history as any} 
                pageSize={10} 
                onRowClick={(item) => setSelectedBookingState(item as BookingDocument)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ─── Detailed Booking Modal ─── */}
      {setSelectedBooking && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => setSelectedBookingState(null)}
          />

          {/* Modal Container */}
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50">
              <div>
                <h3 className="text-base font-bold text-foreground">Booking Details</h3>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-0.5">
                  ID: {(() => {
                    const parts = setSelectedBooking.bookingId.split('-');
                    return parts.length >= 3 
                      ? `${parts[1].slice(-1)}-${parts[2]}` 
                      : setSelectedBooking.bookingId;
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={setSelectedBooking.status} />
                <button
                  onClick={() => setSelectedBookingState(null)}
                  className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 hover:cursor-pointer"
                >
                  <XCircle className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
              
              {/* Top Row Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary dark:text-blue-400 text-[11px] font-bold">
                  <Bike className="w-3.5 h-3.5" />
                  <span>Bike: {setSelectedBooking.bikeId || "N/A"}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duration: {setSelectedBooking.duration} mins</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold capitalize">
                  <Info className="w-3.5 h-3.5" />
                  <span>Type: {setSelectedBooking.bookingType === "ondemand" ? "On-Demand" : setSelectedBooking.bookingType}</span>
                </div>
              </div>

              {/* Rider & Session Grid */}
              <div className="grid grid-cols-3 gap-3 border-t border-border/50 pt-4 text-xs">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Rider Name</span>
                  <span className="font-bold text-foreground line-clamp-1">{setSelectedBooking.userFullName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Matrix No</span>
                  <span className="font-bold text-foreground font-mono">{setSelectedBooking.userMatrixNo || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Practicum</span>
                  <span className="font-bold text-foreground">{setSelectedBooking.practicum || "N/A"}</span>
                </div>
              </div>

              {/* Journey Timeline */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Journey Timeline</h4>
                <div className="relative pl-5 space-y-3.5 before:absolute before:left-[8px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border/60">
                  {/* Milestone 1: Created */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-primary ring-2 ring-primary/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Booking Created</span>
                      <span className="font-medium text-foreground">
                        {setSelectedBooking.createdAt ? format(setSelectedBooking.createdAt.toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Milestone 2: Scheduled Start */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-blue-500 ring-2 ring-blue-500/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Scheduled Slot</span>
                      <span className="font-medium text-foreground">
                        {setSelectedBooking.startTime ? format(setSelectedBooking.startTime.toDate(), "dd/MM/yyyy HH:mm") : "N/A"}
                        {" - "}
                        {setSelectedBooking.endTime ? format(setSelectedBooking.endTime.toDate(), "HH:mm") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Milestone 3: Collected */}
                  {setSelectedBooking.collectedAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-green-500 ring-2 ring-green-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Collected</span>
                        <span className="font-semibold text-green-600 dark:text-green-400 font-mono">
                          {format(setSelectedBooking.collectedAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Milestone 4: Returned or Cancelled */}
                  {setSelectedBooking.returnedAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-primary dark:bg-blue-500 ring-2 ring-primary/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Returned</span>
                        <span className="font-semibold text-primary dark:text-blue-500 font-mono">
                          {format(setSelectedBooking.returnedAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {setSelectedBooking.cancelledAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-destructive ring-2 ring-destructive/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Cancelled ({setSelectedBooking.cancelledBy === "user" ? "By You" : "System"})</span>
                        <span className="font-semibold text-destructive font-mono">
                          {format(setSelectedBooking.cancelledAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Extras & Return Inspection */}
              {(setSelectedBooking.isLate || setSelectedBooking.bikeConditionOnReturn) && (
                <div className="bg-muted/30 dark:bg-muted/10 p-3.5 rounded-xl border border-border/80 flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    {setSelectedBooking.bikeConditionOnReturn === "flagged" ? (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block text-foreground">Return Inspection Complete</span>
                      <span className="text-muted-foreground text-[10px]">
                        Condition was marked as{" "}
                        <strong className={`capitalize ${setSelectedBooking.bikeConditionOnReturn === "flagged" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {setSelectedBooking.bikeConditionOnReturn === "flagged" ? "damaged" : (setSelectedBooking.bikeConditionOnReturn || "Good")}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {setSelectedBooking.isLate && (
                    <div className="text-right shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-destructive text-[10px] font-bold border border-red-200 dark:border-red-900/50">
                        {setSelectedBooking.lateReturnMinutes ? `${setSelectedBooking.lateReturnMinutes}m Late` : "Late Return"}
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-muted/40 dark:bg-muted/10 border-t border-border/60 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (setSelectedBooking) {
                    const text = setSelectedBooking.bookingId;
                    if (navigator.clipboard && window.isSecureContext) {
                      navigator.clipboard.writeText(text)
                        .then(() => {
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        })
                        .catch(() => {
                          const el = document.createElement('textarea');
                          el.value = text;
                          document.body.appendChild(el);
                          el.select();
                          document.execCommand('copy');
                          document.body.removeChild(el);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        });
                    } else {
                      const el = document.createElement('textarea');
                      el.value = text;
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand('copy');
                      document.body.removeChild(el);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary dark:text-blue-500 hover:bg-primary/10 rounded-xl transition-all active:scale-95 hover:cursor-pointer"
              >
                {copiedId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 animate-in zoom-in" />
                    <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full ID</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedBookingState(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-primary/15"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
