"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  ShieldAlert, RefreshCcw, LogOut, Sparkles, Trash2,
  Users, Clock, AlertTriangle, Loader2, X, CheckCircle2,
  BookX, FileX, UserX, Wrench,
} from "lucide-react";
import {
  signOutAllUsers,
  setLoginDisabled,
  deleteAllBookings,
  deleteAllNonAdminUsers,
  resetAllCooldowns,
  unblockAllUsers,
  resetLateReturnCounts,
  runNewSemesterClean,
  resolveStaleBookings,
  purgeIncidentReports,
} from "./actions";
import { syncInventory } from "@/actions/admin";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { app } from "@/lib/firebase/client";
import { toast } from "sonner";

// ─── Modal ─────────────────────────────────────────────────────────────────────

interface ModalConfig {
  isOpen: boolean;
  title: string;
  description: string;
  actionLabel: string;
  expectedText: string | null;
  danger: boolean;
  onConfirm: (text?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const CLOSED_MODAL: ModalConfig = {
  isOpen: false,
  title: "",
  description: "",
  actionLabel: "",
  expectedText: null,
  danger: true,
  onConfirm: async () => ({ success: false }),
};

// ─── Card section wrapper ───────────────────────────────────────────────────────

function Section({
  icon,
  iconBg,
  title,
  subtitle,
  children,
  borderColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  borderColor?: string;
}) {
  return (
    <div className={`bg-card rounded-2xl shadow-sm border overflow-hidden transition-all ${borderColor ?? "border-border"}`}>
      <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-base md:text-lg font-medium text-foreground">{title}</h3>
          <p className="text-[12px] md:text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-6 md:p-8 divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

// ─── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  title,
  description,
  children,
  isSwitch = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  isSwitch?: boolean;
}) {
  if (isSwitch) {
    return (
      <div className="flex items-center justify-between gap-6 py-6 first:pt-0 last:pb-0">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6 first:pt-0 last:pb-0">
      <div className="max-w-xl">
        <p className="font-medium text-sm text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0 w-full md:w-auto">{children}</div>
    </div>
  );
}

// ─── Buttons ───────────────────────────────────────────────────────────────────

function DangerBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 bg-destructive text-destructive-foreground px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-destructive/90 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap cursor-pointer w-full md:w-48 text-center"
    >
      {children}
    </button>
  );
}

function SafeBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap cursor-pointer w-full md:w-48 text-center"
    >
      {children}
    </button>
  );
}

