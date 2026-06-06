"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { UserDocument } from "@/types";
import { CheckCircle2, Lock, Save, AlertCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePracticums } from "@/lib/hooks/usePracticums";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export default function ProfilePage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { practicums, loading: practicumsLoading } = usePracticums();
  const [user, setUser] = useState<Partial<UserDocument>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    }
  }, [authUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    setLoading(true);
    setSuccess(false);
    setError("");

    try {
      const userRef = doc(db, "users", authUser.uid);
      
      const cleanDisplayName = user.displayName ? user.displayName.replace(/\s+/g, ' ').trim().toUpperCase() : "";
      const cleanMatrixNumber = user.matrixNumber ? user.matrixNumber.replace(/\s+/g, '').trim().toUpperCase() : "";
      const cleanPracticum = user.practicum ? user.practicum.replace(/\s+/g, ' ').trim().toUpperCase() : "";
      const cleanPhoneNumber = user.phoneNumber ? user.phoneNumber.replace(/\D/g, '').replace(/^60/, '0').trim() : "";

      // 1. Update basic info
      await updateDoc(userRef, {
        displayName: cleanDisplayName,
        matrixNumber: cleanMatrixNumber,
        phoneNumber: cleanPhoneNumber,
        practicum: cleanPracticum,
        updatedAt: new Date(),
      });

      // 2. Trigger auto-verification if not already verified
      if (authUser.verificationStatus !== "verified") {
        const verifyFn = httpsCallable(functions, "submitVerificationRequest");
        const res = await verifyFn() as any;
        
        if (res.data.status === "verified") {
          setSuccess(true);
        } else if (res.data.status === "pending") {
          setError("Records didn't match exactly. Submitted for manual review.");
        } else if (res.data.status === "rejected") {
          setError("Verification rejected. Please check your details.");
        }
      } else {
        setSuccess(true);
      }

      if (!error) setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Profile update error:", err);
      setError(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;
  if (!authUser) return <div className="p-8 text-center">User not found.</div>;

  const isVerified = authUser.verificationStatus === "verified";
  const isStaff = authUser.role === "staff";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("profile.title")}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t("dashboard.home")}</Link>
            <span>›</span>
            <span>{t("nav.profile")}</span>
          </div>
        </div>
      </div>

      {/* Status Card - Moved below header */}
      <div className={`mb-8 p-5 md:p-7 rounded-2xl shadow-sm border flex flex-col sm:flex-row items-center sm:items-start gap-4 md:gap-6 text-center sm:text-left transition-all ${
        isVerified 
          ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-500" 
          : authUser.verificationStatus === "pending"
          ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-500"
          : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-500"
      }`}>
        <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-card border border-current/10`}>
          {isVerified ? <CheckCircle2 className="h-7 w-7 md:h-8 md:w-8" /> : <AlertCircle className="h-7 w-7 md:h-8 md:w-8" />}
        </div>
        <div>
          <h3 className="font-bold text-base md:text-xl">
            {isVerified 
              ? t("profile.verified") 
              : authUser.verificationStatus === "pending" 
                ? t("profile.pending") 
                : authUser.verificationStatus === "rejected"
                  ? t("profile.rejected")
                  : t("profile.unverified")}
          </h3>
          <p className="text-[13px] md:text-sm font-medium opacity-90 mt-1 max-w-2xl leading-relaxed">
            {isVerified 
              ? t("profile.verifiedDesc") 
              : authUser.verificationStatus === "pending"
                ? t("profile.pendingDesc")
                : authUser.verificationStatus === "rejected"
                  ? t("profile.rejectedDesc").replace("{reason}", authUser.verificationRejectedReason || "Invalid information provided.")
                  : t("profile.unverifiedDesc")}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Profile Form Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 md:p-8 border-b border-border bg-muted/5">
            <h3 className="text-lg md:text-xl font-medium text-foreground">{t("profile.personalInfo")}</h3>
            <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("profile.personalInfoDesc")}</p>
          </div>
          
          <div className="p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">{t("profile.fullName")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="displayName"
                      disabled={isVerified}
                      value={user.displayName || ""}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-xl border text-sm transition-all font-medium ${
                        isVerified 
                          ? "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-70" 
                          : "bg-background border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      }`}
                    />
                    {isVerified && <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">
                    {isStaff ? "Unique ID" : "Matrix Number"}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="matrixNumber"
                      disabled={isVerified || isStaff}
                      value={user.matrixNumber || ""}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-xl border text-sm uppercase transition-all font-medium ${
                        isVerified || isStaff
                          ? "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-70" 
                          : "bg-background border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      }`}
                    />
                    {(isVerified || isStaff) && <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">{t("profile.email")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="email"
                      disabled
                      value={authUser.email || ""}
                      className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-muted-foreground cursor-not-allowed opacity-70 font-medium"
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">
                    {isStaff ? "Unit" : "Practicum"}
                  </label>
                  <div className="relative">
                    {isStaff ? (
                      <input
                        type="text"
                        name="practicum"
                        disabled={isVerified}
                        value={user.practicum || ""}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 border rounded-xl text-sm transition-all font-medium ${
                          isVerified
                            ? "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-70"
                            : "bg-background border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        }`}
                      />
                    ) : (
                      <select
                        name="practicum"
                        disabled={isVerified}
                        value={user.practicum || ""}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 border rounded-xl text-sm transition-all font-medium appearance-none cursor-pointer ${
                          isVerified
                            ? "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-70"
                            : "bg-background border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        }`}
                      >
                        <option value="" disabled>Select your practicum</option>
                        {practicums.map((prac) => (
                          <option key={prac.code} value={prac.code}>{prac.code}</option>
                        ))}
                      </select>
                    )}
                    {!isVerified && !isStaff && (
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                      </div>
                    )}
                    {isVerified && (
                      <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">{t("profile.phone")}</label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={user.phoneNumber || ""}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Alerts - Tighter spacing */}
              {(error || success) && (
                <div className="space-y-3 pt-2">
                  {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-sm rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <AlertCircle className="h-5 w-5 shrink-0" /> 
                      <span className="font-medium">{error}</span>
                    </div>
                  )}

                  {success && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-500 text-sm rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <CheckCircle2 className="h-5 w-5 shrink-0" /> 
                      <span className="font-medium">{t("profile.updateSuccess")}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-secondary hover:bg-secondary/90 text-white font-medium py-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-secondary/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <><Save className="h-5 w-5"/> {t("profile.saveChanges")}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
