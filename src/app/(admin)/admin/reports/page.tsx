"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db, functions, storage } from "@/lib/firebase/client";
import {
  collection, query, orderBy, onSnapshot, Timestamp, limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ReportDocument, ReportType, ReportSeverity, ReportStatus } from "@/types";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  Flag, CheckCircle2, X, ChevronRight, AlertTriangle, Info,
  MessageSquare, ShieldAlert, Bike, Filter,
  User, Settings, History as HistoryIcon, Image as ImageIcon, Loader2, Copy, Check, XCircle, FileText, Clock, AlertCircle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatReportTime(createdAt: any) {
  if (!createdAt) return "—";
  const date = createdAt instanceof Timestamp ? createdAt.toDate() : (createdAt.toDate ? createdAt.toDate() : new Date(createdAt));
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  
  if (diffMins < 1) {
    return "1 minutes ago";
  }
  if (diffMins === 1) {
    return "1 minutes ago";
  }
  
  return formatDistanceToNow(date, { addSuffix: true })
    .replace("less than a minute ago", "1 minutes ago")
    .replace("about 1 minute ago", "1 minutes ago")
    .replace("1 minute ago", "1 minutes ago");
}

function formatPayloadKey(k: string): string {
  const spaced = k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatPayloadValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const str = String(v);
  if (str === "bike_damaged") return "Bike Damaged";
  if (str === "reported") return "Reported";
  if (str === "loose_chain") return "Loose Chain";
  
  if (str.includes("_") && /^[a-z0-9_]+$/.test(str)) {
    return str
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  
  if (/^[a-z]+$/.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  return str;
}

const TYPE_LABELS: Record<ReportType, string> = {
  damage_return: "Damage (Return)",
  damage_midride: "Damage (Mid-Ride)",
  collection_issue: "Collection Issue",
  policy_violation: "Policy Violation",
  contact_support: "Support Request",
};

const SHORT_TYPE_LABELS: Record<ReportType, string> = {
  damage_return: "Damage",
  damage_midride: "Damage",
  collection_issue: "Collection",
  policy_violation: "Violation",
  contact_support: "Support",
};

const TYPE_ICONS: Record<ReportType, React.ElementType> = {
  damage_return: Bike,
  damage_midride: Bike,
  collection_issue: AlertTriangle,
  policy_violation: ShieldAlert,
  contact_support: MessageSquare,
};

const SEV_STYLES: Record<ReportSeverity, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  high: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  medium: { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-400" },
  low: { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
};

const STATUS_STYLES: Record<ReportStatus, string> = {
  open: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800",
  in_review: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
  resolved: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800",
  dismissed: "bg-muted text-muted-foreground border border-border",
};

function SeverityBadge({ severity }: { severity: ReportSeverity }) {
  const s = SEV_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-700 uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function TypeBadge({ type }: { type: ReportType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{TYPE_LABELS[type]}</span>
      <span className="inline sm:hidden">{SHORT_TYPE_LABELS[type]}</span>
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminReportsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportDocument | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveStatus, setResolveStatus] = useState<"resolved" | "dismissed">("resolved");
  const [flipBike, setFlipBike] = useState(false);
  const [liftSuspension, setLiftSuspension] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<ReportType | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<ReportSeverity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "all">("open");
  const [filterBike, setFilterBike] = useState("");

  // Auto-apply support request filter if clicked from support desk dashboard card
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get("type");
      if (typeParam === "contact_support") {
        setFilterType("contact_support");
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ ...d.data(), reportId: d.id } as ReportDocument)));
      setLoading(false);
    }, (err) => {
      console.error("reports snapshot error:", err);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Auto-open selected report from URL query parameter 'open'
  useEffect(() => {
    if (reports.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const openId = params.get("open");
      if (openId) {
        const found = reports.find(r => r.reportId === openId);
        if (found) {
          setSelected(found);
          // Adjust status filter if the target report's status differs from current filter
          if (found.status !== filterStatus) {
            setFilterStatus(found.status);
          }
        }
      }
    }
  }, [reports]);

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterSeverity !== "all" && r.severity !== filterSeverity) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterBike && (!r.linkedBikeId || !r.linkedBikeId.toLowerCase().includes(filterBike.toLowerCase()))) return false;
      return true;
    });
  }, [reports, filterType, filterSeverity, filterStatus, filterBike]);

  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Reset loaded photoUrl when selection changes to prevent leakage/caching issues
  useEffect(() => {
    setPhotoUrl(null);
  }, [selected]);

  // Load photo URL dynamically only when clicked
  const handleViewPhoto = async (path: string) => {
    if (!path) return;
    if (photoUrl) {
      setViewingPhotoUrl(photoUrl);
      return;
    }
    setPhotoLoading(true);
    try {
      const url = await getDownloadURL(ref(storage, path));
      setPhotoUrl(url);
      setViewingPhotoUrl(url);
    } catch (err) {
      console.error("Error loading image:", err);
      toast.error("Failed to load photo");
    } finally {
      setPhotoLoading(false);
    }
  };

  const copyIdToClipboard = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const openResolveModal = () => {
    setResolveNote("");
    setResolveStatus("resolved");
    setFlipBike(false);
    setLiftSuspension(false);
    setResolveError(null);
    setShowResolveModal(true);
  };

  const handleResolve = useCallback(async () => {
    if (!selected || !user) return;
    setResolving(true);
    setResolveError(null);
    try {
      const fn = httpsCallable(functions, "resolveReport");
      await fn({
        reportId: selected.reportId,
        newStatus: resolveStatus,
        resolutionNote: resolveNote.trim() || undefined,
        flipBikeAvailable: flipBike,
        liftSuspension,
      });
      setShowResolveModal(false);
      setSelected(null);
    } catch (err: unknown) {
      setResolveError(err instanceof Error ? err.message : "Failed to resolve report.");
    } finally {
      setResolving(false);
    }
  }, [selected, user, resolveStatus, resolveNote, flipBike, liftSuspension]);

  if (!user || loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;

  const openCount = reports.filter(r => r.status === "open").length;
  const highCount = reports.filter(r => (r.severity === "high" || r.severity === "critical") && r.status === "open").length;

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">{t("admin.reports.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span><span>›</span><span>{t("admin.reports.incidents")}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-8 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Filter className="w-4 h-4 text-primary shrink-0" />
            <span>{t("admin.reports.filter")}</span>
          </div>
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 flex-wrap">
            {highCount > 0 && (
              <>
                <span className="text-red-600 dark:text-red-400 font-bold">
                  {highCount} High Priority
                </span>
                <span>•</span>
              </>
            )}
            <span>{openCount} Open Incidents</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("admin.reports.type")}</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as ReportType | "all")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">{t("admin.reports.allTypes")}</option>
              {(Object.keys(TYPE_LABELS) as ReportType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("admin.reports.severity")}</label>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value as ReportSeverity | "all")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">{t("admin.reports.allSeverities")}</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("admin.reports.status")}</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as ReportStatus | "all")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">{t("admin.reports.allStatuses")}</option>
              <option value="open">Open</option>
              <option value="in_review">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("admin.reports.bikeId")}</label>
            <input
              type="text"
              placeholder="e.g. B001"
              value={filterBike}
              onChange={e => setFilterBike(e.target.value.toUpperCase())}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all uppercase placeholder:normal-case font-medium"
            />
          </div>
        </div>

        {(filterType !== "all" || filterSeverity !== "all" || filterStatus !== "open" || filterBike) && (
          <div className="flex justify-end pt-2">
            <button
              onClick={() => { setFilterType("all"); setFilterSeverity("all"); setFilterStatus("open"); setFilterBike(""); }}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 transition-colors uppercase tracking-wider"
            >
              {t("admin.reports.clear")}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="w-full">
        {/* Report List */}
        {filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold text-foreground mb-1">{t("admin.reports.noReports")}</h3>
            <p className="text-sm text-muted-foreground">{t("admin.reports.noReportsDesc")}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
            {filtered.map((r) => {
              const Icon = TYPE_ICONS[r.type];
              const sev = SEV_STYLES[r.severity];
              return (
                <button
                  key={r.reportId}
                  onClick={() => setSelected(r)}
                  className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sev.bg} ${sev.text}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none mb-1.5 whitespace-nowrap">
                        <SeverityBadge severity={r.severity} />
                        <TypeBadge type={r.type} />
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="font-bold text-foreground text-sm truncate">{r.userFullName}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono min-w-0 w-full truncate whitespace-nowrap">
                        <span className="truncate max-w-[85px] sm:max-w-none inline-block align-bottom">
                          <span className="hidden sm:inline">Matrix: </span>
                          {r.userMatrixNo}
                        </span>
                        {r.linkedBikeId && (
                          <>
                            <span className="shrink-0">•</span>
                            <span className="font-bold text-primary shrink-0">
                              <span className="hidden sm:inline">Bike: </span>
                              {r.linkedBikeId}
                            </span>
                          </>
                        )}
                        <span className="shrink-0">•</span>
                        <span className="shrink-0">{formatReportTime(r.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider hidden sm:inline">{t("admin.reports.viewDetails")}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && !showResolveModal && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => setSelected(null)}
          />

          {/* Modal Container */}
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[500px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 font-sans max-h-[85vh] md:max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">{t("admin.reports.details")}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    ID: {selected.reportId}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button
                  onClick={() => setSelected(null)}
                  className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 cursor-pointer animate-none"
                >
                  <XCircle className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              
              {/* Top Row Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary dark:text-blue-400 text-[11px] font-bold">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="uppercase">Severity: {selected.severity}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Type: {TYPE_LABELS[selected.type]}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold capitalize">
                  <Info className="w-3.5 h-3.5" />
                  <span>Status: {selected.status.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Submitter Profile section */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-primary" /> Submitter Profile
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/20 dark:bg-muted/5 p-3.5 rounded-xl border border-border/40 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Submitter Name</span>
                    <span className="font-bold text-foreground line-clamp-1">{selected.userFullName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Matrix No</span>
                    <span className="font-bold text-foreground font-mono uppercase">{selected.userMatrixNo || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Practicum</span>
                    <span className="font-semibold text-primary dark:text-blue-400 uppercase">GEN</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">User UID</span>
                    <span className="font-mono text-muted-foreground block truncate" title={selected.userId}>
                      {selected.userId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Report Timeline & Logs */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <HistoryIcon className="h-3.5 w-3.5 text-primary" /> Report Timeline & Logs
                </h4>
                <div className="relative pl-5 space-y-3.5 before:absolute before:left-[8px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border/60">
                  {/* Created */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-slate-400 ring-2 ring-slate-400/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Report Submitted</span>
                      <span className="font-medium text-foreground">
                        {selected.createdAt ? format((selected.createdAt as any).toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Resolved */}
                  {selected.resolvedAt && (
                    <div className="relative">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-green-500 ring-2 ring-green-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Report Resolved</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {format((selected.resolvedAt as any).toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Incident Details & Logs */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Settings className="h-3.5 w-3.5 text-primary" /> Incident Details & Logs
                </h4>
                <div className="space-y-2.5 text-xs">
                  {selected.linkedBikeId && (
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Linked Bike ID</span>
                      <span className="font-mono font-bold text-primary dark:text-blue-500">{selected.linkedBikeId}</span>
                    </div>
                  )}

                  {selected.linkedBookingId && (
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Linked Booking ID</span>
                      <span className="font-mono text-foreground font-medium">{selected.linkedBookingId}</span>
                    </div>
                  )}

                  {/* Dynamic Payload fields */}
                  {Object.entries(selected.payload as unknown as Record<string, unknown>)
                    .filter(([k]) => !["bikeId", "bookingId", "issuePhotoPath", "returnPhotoPath"].includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-border/30 gap-4">
                        <span className="text-muted-foreground shrink-0">{formatPayloadKey(k)}</span>
                        <span className="font-semibold text-foreground text-right break-words">{formatPayloadValue(v)}</span>
                      </div>
                    ))}

                  {/* On-demand Photo Loader Link */}
                  {(() => {
                    const payload = selected.payload as unknown as Record<string, unknown>;
                    const path = (payload["issuePhotoPath"] ?? payload["returnPhotoPath"]) as string | undefined;
                    if (path) {
                      return (
                        <div className="flex justify-between items-center py-1 border-b border-border/30">
                          <span className="text-muted-foreground">Inspection Photo</span>
                          <button 
                            type="button"
                            onClick={() => handleViewPhoto(path)}
                            disabled={photoLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer"
                          >
                            {photoLoading ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Loading...</span>
                              </>
                            ) : (
                              <>
                                <ImageIcon className="w-3 h-3" />
                                <span>View Photo</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="flex justify-between items-center py-1 border-b border-border/30">
                        <span className="text-muted-foreground">Inspection Photo</span>
                        <span className="font-mono text-muted-foreground">None</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Resolution Log Section */}
              {selected.status !== "open" && selected.resolvedAt && (
                <div className="border-t border-border/50 pt-4 space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Resolution Log
                  </h4>
                  <div className="bg-green-500/5 dark:bg-green-950/10 border border-green-500/10 rounded-xl p-3.5 text-xs space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[9px] uppercase tracking-wider block">Resolved Status</span>
                      <span className="font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">{selected.status}</span>
                    </div>
                    {selected.resolutionNote && (
                      <div>
                        <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Resolution Note</span>
                        <p className="text-foreground leading-relaxed bg-background/50 border border-border/30 rounded-lg p-3 text-xs leading-normal">{selected.resolutionNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-muted/40 dark:bg-muted/10 border-t border-border/60 flex flex-row items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => copyIdToClipboard(selected.reportId)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary dark:text-blue-500 hover:bg-primary/10 rounded-xl transition-all active:scale-95 hover:cursor-pointer justify-center"
              >
                {copiedId === selected.reportId ? (
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
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-5 py-2.5 text-xs font-semibold text-foreground bg-background border border-border rounded-xl hover:bg-muted transition-all active:scale-95 hover:cursor-pointer"
                >
                  Close
                </button>
                {(selected.status === "open" || selected.status === "in_review") && (
                  <button
                    type="button"
                    onClick={openResolveModal}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-primary/15"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Resolve Report</h3>
              <button onClick={() => setShowResolveModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Action */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">Action</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["resolved", "dismissed"] as const).map(s => (
                    <button key={s} onClick={() => setResolveStatus(s)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${resolveStatus === s ? "bg-primary text-white border-primary" : "bg-background border-border text-foreground hover:border-primary/50"}`}>
                      {s === "resolved" ? "Mark Resolved" : "Dismiss"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">Resolution Note (optional)</label>
                <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={3}
                  placeholder="Add a note for the record…"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Checkboxes */}
              {selected.linkedBikeId && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={flipBike} onChange={e => setFlipBike(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Mark bike {selected.linkedBikeId} as available</span>
                    <p className="text-xs text-muted-foreground">Flips status and adjusts inventory</p>
                  </div>
                </label>
              )}
              {(selected.type === "policy_violation" || selected.userId) && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={liftSuspension} onChange={e => setLiftSuspension(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Lift user suspension</span>
                    <p className="text-xs text-muted-foreground">Clears isBlocked / cooldownUntil and resets late return count</p>
                  </div>
                </label>
              )}

              {resolveError && (
                <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl border border-destructive/20">
                  {resolveError}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex gap-3">
              <button onClick={() => setShowResolveModal(false)} disabled={resolving}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleResolve} disabled={resolving}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]">
                {resolving ? <LoadingSpinner /> : <><CheckCircle2 className="w-4 h-4" />Confirm</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Photo Viewer Modal */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <button 
            type="button"
            onClick={() => setViewingPhotoUrl(null)} 
            className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all cursor-pointer z-[210]"
            title="Close image"
          >
            <XCircle className="w-8 h-8" />
          </button>
          
          <div className="relative max-w-4xl max-h-[90vh] p-4 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={viewingPhotoUrl} 
              alt="Expanded preview" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