function OutlineBtn({
  onClick,
  disabled,
  children,
  color = "amber",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  color?: "amber" | "blue" | "green";
}) {
  const cls = {
    amber: "border-amber-400/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20",
    blue: "border-primary/40 text-primary hover:bg-primary/5",
    green: "border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/20",
  }[color];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 border px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap cursor-pointer w-full md:w-48 text-center ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminMaintenancePage() {
  const [isLoginDisabled, setIsLoginDisabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalConfig>(CLOSED_MODAL);
  const [confirmInput, setConfirmInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [syncingInventory, setSyncingInventory] = useState(false);

  useEffect(() => {
    const db = getFirestore(app);
    const policyRef = doc(db, "policy", "current");
    const unsub = onSnapshot(policyRef, (snap) => {
      if (snap.exists()) setIsLoginDisabled(snap.data().loginDisabled === true);
    });
    return () => unsub();
  }, []);

  const openModal = (cfg: Omit<ModalConfig, "isOpen">) => {
    setModal({ ...cfg, isOpen: true });
    setConfirmInput("");
    setErrorMsg("");
  };

  const closeModal = () => setModal(CLOSED_MODAL);

  const handleConfirm = () => {
    if (modal.expectedText && confirmInput !== modal.expectedText) {
      setErrorMsg(`Type "${modal.expectedText}" exactly to confirm.`);
      return;
    }
    startTransition(async () => {
      const res = await modal.onConfirm(confirmInput);
      if (res.success) {
        toast.success(res.message ?? "Action completed.");
        closeModal();
      } else {
        setErrorMsg(res.error ?? "An error occurred.");
      }
    });
  };

  const toggleLoginDisabled = (checked: boolean) => {
    startTransition(async () => {
      const res = await setLoginDisabled(!checked);
      if (!res.success) toast.error("Failed to update login setting.");
    });
  };

  const handleSyncInventory = async () => {
    setSyncingInventory(true);
    try {
      const res = await syncInventory();
      if (res.success) {
        toast.success("Inventory resynced successfully!");
      } else {
        toast.error("Failed to resync inventory.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resync inventory.";
      toast.error(msg);
    } finally {
      setSyncingInventory(false);
    }
  };

  const canConfirm = !modal.expectedText || confirmInput === modal.expectedText;

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">

      {/* ── Confirmation Modal ── */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-foreground">{modal.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{modal.description}</p>
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground ml-4 shrink-0 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {modal.expectedText && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Type <span className="font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded text-xs">{modal.expectedText}</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                    placeholder={modal.expectedText}
                  />
                </div>
              )}
              {errorMsg && <p className="text-destructive text-sm font-medium">{errorMsg}</p>}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={closeModal}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isPending || !canConfirm}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer ${modal.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-white hover:bg-primary/90"}`}
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modal.actionLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">System Maintenance</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>Admin Console</span>
            <span>›</span>
            <span>Maintenance</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 md:space-y-8">

        {/* ── 1. Critical Killswitches ── */}
        <Section
          icon={<ShieldAlert className="w-5 h-5 text-destructive" />}
          iconBg="bg-destructive/10 border-destructive/10 text-destructive"
          title="Critical Killswitches"
          subtitle="Immediate platform-wide access controls"
          borderColor="border-destructive/20"
        >
          <ActionRow
            title="Student Authentication Login"
            description="Allow students to sign in and access the booking platform."
            isSwitch={true}
          >
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!isLoginDisabled}
                disabled={isPending}
                onChange={(e) => toggleLoginDisabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted dark:bg-muted/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 shadow-inner" />
            </label>
          </ActionRow>

          <ActionRow
            title="Force Global Session Termination"
            description="Instantly logs out every active user by incrementing session versions system-wide."
          >
            <DangerBtn
              onClick={() => openModal({
                title: "Sign Out All Users",
                description: "This will invalidate every active session. All logged-in users will be forced to re-authenticate.",
                actionLabel: "Force Logout",
                expectedText: null,
                danger: true,
                onConfirm: async () => await signOutAllUsers(),
              })}
            >
              <LogOut className="h-3.5 w-3.5" /> Force Logout
            </DangerBtn>
          </ActionRow>
        </Section>

        {/* ── 2. Spring Cleaning ── */}
        <Section
          icon={<Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-500/10 border-amber-500/10"
          title="New Semester Spring Clean"
          subtitle="Amnesty and reset tools for new intake — run individually or all at once"
        >
          <ActionRow
            title="One-Click New Semester Reset"
            description="Atomically clears all cooldowns, lifts all blocks, and zeros all late return counters for every non-admin user. The recommended action at the start of each new semester."
          >
            <DangerBtn
              onClick={() => openModal({
                title: "New Semester Reset",
                description: "This will clear cooldowns, unblock all users, and reset late return counters for all students and staff in a single operation.",
                actionLabel: "Reset All",
                expectedText: "NEW SEMESTER",
                danger: false,
                onConfirm: async (text) => await runNewSemesterClean(text!),
              })}
            >
              <Sparkles className="h-3.5 w-3.5" /> Reset All
            </DangerBtn>
          </ActionRow>

          <ActionRow
            title="Reset All Active Cooldowns"
            description="Clears the cooldownUntil field on every non-admin user, allowing immediate re-booking. Useful for mid-semester amnesty events."
          >
            <OutlineBtn
              color="amber"
              onClick={() => openModal({
                title: "Reset All Cooldowns",
                description: "All student and staff cooldowns will be cleared immediately. They will be able to book again right away.",
                actionLabel: "Clear Cooldowns",
                expectedText: null,
                danger: false,
                onConfirm: async () => await resetAllCooldowns(),
              })}
            >
              <Clock className="h-3.5 w-3.5" /> Clear Cooldowns
            </OutlineBtn>
          </ActionRow>

          <ActionRow
            title="Unblock All Users"
            description="Lifts all account blocks (blockType, blockReason, isBlocked) for every non-admin user. Admin-specific blocks applied individually remain in effect."
          >
            <OutlineBtn
              color="green"
              onClick={() => openModal({
                title: "Unblock All Users",
                description: "All blocked student and staff accounts will have their restrictions removed.",
                actionLabel: "Unblock All",
                expectedText: null,
                danger: false,
                onConfirm: async () => await unblockAllUsers(),
              })}
            >
              <Users className="h-3.5 w-3.5" /> Unblock All
            </OutlineBtn>
          </ActionRow>

          <ActionRow
            title="Reset Late Return Counters"
            description="Zeros the lateReturnCount field for all non-admin users. Run before a new semester so returning students start with a clean record."
          >
            <OutlineBtn
              color="blue"
              onClick={() => openModal({
                title: "Reset Late Return Counters",
                description: "The lateReturnCount will be set to 0 for all students and staff. This cannot be undone.",
                actionLabel: "Reset Counters",
                expectedText: null,
                danger: false,
                onConfirm: async () => await resetLateReturnCounts(),
              })}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Reset Counters
            </OutlineBtn>
          </ActionRow>
        </Section>

        {/* ── 3. System Integrity ── */}
        <Section
          icon={<Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-500/10 border-blue-500/10"
          title="System Integrity"
          subtitle="Repair tools to fix inventory drift and stuck bookings"
        >
          <ActionRow
            title="Resync Inventory Counters"
            description="Recalculates available, inUse, maintenance, and bookedInAdvance by walking every bike document. Also repairs bikes marked in_use without a valid active booking. Do NOT run if there are active bookings that have not yet been collected by users."
          >
            <SafeBtn onClick={handleSyncInventory} disabled={syncingInventory || isPending}>
              <RefreshCcw className={`h-3.5 w-3.5 ${syncingInventory ? "animate-spin" : ""}`} />
              {syncingInventory ? "Resyncing..." : "Resync Inventory"}
            </SafeBtn>
          </ActionRow>

          <ActionRow
            title="Resolve Stale Bookings"
            description="Force-cancels bookings stuck in active/collected/late beyond the policy's maximum duration + grace period buffer. Returns bikes to the fleet and notifies riders."
          >
            <OutlineBtn
              color="blue"
              onClick={() => openModal({
                title: "Resolve Stale Bookings",
                description: "All bookings that have exceeded the policy time window will be cancelled and their bikes returned to the available fleet.",
                actionLabel: "Resolve Stale",
                expectedText: null,
                danger: false,
                onConfirm: async () => await resolveStaleBookings(),
              })}
            >
              <BookX className="h-3.5 w-3.5" /> Resolve Stale
            </OutlineBtn>
          </ActionRow>
        </Section>

        {/* ── 4. Data Sanitization ── */}
        <Section
          icon={<Trash2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
          iconBg="bg-orange-500/10 border-orange-500/10"
          title="Data Sanitization"
          subtitle="Irreversible bulk deletion — ensure an offline backup exists first"
        >
          <ActionRow
            title="Purge Incident Reports"
            description="Permanently deletes all records in the /incidents collection. Use only after exporting a backup."
          >
            <DangerBtn
              onClick={() => openModal({
                title: "Purge Incident Reports",
                description: "All incident reports will be permanently and irreversibly deleted.",
                actionLabel: "Purge Incidents",
                expectedText: "DELETE INCIDENTS",
                danger: true,
                onConfirm: async (text) => await purgeIncidentReports(text!),
              })}
            >
              <FileX className="h-3.5 w-3.5" /> Purge Incidents
            </DangerBtn>
          </ActionRow>

          <ActionRow
            title="Wipe All Booking History"
            description="Irreversibly deletes all records in /bookings, resets all bike statuses, and zeroes inventory counters."
          >
            <DangerBtn
              onClick={() => openModal({
                title: "Wipe All Bookings",
                description: "All active and historical bookings will be permanently deleted and inventory reset.",
                actionLabel: "Wipe Bookings",
                expectedText: "DELETE ALL BOOKINGS",
                danger: true,
                onConfirm: async (text) => await deleteAllBookings(text!),
              })}
            >
              <BookX className="h-3.5 w-3.5" /> Wipe Bookings
            </DangerBtn>
          </ActionRow>

          <ActionRow
            title="Sanitize User Registry"
            description="Deletes all non-admin accounts from Firestore and Firebase Auth. Admin users are preserved. This operation is final."
          >
            <DangerBtn
              onClick={() => openModal({
                title: "Wipe User Base",
                description: "All student and staff accounts will be permanently deleted from Auth and Firestore.",
                actionLabel: "Wipe Users",
                expectedText: "DELETE ALL USERS",
                danger: true,
                onConfirm: async (text) => await deleteAllNonAdminUsers(text!),
              })}
            >
              <UserX className="h-3.5 w-3.5" /> Wipe Users
            </DangerBtn>
          </ActionRow>

          {/* Warning Banner */}
          <div className="pt-6 last:pb-0">
            <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-950/20 p-5 rounded-xl border border-orange-200 dark:border-orange-900/30">
              <ShieldAlert className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-[13px] font-bold text-orange-800 dark:text-orange-400 uppercase tracking-tight mb-1">Legal & Integrity Warning</h5>
                <p className="text-[12px] text-orange-700 dark:text-orange-300 leading-relaxed opacity-90">
                  Executing these actions will permanently alter the college&apos;s digital asset tracking history. Ensure you have an offline backup of the database before proceeding with any wipe operations.
                </p>
              </div>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
