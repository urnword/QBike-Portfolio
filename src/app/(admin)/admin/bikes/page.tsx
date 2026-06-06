"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BikeDocument, BikeDamageDocument, MaintenanceDocument } from "@/types";
import { Plus, AlertCircle, CheckCircle2, Trash2, Wrench, Edit2, Search, Download, ChevronDown, ChevronRight, Clock, User, Calendar, RefreshCcw, Copy, Check, X, FileText, ClipboardList } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { db, functions, storage } from "@/lib/firebase/client";
import { collection, onSnapshot, doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useLanguage } from "@/lib/i18n/LanguageContext";

import { useAuth } from "@/lib/hooks/useAuth";
import { updateBikeStatus, deleteBike, createBike, bulkCreateBikes, adminUpdateBike, syncInventory } from "@/actions/admin";

// Local column type for the bikes custom <table> (not using DataTable component).
type BikeColumn = {
  key: keyof BikeDocument;
  label: string;
  sortable?: boolean;
  render?: (v: BikeDocument[keyof BikeDocument], item: BikeDocument) => React.ReactNode;
};

const BIKE_PARTS = [
  "Front Tire",
  "Rear Tire",
  "Brake Pads",
  "Brake Cables",
  "Chain",
  "Pedals",
  "Handlebar Grips",
  "Saddle",
  "Kickstand",
  "Bell",
  "Front Basket",
  "Rear Rack",
  "Headlight/Reflector",
  "Wheel Rim",
  "Inner Tube",
  "Others"
];

const ISSUE_TYPE_LABELS: Record<string, string> = {
  flat_tire: "Flat Tire",
  loose_chain: "Loose Chain",
  broken_brake: "Broken Brake",
  seat_damage: "Seat Damage",
  frame_damage: "Frame Damage",
  other: "Other",
};

