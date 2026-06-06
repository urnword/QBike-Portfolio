"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, Trash2, XCircle, Bike, Clock, Info, AlertCircle, CheckCircle2, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BookingDocument } from "@/types";
import { db } from "@/lib/firebase/client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuth } from "@/lib/hooks/useAuth";
import { bulkCancelAllActiveBookings, adminOverrideBooking } from "@/actions/admin";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminActiveBookingsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeBookings, setActiveBookings] = useState<BookingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalSearch, setPersonalSearch] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingDocument | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const handleBulkCancel = async () => {
    const cancellable = filteredBookings.filter(b => b.status === "pending" || b.status === "active");
    const count = cancellable.length;
    if (count === 0) {
      alert("No pending or active bookings found in current view.");
      return;
    }

    const msg = personalSearch 
      ? `Are you sure you want to cancel the ${count} PENDING/ACTIVE bookings currently filtered? (Collected bikes will NOT be affected)`
      : `CRITICAL ACTION: Are you sure you want to cancel ALL ${count} pending and active bookings? This will clear all uncollected sessions.`;

    if (!window.confirm(msg)) return;
    if (!window.confirm("FINAL WARNING: This cannot be undone. Inventory will be restored. Collected bikes remain in possession. Proceed?")) return;

    setCancelling(true);
    try {
      const res = await bulkCancelAllActiveBookings();
      alert(`Successfully cancelled ${res.count} bookings.`);
    } catch (err: unknown) {
      alert("Bulk cancel failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancelling(false);
    }
  };

  const filteredBookings = useMemo(() => {
    if (!personalSearch) return activeBookings;
    const term = personalSearch.toLowerCase();
    return activeBookings.filter(b => 
      b.bookingId.toLowerCase().includes(term) ||
      b.userMatrixNo.toLowerCase().includes(term) ||
      (b.userFullName || "").toLowerCase().includes(term)
    );
  }, [activeBookings, personalSearch]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "bookings"),
      where("status", "in", ["pending", "active", "collected"])
    );

    const unsub = onSnapshot(q, (snap) => {
      setActiveBookings(snap.docs.map(doc => ({ bookingId: doc.id, ...doc.data() } as BookingDocument)));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching bookings:", err);
      setLoading(false);
    });

    return () => {
      unsub();
    };
  }, [user]);

  const handleAction = async (booking: BookingDocument, action: "collect" | "return" | "cancel") => {
    let bikeIdInput: string | undefined = undefined;
    
    if (action === "collect") {
       const id = window.prompt("Enter Bike ID to assign (e.g. B001):");
       if (!id) return;
       if (!/^B\d{3}$/i.test(id)) {
          alert("Invalid Bike ID format.");
          return;
       }
       bikeIdInput = id.toUpperCase();
     } else if (action === "cancel") {
        if (!window.confirm("Are you sure you want to cancel this booking?")) return;
     } else if (action === "return") {
        if (!window.confirm("Mark as returned? Ensure bike is physically secured.")) return;
     }

    try {
      await adminOverrideBooking(booking.bookingId, action, bikeIdInput);
    } catch (err: unknown) {
      console.error("Action failed", err);
      alert((err instanceof Error ? err.message : null) || "Action failed.");
    }
  };

  const columns: Column<BookingDocument>[] = [
    { 
      key: "bookingId" as keyof BookingDocument, 
      label: "Booking ID", 
      sortable: true, 
      align: "center" as const,
      render: (v) => {
        const parts = (v as string).split('-');
        return (
          <span className="font-mono text-primary font-bold">
            {parts.length >= 3 ? `${parts[1].slice(-1)}-${parts[2]}` : (v as string)}
          </span>
        );
      }
    },
    { key: "userMatrixNo" as keyof BookingDocument, label: t("admin.bookings.colMatrix"), sortable: true, align: "center" as const },
    { 
      key: "bookingType" as keyof BookingDocument, 
      label: t("admin.bookings.colType"), 
      sortable: true, 
      align: "center" as const,
      render: (v) => {
        const str = (v as string || "").toLowerCase();
        if (str === "ondemand") return <span className="font-normal text-foreground">On-Demand</span>;
        if (str === "future") return <span className="font-normal text-primary">Future</span>;
        return <span className="capitalize">{str}</span>;
      }
    },
    { key: "bikeId" as keyof BookingDocument, label: t("admin.bookings.colBikeId"), sortable: true, align: "center" as const, render: (v) => (v as string) || "-" },
    { key: "startTime" as keyof BookingDocument, label: t("admin.bookings.colSession"), sortable: true, align: "center" as const, render: (v) => v ? new Date((v as { seconds: number }).seconds * 1000).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : "-" },
    { key: "duration" as keyof BookingDocument, label: t("admin.bookings.colDuration"), sortable: true, align: "center" as const, render: (v) => `${v as number}m` },
    { key: "status" as keyof BookingDocument, label: t("admin.bookings.colStatus"), sortable: true, align: "center" as const, render: (v) => <StatusBadge status={v as string} /> },
    { key: "bookingId" as keyof BookingDocument, label: t("admin.bookings.colAction"), align: "center" as const, render: (_: any, item: BookingDocument) => {
      const isFuture = item.startTime && (item.startTime.seconds * 1000) > Date.now();
      return (
        <div className="flex gap-3 text-[11px] uppercase tracking-wider font-bold items-center justify-center">
          {(item.status === "pending" || item.status === "active") && (
            <button 
              disabled={isFuture}
              onClick={(e) => {
                e.stopPropagation();
                handleAction(item, "collect");
              }} 
              className={`flex items-center gap-1 ${isFuture ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'text-primary hover:text-primary/80 transition-all hover:cursor-pointer'}`}
              title={isFuture ? "Cannot collect before start time" : ""}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>{t("admin.bookings.collect")}</span>
            </button>
          )}
          {item.status === "collected" && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleAction(item, "return");
              }} 
              className="flex items-center gap-1 text-green-600 hover:text-green-500 transition-all hover:cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t("admin.bookings.return")}</span>
            </button>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleAction(item, "cancel");
            }} 
            className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-all hover:cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>{t("admin.bookings.cancel")}</span>
          </button>
        </div>
      );
    }}
  ];

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">{t("admin.bookings.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.bookings.activeBookings")}</span>
          </div>
        </div>
      </div>

      {/* Personal Bookings Card */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-4 sm:p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
             <h3 className="text-lg font-medium text-card-foreground">{t("admin.bookings.currentSessions")}</h3>
             <p className="text-[13px] text-muted-foreground">{t("admin.bookings.currentSessionsDesc")}</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input 
                type="text"
                placeholder={t("admin.bookings.search")}
                value={personalSearch}
                onChange={(e) => setPersonalSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-background border border-border rounded-full text-[11px] focus:border-primary focus:outline-none transition-all w-full shadow-sm"
              />
            </div>

            <button 
              onClick={handleBulkCancel}
              disabled={cancelling || activeBookings.length === 0}
              className="w-full sm:w-auto bg-red-500/10 text-red-500 border border-red-500/30 px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> 
              {cancelling ? "..." : t("admin.bookings.cancelAll")}
            </button>
          </div>
        </div>
        <DataTable columns={columns} data={filteredBookings as any} onRowClick={(item) => setSelectedBooking(item)} />
      </div>

      {/* ─── Detailed Booking Modal (Admin Console Override Flow) ─── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => setSelectedBooking(null)}
          />

          {/* Modal Container */}
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 font-sans">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50">
              <div>
                <h3 className="text-base font-bold text-foreground">{t("admin.bookings.details")}</h3>
                <p className="text-[10px] font-mono text-foreground dark:text-white uppercase tracking-widest mt-0.5">
                  ID: {(() => {
                    const parts = selectedBooking.bookingId.split('-');
                    return parts.length >= 3 
                      ? `${parts[1].slice(-1)}-${parts[2]}` 
                      : selectedBooking.bookingId;
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedBooking.status} />
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 hover:cursor-pointer"
                >
                  <XCircle className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              
              {/* Top Row Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary dark:text-blue-400 text-[11px] font-bold">
                  <Bike className="w-3.5 h-3.5" />
                  <span>Bike: {selectedBooking.bikeId || "N/A"}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duration: {selectedBooking.duration} mins</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold capitalize">
                  <Info className="w-3.5 h-3.5" />
                  <span>Type: {selectedBooking.bookingType === "ondemand" ? "On-Demand" : selectedBooking.bookingType}</span>
                </div>
              </div>

              {/* Rider & Session Grid */}
              <div className="grid grid-cols-3 gap-3 border-t border-border/50 pt-4 text-xs">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Rider Name</span>
                  <span className="font-bold text-foreground line-clamp-1">{selectedBooking.userFullName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Matrix No</span>
                  <span className="font-bold text-foreground font-mono">{selectedBooking.userMatrixNo || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">Practicum</span>
                  <span className="font-bold text-foreground">{selectedBooking.practicum || "N/A"}</span>
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
                        {selectedBooking.createdAt ? format(selectedBooking.createdAt.toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Milestone 2: Scheduled Start */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-blue-500 ring-2 ring-blue-500/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Scheduled Slot</span>
                      <span className="font-medium text-foreground">
                        {selectedBooking.startTime ? format(selectedBooking.startTime.toDate(), "dd/MM/yyyy HH:mm") : "N/A"}
                        {" - "}
                        {selectedBooking.endTime ? format(selectedBooking.endTime.toDate(), "HH:mm") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Milestone 3: Collected */}
                  {selectedBooking.collectedAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-green-500 ring-2 ring-green-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Collected</span>
                        <span className="font-semibold text-green-600 dark:text-green-400 font-mono">
                          {format(selectedBooking.collectedAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Milestone 4: Returned or Cancelled */}
                  {selectedBooking.returnedAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-primary dark:bg-blue-500 ring-2 ring-primary/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Returned</span>
                        <span className="font-semibold text-primary dark:text-blue-500 font-mono">
                          {format(selectedBooking.returnedAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedBooking.cancelledAt && (
                    <div className="relative animate-in fade-in duration-200">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-destructive ring-2 ring-destructive/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Cancelled ({selectedBooking.cancelledBy === "user" ? "By Rider" : "System"})</span>
                        <span className="font-semibold text-destructive font-mono">
                          {format(selectedBooking.cancelledAt.toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Extras & Return Inspection */}
              {(selectedBooking.isLate || selectedBooking.bikeConditionOnReturn) && (
                <div className="bg-muted/30 dark:bg-muted/10 p-3.5 rounded-xl border border-border/80 flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    {selectedBooking.bikeConditionOnReturn === "flagged" ? (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block text-foreground">Return Inspection Complete</span>
                      <span className="text-muted-foreground text-[10px]">
                        Condition was marked as{" "}
                        <strong className={`capitalize ${selectedBooking.bikeConditionOnReturn === "flagged" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {selectedBooking.bikeConditionOnReturn === "flagged" ? "damaged" : (selectedBooking.bikeConditionOnReturn || "Good")}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {selectedBooking.isLate && (
                    <div className="text-right shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-destructive text-[10px] font-bold border border-red-200 dark:border-red-900/50">
                        {selectedBooking.lateReturnMinutes ? `${selectedBooking.lateReturnMinutes}m Late` : "Late Return"}
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-muted/40 dark:bg-muted/10 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (selectedBooking) {
                    const text = selectedBooking.bookingId;
                    navigator.clipboard.writeText(text);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary dark:text-blue-500 hover:bg-primary/10 rounded-xl transition-all active:scale-95 hover:cursor-pointer w-full sm:w-auto justify-center"
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

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                {selectedBooking.status === "pending" && (
                  <button
                    onClick={() => {
                      handleAction(selectedBooking, "collect");
                      setSelectedBooking(null);
                    }}
                    className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-primary/15"
                  >
                    Collect
                  </button>
                )}
                {selectedBooking.status === "collected" && (
                  <button
                    onClick={() => {
                      handleAction(selectedBooking, "return");
                      setSelectedBooking(null);
                    }}
                    className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-green-600 rounded-xl hover:bg-green-500 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-green-600/15"
                  >
                    Return
                  </button>
                )}
                <button
                  onClick={() => {
                    handleAction(selectedBooking, "cancel");
                    setSelectedBooking(null);
                  }}
                  className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-destructive rounded-xl hover:bg-destructive/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-destructive/15"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-primary/15"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
