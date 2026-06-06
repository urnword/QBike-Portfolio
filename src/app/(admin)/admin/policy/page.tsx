"use client";

import React, { useState, useEffect, useRef } from "react";
import { Save, Plus, Trash2, Clock, Shield, Calendar, MapPin, AlertTriangle, Lock, Globe, Power, ChevronRight, Users, Zap, Settings, RefreshCcw, Check } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePolicy } from "@/lib/hooks/usePolicy";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { updateSystemPolicy } from "@/actions/admin";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const policySchema = z.object({
  isBookingOpen: z.boolean(),
  loginDisabled: z.boolean(),
  gpsEnabled: z.boolean(),
  maxBookingDuration: z.number().min(1),
  bookingDurationOptions: z.string().min(1),
  pickupGracePeriod: z.number().min(0),
  returnGracePeriod: z.number().min(0),
  standardCooldownDays: z.number().min(0),
  lateReturnCooldownDays: z.number().min(0),
  gpsRadiusMeters: z.number().min(10),
  stationLat: z.number(),
  stationLng: z.number(),
  cancelCooldownMinutes: z.number().min(0),
  operatingDays: z.array(z.string()),
  defaultOpen: z.string(),
  defaultClose: z.string(),
  weekendOpen: z.string(),
  weekendClose: z.string(),
});

type PolicyFormValues = z.infer<typeof policySchema>;

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const formatTimeDB = (time: string) => time.replace(":", "");
const formatTimeUI = (time: string) => {
  if (!time) return "08:00";
  if (time.includes(":")) return time;
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
};

