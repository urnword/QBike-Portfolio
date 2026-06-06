"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase/client";
import { collection, query, orderBy, onSnapshot, Timestamp, limit } from "firebase/firestore";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { DataTable, Column } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { ClipboardList, Filter } from "lucide-react";

interface AuditLogDocument {
  id: string;
  action: string;
  adminUid: string;
  targetId: string;
  timestamp: Timestamp;
  details?: Record<string, any>;
}

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminActionLogPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "auditLog"), orderBy("timestamp", "desc"), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogDocument)));
        setLoading(false);
      },
      (err) => {
        console.error("auditLog snapshot error:", err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  if (!user || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== "all" && log.action !== filterAction) return false;
    return true;
  });

  const columns: Column<AuditLogDocument>[] = [
    {
      key: "timestamp",
      label: t("admin.actionLog.colDate"),
      sortable: true,
      render: (val) => {
        const timestamp = val as Timestamp;
        return timestamp ? format(timestamp.toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A";
      },
    },
    {
      key: "action",
      label: t("admin.actionLog.colAction"),
      sortable: true,
      render: (val) => (
        <span className="font-semibold text-primary/90 bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
          {String(val)}
        </span>
      ),
    },
    {
      key: "adminUid",
      label: t("admin.actionLog.colAdmin"),
      sortable: true,
      render: (val) => (
        <span className="font-mono text-xs text-muted-foreground">{String(val)}</span>
      ),
    },
    {
      key: "targetId",
      label: t("admin.actionLog.colTarget"),
      sortable: true,
      render: (val) => (
        <span className="font-mono text-xs text-foreground">{String(val)}</span>
      ),
    },
    {
      key: "details",
      label: t("admin.actionLog.colDetails"),
      sortable: false,
      render: (val) => {
        if (!val) return <span className="text-muted-foreground italic text-xs">{t("admin.actionLog.noDetails")}</span>;
        const details = val as Record<string, any>;
        return (
          <div className="text-xs space-y-0.5">
            {Object.entries(details).map(([k, v]) => (
              <div key={k}>
                <span className="text-muted-foreground">{k}:</span>{" "}
                <span className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">{t("admin.actionLog.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("Action Log")}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-8 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
          <Filter className="w-4 h-4 text-primary shrink-0" />
          <span>{t("admin.actionLog.filter")}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("admin.actionLog.actionType")}</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">{t("admin.actionLog.allActions")}</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filterAction !== "all" && (
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setFilterAction("all")}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 transition-colors uppercase tracking-wider"
            >
              {t("admin.actionLog.clear")}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <DataTable columns={columns} data={filteredLogs} pageSize={15} />
      </div>
    </div>
  );
}