export default function AdminBikesPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [bikes, setBikes] = useState<BikeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newBikeId, setNewBikeId] = useState("");
  const [targetTotal, setTargetTotal] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // States for row click detailed popup modal & subcollection logs
  const [selectedDetailBike, setSelectedDetailBike] = useState<BikeDocument | null>(null);
  const [damages, setDamages] = useState<BikeDamageDocument[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceDocument[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [editBike, setEditBike] = useState<BikeDocument | null>(null);
  // BikeUpdatePayload is the allowlist type that adminUpdateBike accepts.
  // Using it here prevents admin-only fields (like flaggedAt as Timestamp) from leaking in.
  const [editData, setEditData] = useState<{
    status?: BikeDocument["status"];
    condition?: BikeDocument["condition"];
  }>({});
  const [resyncing, setResyncing] = useState(false);

  const [maintenanceBike, setMaintenanceBike] = useState<BikeDocument | null>(null);
  const [maintDescription, setMaintDescription] = useState("");
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [customPartText, setCustomPartText] = useState("");
  const [maintSubmitting, setMaintSubmitting] = useState(false);
  const [maintError, setMaintError] = useState("");

  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [fetchingPhotoId, setFetchingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");

  const handleOpenPhoto = async (dmgId: string, path: string) => {
    if (!path) return;
    setFetchingPhotoId(dmgId);
    setPhotoError("");
    try {
      let url = "";
      if (path.startsWith("http://") || path.startsWith("https://")) {
        url = path;
      } else {
        const imageRef = ref(storage, path);
        url = await getDownloadURL(imageRef);
      }
      setViewingPhotoUrl(url);
    } catch (err: any) {
      console.error("Failed to load photo:", err);
      setPhotoError(err.message || "Failed to retrieve photo.");
      alert(`Error loading photo: ${err.message || "Could not retrieve from storage."}`);
    } finally {
      setFetchingPhotoId(null);
    }
  };

  const handleLogMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceBike) return;
    if (!maintDescription.trim()) {
      setMaintError("Please describe the repair/actions taken.");
      return;
    }
    setMaintSubmitting(true);
    setMaintError("");

    try {
      const logMaintFn = httpsCallable(functions, "logMaintenance");
      const parts = [
        ...selectedParts.filter(p => p !== "Others"),
        ...(selectedParts.includes("Others") && customPartText.trim() ? [customPartText.trim()] : [])
      ];
      await logMaintFn({
        bikeId: maintenanceBike.bikeId,
        description: maintDescription.trim(),
        changedParts: parts,
      });

      // Clear states
      setMaintenanceBike(null);
      setMaintDescription("");
      setSelectedParts([]);
      setCustomPartText("");

      // If we are currently viewing this bike in the details modal, let's update selectedDetailBike's local state
      // (though Firestore will trigger updates automatically, let's update local selectedDetailBike for instantaneous UX)
      if (selectedDetailBike && selectedDetailBike.bikeId === maintenanceBike.bikeId) {
        setSelectedDetailBike((prev) => prev ? {
          ...prev,
          status: "available",
          condition: "good",
          flaggedReason: null,
          flaggedAt: null,
          maintenanceCount: (prev.maintenanceCount || 0) + 1,
        } : null);
      }
      alert(`Success: Bike ${maintenanceBike.bikeId} marked as repaired & logged to service records.`);
    } catch (err: any) {
      console.error("Failed to log maintenance:", err);
      setMaintError(err.message || "Failed to log maintenance.");
    } finally {
      setMaintSubmitting(false);
    }
  };

  // Subcollection logs real-time loader
  useEffect(() => {
    if (!selectedDetailBike) {
      setDamages([]);
      setMaintenanceLogs([]);
      return;
    }

    setLoadingLogs(true);
    const bikeId = selectedDetailBike.bikeId;

    // Real-time listener for damages subcollection
    const damagesRef = collection(db, "bikes", bikeId, "damages");
    const unsubDamages = onSnapshot(damagesRef, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BikeDamageDocument));
      docs.sort((a, b) => (b.reportedAt?.seconds || 0) - (a.reportedAt?.seconds || 0));
      setDamages(docs);
    }, (err) => {
      console.error("Error fetching damages:", err);
    });

    // Real-time listener for maintenance subcollection
    const maintRef = collection(db, "bikes", bikeId, "maintenance");
    const unsubMaint = onSnapshot(maintRef, (snap) => {
      const docs = snap.docs.map(doc => ({ maintenanceId: doc.id, ...doc.data() } as MaintenanceDocument));
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMaintenanceLogs(docs);
      setLoadingLogs(false);
    }, (err) => {
      console.error("Error fetching maintenance:", err);
      setLoadingLogs(false);
    });

    return () => {
      unsubDamages();
      unsubMaint();
    };
  }, [selectedDetailBike]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Simple feedback could be added here if needed, but we'll use a better UI below
  };

  const handleResync = async () => {
    const confirmed = window.confirm(
      "WARNING: Resyncing the inventory may cause the system to break. " +
      "Only use this feature when there are no active bookings and if the bike counts have gone out of sync.\n\n" +
      "Do you want to proceed?"
    );
    if (!confirmed) return;

    setResyncing(true);
    try {
      const res = await syncInventory();
      if (res.success) {
        alert("Inventory resynced successfully!");
      }
    } catch (err: any) {
      alert("Failed to resync inventory: " + err.message);
    } finally {
      setResyncing(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, "bikes"), (snap) => {
      setBikes(snap.docs.map(doc => ({ bikeId: doc.id, ...doc.data() } as BikeDocument)));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching bikes:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (bikes.length > 0 && targetTotal === 0) {
      setTargetTotal(bikes.length);
    }
  }, [bikes]);

  const filteredBikes = useMemo(() => {
    if (!searchTerm) return bikes;
    const term = searchTerm.toLowerCase();
    return bikes.filter(b =>
      b.bikeId.toLowerCase().includes(term) ||
      b.status.toLowerCase().includes(term) ||
      b.condition.toLowerCase().includes(term)
    );
  }, [bikes, searchTerm]);

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetTotal <= bikes.length) {
      setError(`Target total must be greater than current total (${bikes.length}).`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await bulkCreateBikes(targetTotal);
      setShowAdd(false);
      alert(`Successfully added ${targetTotal - bikes.length} new bikes.`);
    } catch (err: any) {
      console.error("Error bulk adding bikes:", err);
      setError(err.message || "Failed to add bikes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editBike) return;
    setSubmitting(true);
    try {
      await adminUpdateBike(editBike.bikeId, editData);
      setEditBike(null);
    } catch (err: any) {
      alert("Failed to update bike: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = (formatType: "csv" | "xlsx") => {
    const capitalize = (s: string) => {
      if (!s) return "";
      return s.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    };

    const dataToExport = bikes.map(b => ({
      "Bike ID": b.bikeId,
      "Status": b.status ? capitalize(b.status) : "N/A",
      "Condition": b.condition ? capitalize(b.condition) : "N/A",
      "Current Active Booking ID": b.currentBookingId || "None",
      "Flagged Date & Time": b.flaggedAt ? format((b.flaggedAt as any).toDate(), "yyyy-MM-dd HH:mm") : "N/A",
      "Flagged Reason": b.flaggedReason || "N/A",
      "Times Flagged/Damaged": b.flaggedCount || 0,
      "Last Returned Date & Time": b.lastReturnedAt ? format((b.lastReturnedAt as any).toDate(), "yyyy-MM-dd HH:mm") : "N/A",
      "Last Rider Matrix Number": b.lastUsedByMatrix || "N/A",
      "Maintenance Count": b.maintenanceCount || 0,
      "Total Trips Completed": b.totalTrips || 0,
      "Last Updated Date & Time": b.updatedAt ? format((b.updatedAt as any).toDate(), "yyyy-MM-dd HH:mm") : "N/A"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bikes");

    if (formatType === "xlsx") {
      XLSX.writeFile(wb, `QBike_Inventory_${format(new Date(), "yyyyMMdd")}.xlsx`);
    } else {
      XLSX.writeFile(wb, `QBike_Inventory_${format(new Date(), "yyyyMMdd")}.csv`, { bookType: "csv" });
    }
  };


  const handleStatusChange = async (bikeId: string, currentStatus: string, newStatus: string) => {
    try {
      await updateBikeStatus(bikeId, currentStatus, newStatus);
    } catch (err) {
      console.error("Failed to update status", err);
      alert("Failed to update status. See console for details.");
    }
  };

  const handleDelete = async (bikeId: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${bikeId}?`)) return;
    try {
      await deleteBike(bikeId);
    } catch (err) {
      console.error("Failed to delete", err);
      alert("Failed to delete bike. Make sure it is available before deleting.");
    }
  };

  const columns: BikeColumn[] = [
    {
      key: "bikeId",
      label: t("admin.bikes.colId"),
      sortable: true,
      render: (v) => (
        <div className="flex items-center justify-center gap-2">
          <span className="font-bold">{v as string}</span>
        </div>
      )
    },
    { key: "status", label: t("admin.bikes.colStatus"), sortable: true, render: (v) => <StatusBadge status={v as string} /> },
    { key: "condition", label: t("admin.bikes.colCondition"), sortable: true, render: (v) => <StatusBadge status={v as string} /> },
    { key: "totalTrips", label: t("admin.bikes.colTrips"), sortable: true, render: (v) => (v as number) || 0 },
    {
      key: "bikeId", label: t("admin.bikes.colActions"), render: (_, item) => (
        <div className="flex gap-3 text-[11px] uppercase tracking-wider font-bold">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditBike(item);
              setEditData({ status: item.status, condition: item.condition });
            }}
            className="text-primary hover:underline flex items-center gap-1"
            title="Edit Data"
          >
            <Edit2 className="h-3 w-3" /> {t("admin.bikes.edit")}
          </button>
          {item.status === "available" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (confirm(`Mark ${item.bikeId} as damaged and move to maintenance?`)) {
                  await adminUpdateBike(item.bikeId, { status: "maintenance", condition: "flagged" });
                }
              }}
              className="text-amber-600 hover:underline flex items-center gap-1"
            >
              <Wrench className="h-3 w-3" /> {t("admin.bikes.flag")}
            </button>
          )}
          {item.status === "maintenance" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMaintenanceBike(item);
              }}
              className="text-green-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="h-3 w-3" /> {t("admin.bikes.repair")}
            </button>
          )}
          {item.status === "available" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item.bikeId);
              }}
              className="text-destructive hover:underline flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> {t("admin.bikes.delete")}
            </button>
          )}
        </div>
      )
    }
  ];

  const [addMode, setAddMode] = useState<"single" | "bulk">("bulk");

  const handleAddBike = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (addMode === "single") {
        if (!newBikeId.trim()) throw new Error("Please enter a Bike ID");
        await createBike(newBikeId.trim().toUpperCase());
        setNewBikeId("");
        setShowAdd(false);
        alert(`Bike ${newBikeId.toUpperCase()} added successfully.`);
      } else {
        if (targetTotal <= 0) throw new Error("Please enter a valid target total");
        const res = await bulkCreateBikes(targetTotal);
        setShowAdd(false);
        alert(`Successfully added ${res.added} new bikes.`);
      }
    } catch (err: any) {
      console.error("Error adding bike:", err);
      setError(err.message || "Failed to add bike.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">{t("admin.bikes.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.bikes.bikes")}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full md:w-auto">
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="w-full sm:w-auto flex-1 sm:flex-initial bg-card border border-border text-foreground px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-muted transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
            {resyncing ? t("admin.bikes.resyncing") : t("admin.bikes.resync")}
          </button>

          <button
            onClick={() => { setShowAdd(true); setError(""); }}
            className="w-full sm:w-auto flex-1 sm:flex-initial bg-primary text-white px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus className="h-4 w-4" /> {t("admin.bikes.add")}
          </button>

          <div className="flex bg-muted dark:bg-muted/50 rounded-full p-1 shadow-inner border border-border w-full sm:w-auto justify-center">
            <button
              onClick={() => handleExport("csv")}
              className="flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/10 dark:hover:bg-primary/20 hover:text-primary rounded-full transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="h-3 w-3" /> {t("admin.bikes.csv")}
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              className="flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/10 dark:hover:bg-primary/20 hover:text-primary rounded-full transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="h-3 w-3" /> {t("admin.bikes.xlsx")}
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-3xl max-w-md w-full p-8 shadow-2xl border border-border/60 dark:border-border/20 animate-in zoom-in-95 duration-200 relative overflow-hidden">

            {/* Decorative Background Blob */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />

            {/* Header Section */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                <Plus className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">{t("admin.bikes.updateFleet")}</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Add a new single bike or automatically expand your fleet total.
              </p>
            </div>

            {/* Segmented Toggle Control */}
            <div className="flex bg-muted p-1 rounded-2xl mb-6 w-full border border-border/30">
              <button
                onClick={() => { setAddMode("bulk"); setError(""); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${addMode === "bulk" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Bulk Expand
              </button>
              <button
                onClick={() => { setAddMode("single"); setError(""); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${addMode === "single" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Manual Entry
              </button>
            </div>

            {/* Form Section */}
            <form onSubmit={handleAddBike} className="space-y-6">
              {addMode === "bulk" ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block pl-1">
                    Target Total
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    placeholder="e.g. 100"
                    value={targetTotal || ""}
                    onChange={(e) => setTargetTotal(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-muted/40 border border-border/80 rounded-2xl text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all placeholder:text-muted-foreground/60"
                  />
                  <p className="text-[10px] text-muted-foreground/80 pl-1 italic">
                    Fills in missing bike numbers sequentially up to B{String(targetTotal || 100).padStart(3, "0")}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block pl-1">
                    Specific Bike ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B001"
                    value={newBikeId}
                    onChange={(e) => setNewBikeId(e.target.value)}
                    className="w-full px-4 py-3 bg-muted/40 border border-border/80 rounded-2xl text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all uppercase placeholder:text-muted-foreground/60"
                  />
                  <p className="text-[10px] text-muted-foreground/80 pl-1 italic">
                    Specify an alphanumeric ID format (B001–B999) to restore a record.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold animate-in fade-in duration-200">
                  {error}
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex gap-3 pt-3 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-5 py-3 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-wider transition-all rounded-full border border-border/40 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-primary text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-lg shadow-primary/25 hover:bg-primary/95 transition-all disabled:opacity-50 active:scale-95"
                >
                  {submitting ? "Processing..." : addMode === "bulk" ? "Expand" : "Add Bike"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Search and Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search bike, status, condition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[10px] uppercase font-bold"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto text-xs text-muted-foreground justify-center sm:justify-start">
          <span>Showing <span className="font-bold text-foreground">{filteredBikes.length}</span> of <span className="font-bold text-foreground">{bikes.length}</span> bikes</span>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              <tr>
                {columns.map((col) => (
                  <th key={col.label} className="px-6 py-4 text-center whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBikes.map(item => (
                <tr
                  key={item.bikeId}
                  onClick={() => setSelectedDetailBike(item)}
                  className="hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {columns.map((col, i) => (
                    <td key={i} className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center">
                        {col.render ? col.render((item as any)[col.key], item) : (item as any)[col.key]}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editBike && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl max-w-md w-full p-6 shadow-lg border border-border">
            <div className="flex items-center gap-2 text-amber-600 mb-4">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-lg font-bold">Edit Bike: {editBike.bikeId}</h3>
            </div>

            <p className="text-xs text-muted-foreground mb-6 p-3 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-100 dark:border-amber-900/30">
              <span className="font-bold text-amber-700 dark:text-amber-500">Warning:</span> Modifying bike data manually can cause inventory desync if not handled carefully. Use for administrative corrections only.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
                <select
                  value={editData.status || ""}
                  onChange={e => setEditData({ ...editData, status: e.target.value as BikeDocument["status"] })}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none"
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Condition</label>
                <select
                  value={editData.condition || ""}
                  onChange={e => setEditData({ ...editData, condition: e.target.value as BikeDocument["condition"] })}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none"
                >
                  <option value="good">Good</option>
                  <option value="flagged">Flagged / Damaged</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setEditBike(null)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={submitting}
                  className="px-6 py-2 bg-primary text-white rounded-md text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {maintenanceBike && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card rounded-xl max-w-md w-full p-6 shadow-xl border border-border animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-lg font-bold">Log Repair & Maintenance</h3>
            </div>

            <p className="text-xs text-muted-foreground mb-6 p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-100 dark:border-green-900/30">
              <span className="font-bold text-green-700 dark:text-green-500">Bike ID:</span> {maintenanceBike.bikeId} <br />
              Logging this will set the bike status back to <span className="font-bold text-foreground">Available</span>, condition to <span className="font-bold text-foreground">Good</span>, increment the maintenance counter, and append a permanent log under its maintenance history.
            </p>

            <form onSubmit={handleLogMaintenanceSubmit} className="space-y-4">
              {maintError && (
                <div className="p-3 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20 font-semibold">
                  {maintError}
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Actions Taken / Description *
                </label>
                <textarea
                  value={maintDescription}
                  onChange={e => setMaintDescription(e.target.value)}
                  placeholder="Describe the repairs made (e.g. Replaced flat rear tire, aligned brake pads, lubricated chain drivetrain)."
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground placeholder-muted-foreground focus:outline-none min-h-[90px] resize-y"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Replaced Components (Select multiple)
                </label>

                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto p-1.5 border border-border/60 rounded-xl bg-muted/20">
                  {BIKE_PARTS.map((part) => {
                    const isSelected = selectedParts.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedParts(selectedParts.filter((p) => p !== part));
                          } else {
                            setSelectedParts([...selectedParts, part]);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 hover:cursor-pointer active:scale-95 border ${isSelected
                            ? "bg-primary border-primary text-white shadow-sm shadow-primary/25"
                            : "bg-card border-border/80 text-foreground hover:bg-muted"
                          }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        {part}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedParts.includes("Others") && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Specify Custom Replaced Components
                  </label>
                  <input
                    type="text"
                    value={customPartText}
                    onChange={(e) => setCustomPartText(e.target.value)}
                    placeholder="e.g. Fork, Chain Guard, Custom Bolts"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMaintenanceBike(null);
                    setMaintDescription("");
                    setSelectedParts([]);
                    setCustomPartText("");
                    setMaintError("");
                  }}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={maintSubmitting}
                  className="px-6 py-2 bg-green-600 text-white rounded-md text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-green-500 transition-colors cursor-pointer"
                >
                  {maintSubmitting ? "Submitting..." : "Log Repaired"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl max-w-xl w-full p-4 shadow-2xl border border-border/40 animate-in zoom-in-95 duration-200 relative overflow-hidden flex flex-col items-center">

            {/* Absolute close button */}
            <button
              onClick={() => setViewingPhotoUrl(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1.5 rounded-full bg-muted/60 dark:bg-muted/30 hover:bg-muted transition-colors z-10 cursor-pointer"
              title="Close viewer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="flex items-center gap-2 mb-3 self-start pl-2">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">Attached Photo</h3>
            </div>

            {/* Image display */}
            <div className="w-full bg-black/20 dark:bg-black/40 rounded-xl overflow-hidden flex items-center justify-center min-h-[300px] max-h-[60vh] border border-border/20">
              <img
                src={viewingPhotoUrl}
                alt="Reported damage incident"
                className="max-w-full max-h-[58vh] object-contain transition-all hover:scale-[1.02]"
              />
            </div>

            <div className="w-full flex justify-between items-center mt-3 px-2 text-[10px] text-muted-foreground">
              <span>Securely loaded from Cloud Storage</span>
              <a
                href={viewingPhotoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                Open in new tab <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Bike Details Popup Modal */}
      {selectedDetailBike && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">

            {/* Header Section */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50 bg-muted/5 dark:bg-muted/5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <ClipboardList className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">
                      Bike Reference: {selectedDetailBike.bikeId}
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Detailed bike overview.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailBike(null)}
                className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 hover:cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List Body Container */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">

              {/* SECTION 1: General Property Specifications List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Specifications
                </h4>

                <div className="border border-border rounded-lg overflow-hidden bg-muted/10 divide-y divide-border/40">
                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Bike ID</span>
                    <span className="font-bold text-foreground font-mono">{selectedDetailBike.bikeId}</span>
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Status</span>
                    <StatusBadge status={selectedDetailBike.status} />
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Condition</span>
                    <StatusBadge status={selectedDetailBike.condition} />
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Total Trips</span>
                    <span className="font-bold text-foreground">{selectedDetailBike.totalTrips || 0}</span>
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Total Maintenance</span>
                    <span className="font-bold text-primary">{selectedDetailBike.maintenanceCount || 0}</span>
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Flagged Count</span>
                    <span className={`font-bold ${selectedDetailBike.flaggedCount && selectedDetailBike.flaggedCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {selectedDetailBike.flaggedCount || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Last Rider</span>
                    {selectedDetailBike.lastUsedByMatrix ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-bold text-foreground">{selectedDetailBike.lastUsedByMatrix}</span>
                        <button
                          onClick={() => { copyToClipboard(selectedDetailBike.lastUsedByMatrix!); alert(`Copied matrix ${selectedDetailBike.lastUsedByMatrix}`); }}
                          className="p-1 hover:bg-muted-foreground/10 rounded text-muted-foreground transition-colors shrink-0"
                          title="Copy Matrix"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">None logged</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Last Returned</span>
                    <span className="font-semibold text-foreground text-[11px]">
                      {selectedDetailBike.lastReturnedAt ? format((selectedDetailBike.lastReturnedAt as any).toDate(), "yyyy-MM-dd hh:mm a") : "Never returned"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-semibold">Active Booking ID</span>
                    {selectedDetailBike.currentBookingId ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-bold text-primary truncate max-w-[200px]">{selectedDetailBike.currentBookingId}</span>
                        <button
                          onClick={() => { copyToClipboard(selectedDetailBike.currentBookingId!); alert(`Copied booking ID ${selectedDetailBike.currentBookingId}`); }}
                          className="p-1 hover:bg-primary/10 rounded text-primary transition-colors shrink-0"
                          title="Copy ID"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">Available in pool</span>
                    )}
                  </div>
                </div>

                {/* Flag Alert Callout in List */}
                {selectedDetailBike.condition === "flagged" && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Active Flag Alert:</span>
                      <p className="mt-0.5 text-[11px] leading-relaxed">{selectedDetailBike.flaggedReason || "Flagged - No reason description provided"}</p>
                      {selectedDetailBike.flaggedAt && (
                        <span className="block text-[10px] text-muted-foreground/80 mt-1">
                          Reported: {format((selectedDetailBike.flaggedAt as any).toDate(), "yyyy-MM-dd hh:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: Damage & Incidents List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500 border-b border-border pb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Damage History ({damages.length})
                </h4>

                {loadingLogs ? (
                  <div className="flex py-6 justify-center">
                    <LoadingSpinner />
                  </div>
                ) : damages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1 pl-1">No recorded damage reports.</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-card/50 divide-y divide-border/40">
                    {damages.map((dmg) => (
                      <div key={dmg.id} className="p-3 text-xs space-y-2 hover:bg-muted/10 transition-colors">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-200/50">
                            {dmg.issueType ? (ISSUE_TYPE_LABELS[dmg.issueType] || dmg.issueType) : "Incident"}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {dmg.reportedAt ? format(dmg.reportedAt.toDate(), "yyyy-MM-dd hh:mm a") : "N/A"}
                          </span>
                        </div>
                        <p className="text-foreground italic bg-muted/20 px-2.5 py-1.5 rounded border border-border/30">
                          "{dmg.issueDescription || "No comment description provided."}"
                        </p>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                          <span>Reporter: <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{dmg.reportedByMatrix || dmg.reportedBy}</span></span>
                          {dmg.issuePhotoPath && (
                            <button
                              type="button"
                              onClick={() => handleOpenPhoto(dmg.id, dmg.issuePhotoPath!)}
                              disabled={fetchingPhotoId === dmg.id}
                              className="text-primary font-bold text-[9px] uppercase tracking-wider hover:underline flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded transition-colors disabled:opacity-50 hover:cursor-pointer"
                            >
                              <FileText className="h-3 w-3" />
                              {fetchingPhotoId === dmg.id ? "Loading..." : "View Photo"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: Service & Maintenance Logs */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-500 border-b border-border pb-1.5 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Maintenance & Repair Records ({maintenanceLogs.length})
                </h4>

                {loadingLogs ? (
                  <div className="flex py-6 justify-center">
                    <LoadingSpinner />
                  </div>
                ) : maintenanceLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1 pl-1">No recorded service operations.</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-card/50 divide-y divide-border/40">
                    {maintenanceLogs.map((log) => (
                      <div key={log.maintenanceId} className="p-3 text-xs space-y-2.5 hover:bg-muted/10 transition-colors">
                        <div className="flex justify-between items-start text-[10px] border-b border-border/40 pb-1.5">
                          <div>
                            <span className="text-muted-foreground uppercase font-bold block text-[8px] tracking-wider mb-0.5">Technician</span>
                            <span className="font-bold text-foreground text-[11px]">{log.technicianName}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground uppercase font-bold block text-[8px] tracking-wider">Date Performed</span>
                            <span className="font-semibold text-muted-foreground font-mono text-[10px]">
                              {log.createdAt ? format(log.createdAt.toDate(), "yyyy-MM-dd") : "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold block">Repairs & Actions Taken</span>
                          <p className="text-foreground bg-muted/20 px-2.5 py-1.5 rounded border border-border/30 leading-relaxed">
                            {log.description}
                          </p>
                        </div>
                        {log.changedParts && log.changedParts.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-0.5">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold mr-1">Replaced:</span>
                            {log.changedParts.map((part, idx) => (
                              <span key={idx} className="text-[9px] font-bold bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded">
                                {part}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Footer Area */}
            <div className="p-4 bg-muted/40 dark:bg-muted/10 border-t border-border/60 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
              {/* Admin Actions */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold uppercase tracking-wider justify-center sm:justify-start">
                <button
                  onClick={() => {
                    setEditBike(selectedDetailBike);
                    setEditData({
                      status: selectedDetailBike.status,
                      condition: selectedDetailBike.condition
                    });
                  }}
                  className="text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
                  title="Edit Data"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>

                {selectedDetailBike.status === "available" && (
                  <button
                    onClick={async () => {
                      if (confirm(`Mark ${selectedDetailBike.bikeId} as damaged and move to maintenance?`)) {
                        await adminUpdateBike(selectedDetailBike.bikeId, { status: "maintenance", condition: "flagged" });
                      }
                    }}
                    className="text-amber-600 hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Flag
                  </button>
                )}

                {selectedDetailBike.status === "maintenance" && (
                  <button
                    onClick={() => {
                      setMaintenanceBike(selectedDetailBike);
                    }}
                    className="text-green-600 hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Repair
                  </button>
                )}

                {selectedDetailBike.status === "available" && (
                  <button
                    onClick={() => {
                      handleDelete(selectedDetailBike.bikeId);
                      setSelectedDetailBike(null);
                    }}
                    className="text-destructive hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedDetailBike(null)}
                className="w-full sm:w-auto px-6 py-2 bg-primary text-white font-bold text-xs uppercase tracking-wider rounded shadow hover:bg-primary/95 transition-all active:scale-95 cursor-pointer text-center"
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