export default function AdminPolicyPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { policy, loading: policyLoading } = usePolicy();
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const skipNextReset = useRef(false);

  const { register, control, reset, watch, setValue, handleSubmit, formState: { isDirty } } = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      isBookingOpen: true,
      loginDisabled: false,
      gpsEnabled: true,
      maxBookingDuration: 120,
      bookingDurationOptions: "30, 60, 90, 120",
      pickupGracePeriod: 15,
      returnGracePeriod: 10,
      standardCooldownDays: 3,
      lateReturnCooldownDays: 7,
      gpsRadiusMeters: 50,
      stationLat: 0,
      stationLng: 0,
      cancelCooldownMinutes: 10,
      operatingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      defaultOpen: "08:00",
      defaultClose: "18:30",
      weekendOpen: "08:00",
      weekendClose: "12:00",
    }
  });

  const watchedValues = watch();
  const watchedOperatingDays = watchedValues.operatingDays || [];

  // Initial load
  useEffect(() => {
    if (policy && !isDirty && !skipNextReset.current) {
      reset({
        isBookingOpen: policy.isBookingOpen,
        loginDisabled: policy.loginDisabled ?? false,
        gpsEnabled: policy.gpsEnabled ?? true,
        maxBookingDuration: policy.maxBookingDuration,
        bookingDurationOptions: (policy.bookingDurationOptions || []).join(", "),
        pickupGracePeriod: policy.pickupGracePeriod,
        returnGracePeriod: policy.returnGracePeriod,
        standardCooldownDays: policy.standardCooldownDays,
        lateReturnCooldownDays: policy.lateReturnCooldownDays ?? 7,
        gpsRadiusMeters: policy.gpsRadiusMeters,
        stationLat: policy.stationCoordinates?.lat ?? 0,
        stationLng: policy.stationCoordinates?.lng ?? 0,
        cancelCooldownMinutes: policy.cancelCooldownMinutes ?? 10,
        operatingDays: policy.operatingDays || ["Mon", "Tue", "Wed", "Thu", "Fri"],
        defaultOpen: formatTimeUI(policy.operatingHours?.default?.open ?? "0800"),
        defaultClose: formatTimeUI(policy.operatingHours?.default?.close ?? "1830"),
        weekendOpen: formatTimeUI(policy.operatingHours?.overrides?.Sat?.open ?? policy.operatingHours?.overrides?.Sun?.open ?? "0800"),
        weekendClose: formatTimeUI(policy.operatingHours?.overrides?.Sat?.close ?? policy.operatingHours?.overrides?.Sun?.close ?? "1200"),
      });
    }
    if (skipNextReset.current) skipNextReset.current = false;
  }, [policy, reset, isDirty]);

  // Manual save handler
  const onSave = async (values: PolicyFormValues) => {
    if (!user) return;
    setSaving(true);
    try {
      const overridesRecord: Record<string, { open: string; close: string }> = {};
      const weekendVal = {
        open: formatTimeDB(values.weekendOpen),
        close: formatTimeDB(values.weekendClose)
      };
      overridesRecord["Sat"] = weekendVal;
      overridesRecord["Sun"] = weekendVal;

      const updatedPolicy: any = {
        isBookingOpen: values.isBookingOpen,
        loginDisabled: values.loginDisabled,
        gpsEnabled: values.gpsEnabled,
        maxBookingDuration: values.maxBookingDuration,
        bookingDurationOptions: values.bookingDurationOptions.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
        pickupGracePeriod: values.pickupGracePeriod,
        returnGracePeriod: values.returnGracePeriod,
        standardCooldownDays: values.standardCooldownDays,
        lateReturnCooldownDays: values.lateReturnCooldownDays,
        gpsRadiusMeters: values.gpsRadiusMeters,
        stationCoordinates: { lat: values.stationLat, lng: values.stationLng },
        cancelCooldownMinutes: values.cancelCooldownMinutes,
        operatingDays: values.operatingDays,
        operatingHours: {
          default: {
            open: formatTimeDB(values.defaultOpen),
            close: formatTimeDB(values.defaultClose)
          },
          overrides: overridesRecord,
        },
      };

      await updateSystemPolicy(updatedPolicy);
      setLastSaved(new Date());
      skipNextReset.current = true;
      reset(values);
      toast.success("Policy configurations saved successfully!");
    } catch (err) {
      console.error("Save failed", err);
      toast.error("Failed to save policy configurations.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    const current = watchedOperatingDays;
    if (current.includes(day)) {
      setValue("operatingDays", current.filter(d => d !== day), { shouldDirty: true });
    } else {
      setValue("operatingDays", [...current, day], { shouldDirty: true });
    }
  };

  const syncLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setValue("stationLat", position.coords.latitude, { shouldDirty: true });
      setValue("stationLng", position.coords.longitude, { shouldDirty: true });
    });
  };

  if (policyLoading) return <div className="flex h-screen items-center justify-center bg-background"><LoadingSpinner /></div>;

  return (
    <div className="px-4 pb-6 sm:px-8 sm:pb-8 max-w-7xl mx-auto w-full pb-12 bg-background min-h-screen">
      {/* Sticky Header with Save Button */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md pt-6 pb-4 sm:pt-8 mb-8 flex flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">{t("admin.policy.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.policy.config")}</span>
          </div>
        </div>

        {/* Header Save Action */}
        <div className="flex items-center gap-3">
          {saving ? (
            <span className="text-[12px] text-muted-foreground hidden sm:inline">{t("admin.policy.saving")}</span>
          ) : isDirty ? (
            <span className="text-[12px] text-amber-600 dark:text-amber-500 font-semibold hidden sm:inline">{t("admin.policy.unsaved")}</span>
          ) : (
            <span className="text-[12px] text-emerald-600 dark:text-emerald-500 font-semibold hidden sm:inline">{t("admin.policy.saved")}</span>
          )}
          <button
            type="button"
            onClick={handleSubmit(onSave)}
            disabled={saving || !isDirty}
            className="bg-primary text-white font-bold text-[11px] sm:text-xs uppercase tracking-wider px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl shadow-md disabled:opacity-40 disabled:shadow-none hover:bg-primary/95 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            {saving ? t("admin.policy.saving") : (
              <>
                <span className="inline sm:hidden">{t("admin.policy.saveBtn")}</span>
                <span className="hidden sm:inline">{t("admin.policy.saveSettings")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-6 md:space-y-8">

        {/* Section 1: Core System Status */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/10">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("admin.policy.systemAvail")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("admin.policy.systemAvailDesc")}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.bookingMaster")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.bookingMasterDesc")}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" {...register("isBookingOpen")} className="sr-only peer" />
                <div className="w-11 h-6 bg-muted dark:bg-muted/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
              </label>
            </div>


            <div className="h-px bg-border"></div>

            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.gpsEnforcement")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.gpsEnforcementDesc")}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" {...register("gpsEnabled")} className="sr-only peer" />
                <div className="w-11 h-6 bg-muted dark:bg-muted/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
              </label>
            </div>

            <div className="h-px bg-border"></div>

            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.studentLogin")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.studentLoginDesc")}</p>
                {watchedValues.loginDisabled && (
                  <p className="text-[13px] text-amber-600 dark:text-amber-500 flex items-center gap-1.5 mt-1.5 leading-relaxed font-medium animate-in fade-in slide-in-from-top-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t("admin.policy.maintenanceMode")}
                  </p>
                )}
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!watchedValues.loginDisabled}
                  onChange={(e) => setValue("loginDisabled", !e.target.checked, { shouldDirty: true })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted dark:bg-muted/40 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: Booking Constraints */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 border border-blue-500/10">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("admin.policy.constraints")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("admin.policy.constraintsDesc")}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.maxDuration")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.maxDurationDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40">
                <input type="number" {...register("maxBookingDuration", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.min")}</span>
              </div>
            </div>


            <div className="h-px bg-border"></div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.durationPresets")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.durationPresetsDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="text" {...register("bookingDurationOptions")} placeholder="30, 60, 90, 120" className="w-full px-4 pr-10 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.min")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Compliance & Cooldowns */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0 border border-red-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("admin.policy.compliance")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("admin.policy.complianceDesc")}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {/* Pickup Grace Period */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.pickupGrace")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.pickupGraceDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="number" {...register("pickupGracePeriod", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.min")}</span>
              </div>
            </div>

            <div className="h-px bg-border"></div>

            {/* Return Grace Period */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.returnGrace")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.returnGraceDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="number" {...register("returnGracePeriod", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.min")}</span>
              </div>
            </div>

            <div className="h-px bg-border"></div>

            {/* Standard Cooldown */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.standardCooldown")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.standardCooldownDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="number" {...register("standardCooldownDays", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.days")}</span>
              </div>
            </div>

            <div className="h-px bg-border"></div>

            {/* Late Penalty */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.latePenalty")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.latePenaltyDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="number" {...register("lateReturnCooldownDays", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.days")}</span>
              </div>
            </div>

            <div className="h-px bg-border"></div>

            {/* Cancellation Cooldown */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.cancelCooldown")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("admin.policy.cancelCooldownDesc")}</p>
              </div>
              <div className="relative w-full sm:w-40 shrink-0">
                <input type="number" {...register("cancelCooldownMinutes", { valueAsNumber: true })} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">{t("admin.policy.min")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Operating Schedule */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/10">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("admin.policy.schedule")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("admin.policy.scheduleDesc")}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8">
            <div className="space-y-4">
              <p className="font-medium text-sm text-foreground">{t("admin.policy.activeDays")}</p>
              <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full max-w-xl">
                {DAYS_SHORT.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`flex items-center justify-center py-2 px-1 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl cursor-pointer transition-all border text-center ${watchedOperatingDays.includes(day) ? 'bg-primary border-primary text-white shadow-md sm:shadow-lg shadow-primary/20' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'}`}
                  >
                    <span className="text-[10px] sm:text-[12px] font-bold uppercase tracking-wider">{day}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.stdOpen")}</p>
                <input type="time" {...register("defaultOpen")} className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.stdClose")}</p>
                <input type="time" {...register("defaultClose")} className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>
            </div>

            {/* Weekend Operating Hours */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <p className="font-medium text-sm text-foreground">{t("admin.policy.weekendOpen")}</p>
                  <input 
                    type="time" 
                    {...register("weekendOpen")} 
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-sm text-foreground">{t("admin.policy.weekendClose")}</p>
                  <input 
                    type="time" 
                    {...register("weekendClose")} 
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Geofencing */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-500/10">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("admin.policy.geofence")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("admin.policy.geofenceDesc")}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.radius")}</p>
                <span className="text-[13px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full">{watchedValues.gpsRadiusMeters}m</span>
              </div>
              <input
                type="range"
                min="10"
                max="500"
                step="5"
                {...register("gpsRadiusMeters", { valueAsNumber: true })}
                className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.lat")}</p>
                <input type="number" step="any" {...register("stationLat", { valueAsNumber: true })} className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm text-foreground">{t("admin.policy.lng")}</p>
                <input type="number" step="any" {...register("stationLng", { valueAsNumber: true })} className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
            </div>

            <button
              type="button"
              onClick={syncLocation}
              className="w-full bg-primary text-white font-bold text-[11px] uppercase tracking-widest py-3.5 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <RefreshCcw className="h-4 w-4" /> {t("admin.policy.syncPos")}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
