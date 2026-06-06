"use client";

import React, { useState, useEffect } from "react";
import { Users, Bike, CheckCircle, Calendar, ShieldAlert, ArrowRight, Activity, Download, Power } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot, collection, query, where, limit, orderBy } from "firebase/firestore";
import { useAuth } from "@/lib/hooks/useAuth";
import { InventorySingleton, ReportDocument, PolicySingleton } from "@/types";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { formatDistanceToNow } from "date-fns";
import { updateSystemPolicy, bulkCancelAllActiveBookings } from "@/actions/admin";
import { signOutAllUsers } from "./maintenance/actions";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventorySingleton | null>(null);
  const [alerts, setAlerts] = useState<ReportDocument[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number | null>(null);
  const [openIncidentsCount, setOpenIncidentsCount] = useState<number | null>(null);
  const [policy, setPolicy] = useState<PolicySingleton | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonCriticalCount, setNonCriticalCount] = useState<number | null>(null);

  // Emergency stop confirmation & actions state
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;

    // 1. Inventory counts listener
    const unsubInv = onSnapshot(doc(db, "inventory", "current"), (snap) => {
      if (snap.exists()) setInventory(snap.data() as InventorySingleton);
    }, (err) => {
      console.error("Error fetching inventory:", err);
    });

    // 2. Critical/High alerts listener
    const qAlerts = query(
      collection(db, "reports"),
      where("status", "==", "open"),
      where("severity", "in", ["high", "critical"]),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      setAlerts(snap.docs.map(d => ({ ...d.data(), reportId: d.id } as ReportDocument)));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching admin alerts:", err);
      setLoading(false);
    });

    // 3. Policy settings listener
    const unsubPolicy = onSnapshot(doc(db, "policy", "current"), (snap) => {
      if (snap.exists()) setPolicy(snap.data() as PolicySingleton);
    }, (err) => {
      console.error("Error fetching policy:", err);
    });

    // 4. Pending approvals listener
    const qPending = query(
      collection(db, "users"),
      where("verificationStatus", "==", "pending")
    );
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPendingApprovalsCount(snap.size);
    }, (err) => {
      console.error("Error fetching pending approvals count:", err);
    });

    // 5. Open support requests listener
    const qSupport = query(
      collection(db, "reports"),
      where("status", "==", "open"),
      where("type", "==", "contact_support")
    );
    const unsubSupport = onSnapshot(qSupport, (snap) => {
      setOpenIncidentsCount(snap.size);
    }, (err) => {
      console.error("Error fetching open support requests count:", err);
    });

    // 6. Non-critical/high open reports listener
    const qNonCritical = query(
      collection(db, "reports"),
      where("status", "==", "open"),
      where("severity", "in", ["low", "medium"])
    );
    const unsubNonCritical = onSnapshot(qNonCritical, (snap) => {
      setNonCriticalCount(snap.size);
    }, (err) => {
      console.error("Error fetching non-critical reports count:", err);
    });

    return () => {
      unsubInv();
      unsubAlerts();
      unsubPolicy();
      unsubPending();
      unsubSupport();
      unsubNonCritical();
    };
  }, [user?.uid]);

  // Handle Export CSV Report
  const handleDownloadReport = () => {
    toast.info("This feature is coming soon.");
  };

  // Trigger Emergency Stop Toggle
  const handleEmergencyStopToggle = async () => {
    if (updatingPolicy) return;
    setUpdatingPolicy(true);
    try {
      const currentStatus = policy?.isBookingOpen ?? true;
      const nextStatus = !currentStatus;

      await updateSystemPolicy({
        isBookingOpen: nextStatus,
      });

      if (!nextStatus) {
        // Force logout all active non-admin users & cancel all ongoing rentals
        const cancelRes = await bulkCancelAllActiveBookings();
        const signOutRes = await signOutAllUsers();

        let msg = "Emergency Stop Activated. Booking system locked successfully!";
        if (cancelRes.success && cancelRes.count > 0) {
          msg += ` Cancelled ${cancelRes.count} active booking(s).`;
        }
        if (signOutRes.success) {
          msg += " Forcefully logged out all active user sessions.";
        }
        toast.success(msg);
      } else {
        toast.success("Emergency Stop Deactivated. Booking system unlocked.");
      }
    } catch (err) {
      console.error("Failed to toggle emergency status:", err);
      toast.error("Failed to update operational status.");
    } finally {
      setUpdatingPolicy(false);
      setShowStopConfirm(false);
    }
  };

  const stats = [
    { label: t("admin.overview.totalCapacity"), value: inventory?.total ?? 0, icon: Users, color: "text-primary", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/30", href: "/admin/users" },
    { label: t("admin.overview.activeBookings"), value: inventory?.inUse ?? 0, icon: Calendar, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/40 border-green-100 dark:border-green-900/30", href: "/admin/bookings" },
    { label: t("admin.overview.availableBikes"), value: inventory?.available ?? 0, icon: Bike, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/30", href: "/admin/bikes" },
    { label: t("admin.overview.pendingApprovals"), value: pendingApprovalsCount !== null ? pendingApprovalsCount : "...", icon: CheckCircle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/30", href: "/admin/verification" },
  ];

  if (!user || loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">{t("admin.overview.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.overview.overview")}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={handleDownloadReport}
            className="w-full sm:w-auto bg-card border border-border text-foreground px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-muted transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {t("admin.overview.download")}
          </button>
          <button
            onClick={() => setShowStopConfirm(true)}
            className={`w-full sm:w-auto px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm text-white transition-all flex items-center justify-center gap-2 cursor-pointer ${policy?.isBookingOpen === false
                ? "bg-green-600 hover:bg-green-700 shadow-green-500/20"
                : "bg-red-600 hover:bg-red-700 shadow-red-500/20"
              }`}
          >
            <Power className="w-4 h-4" />
            {policy?.isBookingOpen === false ? t("admin.overview.resume") : t("admin.overview.stop")}
          </button>
        </div>
      </div>

      {/* Emergency Lock Active Banner */}
      {policy?.isBookingOpen === false && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 mb-6 flex items-start gap-3 animate-pulse">
          <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-800 dark:text-red-400 text-sm">{t("admin.overview.lockActive")}</h4>
            <p className="text-xs text-red-700 dark:text-red-500/90 leading-relaxed mt-0.5 font-medium">
              {t("admin.overview.lockDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.href} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all group block">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 border`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1 truncate">{stat.label}</span>
                <span className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* System Activity/Alerts */}
        <div className="lg:col-span-2 bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="text-lg font-medium text-foreground">{t("admin.overview.criticalAlerts")}</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t("admin.overview.criticalAlertsDesc")}</p>
          </div>

          <div className="p-0">
            {alerts.length === 0 ? (
              <div className="p-16 text-center">
                <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h4 className="font-semibold text-foreground mb-1">{t("admin.overview.noAlerts")}</h4>
                <p className="text-xs text-muted-foreground">{t("admin.overview.noAlertsDesc")}</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {alerts.map((alert, i) => {
                    const issueType = alert.type === 'policy_violation' ? 'Policy Violation'
                      : alert.type === 'damage_return' ? 'Damage on Return'
                      : alert.type === 'damage_midride' ? 'Mid-Ride Damage'
                      : alert.type === 'contact_support' ? 'Support Request'
                      : alert.type === 'collection_issue' ? 'No Bikes Available'
                      : (alert.type as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

                    return (
                      <div key={i} className="flex gap-4 p-5 hover:bg-muted/40 transition-colors items-center justify-between">
                        <div className="flex gap-3.5 items-center min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 border ${alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20 text-red-600 border-red-100 dark:border-red-900/30' :
                              'bg-orange-50 dark:bg-orange-950/20 text-orange-600 border-orange-100 dark:border-orange-900/30'
                            }`}>
                            <ShieldAlert className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground block truncate">{issueType}</span>
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              {alert.createdAt ? formatDistanceToNow((alert.createdAt as any).toDate(), { addSuffix: true }) : 'Just now'}
                              {alert.linkedBikeId && ` • Bike ${alert.linkedBikeId}`}
                            </span>
                          </div>
                        </div>
                        <Link href={`/admin/reports?open=${alert.reportId}`} className="text-[11px] font-medium text-primary hover:text-primary/80 uppercase tracking-widest shrink-0 border border-primary/20 bg-primary/5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ml-3">
                          Review
                        </Link>
                      </div>
                    );
                  })}
                </div>

                {nonCriticalCount !== null && nonCriticalCount > 0 && (
                  <div className="px-6 py-4 bg-muted/10 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <span>
                        You have {nonCriticalCount} other open {nonCriticalCount === 1 ? 'incident report' : 'incident reports'} requiring review.
                      </span>
                    </div>
                    <Link href="/admin/reports" className="font-semibold text-primary hover:underline transition-all whitespace-nowrap ml-2">
                      View All
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Management */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-1.5">
              {[
                { title: "Review New Users", href: "/admin/verification" },
                { title: "Inventory Management", href: "/admin/bikes" },
                { title: "Update System Policy", href: "/admin/policy" },
                { title: "View All Bookings", href: "/admin/bookings/history" },
              ].map((action, i) => (
                <Link key={i} href={action.href} className="flex items-center justify-between p-4 hover:bg-muted/40 rounded-xl transition-all border border-transparent hover:border-border group">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{action.title}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-[#1B3392] p-6 rounded-2xl shadow-sm relative overflow-hidden text-white shadow-blue-900/10">
            <div className="absolute top-[-20px] right-[-20px] opacity-10">
              <Users className="w-32 h-32 text-white" />
            </div>
            <h4 className="text-white text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4 animate-pulse text-red-400" />
              Support Desk
            </h4>
            <p className="text-white/80 text-xs leading-relaxed mb-4">
              You have {openIncidentsCount !== null ? openIncidentsCount : "..."} open student support requests requiring review.
            </p>
            <Link href="/admin/reports?type=contact_support" className="inline-flex items-center justify-center bg-white text-[#1B3392] px-6 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-sm hover:bg-white/95 transition-all cursor-pointer">
              View Inbox
            </Link>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in scale-in duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-4">
              <ShieldAlert className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-medium">
                {policy?.isBookingOpen ? "Confirm Emergency Stop" : "Resume Booking Operations"}
              </h3>
            </div>

            <div className="text-sm text-muted-foreground leading-relaxed mb-6 space-y-4">
              {policy?.isBookingOpen ? (
                <>
                  <p className="font-medium text-foreground">
                    Warning: You are about to initiate a system-wide operational lockdown.
                  </p>
                  <p>
                    Activating the Emergency Stop will execute the following overrides immediately:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-xs text-muted-foreground/90">
                    <li>🚫 <strong>Lock Booking Engine</strong>: Instantly shuts down new rentals campus-wide.</li>
                    <li>🔌 <strong>Force Log Out Everyone</strong>: Revokes sessions and logs out all active users.</li>
                    <li>❌ <strong>Cancel Active Rentals</strong>: Bulk-terminates all ongoing, pending, and late bookings.</li>
                  </ul>
                  <p className="text-xs text-red-500/90 font-medium">
                    This action is highly disruptive and should only be used in critical emergencies.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    You are about to restore standard booking operations.
                  </p>
                  <p>
                    Resuming will unlock the booking engine, allowing students and staff to rent bikes normally. Users will be permitted to log back into the application.
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowStopConfirm(false)}
                disabled={updatingPolicy}
                className="px-4 py-2 border border-border rounded-xl text-xs font-medium uppercase tracking-wider text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmergencyStopToggle}
                disabled={updatingPolicy}
                className={`px-4 py-2 rounded-xl text-xs font-medium uppercase tracking-wider text-white transition-colors cursor-pointer ${policy?.isBookingOpen
                    ? "bg-red-600 hover:bg-red-700 shadow-sm"
                    : "bg-green-600 hover:bg-green-700 shadow-sm"
                  }`}
              >
                {updatingPolicy ? "Updating..." : policy?.isBookingOpen ? "Trigger Lock" : "Resume Operations"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
