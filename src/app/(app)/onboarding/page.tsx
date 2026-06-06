"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePracticums } from "@/lib/hooks/usePracticums";
import { db, functions, auth } from "@/lib/firebase/client";
import { doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { markProfileComplete, clearSession } from "@/app/(auth)/auth/actions";
import { PolicyModal } from "@/components/auth/PolicyModal";
import { useTheme } from "next-themes";
import { Sun, Moon, LogOut, Globe } from "lucide-react";
import { signOut } from "firebase/auth";

function generateStaffMatrixNumber(name: string, email: string) {
  if (!name || !email) return "";
  const numbersMatch = email.match(/\d+/g);
  const numbers = numbersMatch ? numbersMatch.join("") : "";

  const parts = name.trim().split(/\s+/);
  const beforeFather = [];
  const afterFather = [];
  let foundSeparator = false;
  const separators = ["bin", "binti", "a/l", "a/p"];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (separators.includes(lower)) {
      foundSeparator = true;
      continue;
    }
    if (!foundSeparator) {
      beforeFather.push(part);
    } else {
      afterFather.push(part);
    }
  }

  const initials = [];
  // Use up to 3 initials from the main name
  for (let i = 0; i < Math.min(beforeFather.length, 3); i++) {
    initials.push(beforeFather[i][0].toUpperCase());
  }

  // If only 1 initial from name, supplement with father's name initials (up to 3 total)
  if (initials.length === 1 && afterFather.length > 0) {
    for (let i = 0; i < Math.min(afterFather.length, 2); i++) {
      initials.push(afterFather[i][0].toUpperCase());
    }
  }

  return `${initials.join("")}${numbers}`;
}



const STAFF_UNITS = [
  "Bahasa Inggeris",
  "Biologi",
  "Ekonomi",
  "Fizik",
  "Kaunseling",
  "Kimia",
  "Kokurikulum",
  "Matematik",
  "Pengajian Am",
  "Pendidikan Islam",
  "Pendidikan Moral",
  "Pentadbir",
  "Perakaunan",
  "Perniagaan",
  "Sains Komputer",
  "Lain-lain"
];

const onboardContent = {
  en: {
    title: "Complete Profile",
    subtitle: "Please finalize your details to access the booking system.",
    fullName: "Full Name",
    fullNamePlaceholder: "Enter your full name",
    matrixNo: "Matrix Number",
    matrixNoPlaceholder: "Enter your matrix number",
    role: "Role",
    roleStudent: "Student",
    roleStaff: "Staff",
    phone: "Phone Number",
    phonePlaceholder: "Enter phone number",
    practicum: "Practicum",
    practicumSelect: "Select practicum",
    unitSelect: "Select unit",
    terms1: "By submitting, you agree to our ",
    terms2: "Terms of Service",
    terms3: " and ",
    terms4: "Privacy Policy",
    terms5: ". Note that your account will take up to 24 hours to be verified.",
    submitBtn: "Complete Profile",
    submittingBtn: "Submitting...",
    verifiedTitle: "Account Verified!",
    verifiedDesc: "You can now access all features of the booking system.",
    goDashboard: "Go to Dashboard",
    pendingTitle: "Verification Pending",
    pendingDesc: "Your account is currently being verified by an administrator. This usually takes up to 24 hours.",
    refreshStatus: "Refresh Status",
    rejectedTitle: "Verification Rejected",
    rejectedDesc: "Your details could not be automatically verified because this Matrix Number is already registered to another account. Please contact support if you believe this is an error.",
    contactAdmin: "Contact Support"
  },
  ms: {
    title: "Lengkapkan Profil",
    subtitle: "Sila lengkapkan butiran anda untuk mengakses sistem tempahan.",
    fullName: "Nama Penuh",
    fullNamePlaceholder: "Masukkan nama penuh anda",
    matrixNo: "Nombor Matrik",
    matrixNoPlaceholder: "Masukkan nombor matrik anda",
    role: "Peranan",
    roleStudent: "Pelajar",
    roleStaff: "Kakitangan",
    phone: "Nombor Telefon",
    phonePlaceholder: "Masukkan nombor telefon",
    practicum: "Praktikum",
    practicumSelect: "Pilih praktikum",
    unitSelect: "Pilih unit",
    terms1: "Dengan menghantar, anda bersetuju dengan ",
    terms2: "Terma Perkhidmatan",
    terms3: " dan ",
    terms4: "Dasar Privasi",
    terms5: ". Ambil perhatian bahawa akaun anda akan mengambil masa sehingga 24 jam untuk disahkan.",
    submitBtn: "Lengkapkan Profil",
    submittingBtn: "Menghantar...",
    verifiedTitle: "Akaun Disahkan!",
    verifiedDesc: "Anda kini boleh mengakses semua ciri sistem tempahan.",
    goDashboard: "Pergi ke Papan Pemuka",
    pendingTitle: "Pengesahan Tertunda",
    pendingDesc: "Akaun anda sedang disahkan oleh pentadbir. Ini biasanya mengambil masa sehingga 24 jam.",
    refreshStatus: "Penyegaran Status",
    rejectedTitle: "Pengesahan Ditolak",
    rejectedDesc: "Butiran anda tidak dapat disahkan secara automatik kerana Nombor Matrik ini telah didaftarkan ke akaun lain. Sila hubungi sokongan jika anda percaya ini adalah ralat.",
    contactAdmin: "Hubungi Sokongan"
  }
};

export default function OnboardingPage() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = onboardContent[language];
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { practicums, loading: practicumsLoading } = usePracticums();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    displayName: "",
    matrixNumber: "",
    practicum: "",
    phoneNumber: "",
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "rejected">("pending");
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyTab, setPolicyTab] = useState<"terms" | "privacy">("terms");
  const [submittingOrSuccess, setSubmittingOrSuccess] = useState(false);

  const isStaff = user?.role === "staff";

  const handleLogout = async () => {
    try {
      await clearSession();
      await signOut(auth);
      router.push("/auth");
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/auth";
    }
  };

  useEffect(() => {
    if (isStaff && formData.displayName && user?.email) {
      setFormData((prev) => ({
        ...prev,
        matrixNumber: generateStaffMatrixNumber(formData.displayName, user.email),
      }));
    }
  }, [formData.displayName, isStaff, user?.email]);

  // On mount, refresh the profileComplete cookie from Firestore.
  // This rescues users who already completed onboarding but have a stale cookie.
  useEffect(() => {
    fetch("/api/refresh-profile")
      .then((r) => r.json())
      .then((data: { profileComplete: boolean }) => {
        if (data.profileComplete) {
          router.replace("/dashboard");
        }
      })
      .catch(() => { /* silently ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && user.profileComplete && !submittingOrSuccess) {
      router.replace("/dashboard");
    }
  }, [user, router, submittingOrSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError("");
    setLoading(true);
    setSubmittingOrSuccess(true);
    try {
      // 1. Write profile fields (not profileComplete — CF does that server-side)
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        displayName: formData.displayName.replace(/\s+/g, ' ').trim(),
        matrixNumber: formData.matrixNumber.replace(/\s+/g, '').trim(),
        practicum: formData.practicum.replace(/\s+/g, ' ').trim(),
        phoneNumber: formData.phoneNumber.replace(/\D/g, '').replace(/^60/, '0').trim(),
        updatedAt: new Date(),
      }, { merge: true });

      // 2. CF atomically sets profileComplete: true + verificationStatus
      const submitVerificationRequest = httpsCallable(functions, "submitVerificationRequest");
      const result = await submitVerificationRequest();
      const { status } = (result.data as { status: string });

      // 3. Set the profileComplete cookie server-side so the proxy sees it immediately
      await markProfileComplete();

      if (status === "verified" || status === "pending" || status === "rejected") {
        setVerificationStatus(status as "verified" | "pending" | "rejected");
        setShowSuccess(true);
      } else {
        window.location.replace("/dashboard");
      }
    } catch (err: unknown) {
      console.error("Onboarding error:", err);
      setError(err instanceof Error ? err.message : "Failed to update profile");
      setSubmittingOrSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
      {/* Grid Header Panel */}
      <div className="max-w-xl w-full flex items-center justify-end mb-4 mt-auto animate-in fade-in slide-in-from-top-4 duration-300 shrink-0">
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "ms" : "en")}
            className="p-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted active:scale-95 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold h-8"
            title="Toggle Language"
          >
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="uppercase">{language}</span>
          </button>

          {/* Theme Selector */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted active:scale-95 shadow-sm transition-all cursor-pointer h-8 flex items-center justify-center"
            title="Toggle Theme"
          >
            <Sun className="w-3.5 h-3.5 hidden dark:block text-amber-500" />
            <Moon className="w-3.5 h-3.5 block dark:hidden text-indigo-600" />
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-95 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold h-8"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <div className="max-w-xl w-full bg-card border border-border shadow-md rounded-xl p-6 md:p-10 mb-auto animate-in fade-in zoom-in duration-300">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2 text-center md:text-left">{t.title}</h1>
          <p className="text-muted-foreground text-sm text-center md:text-left">{t.subtitle}</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-6 border border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{t.fullName}</label>
            <input
              type="text"
              required
              className="w-full px-4 py-2 bg-background border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all uppercase"
              placeholder="ZAID IZZUDDIN"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              {isStaff ? "Unique ID" : "Matrix Number"}
            </label>
            <input
              type="text"
              required
              disabled={isStaff}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isStaff ? "Auto-generated" : "MC2516116787"}
              value={formData.matrixNumber}
              onChange={(e) => setFormData({ ...formData, matrixNumber: e.target.value.toUpperCase() })}
            />
            {isStaff && (
              <p className="mt-1.5 text-[11px] text-primary/80 italic font-medium px-1">
                * Your Unique ID is auto-generated based on your official name and email.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                {isStaff ? "Unit" : "Practicum"}
              </label>
              {isStaff ? (
                <div className="relative">
                  <select
                    required
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    value={formData.practicum}
                    onChange={(e) => setFormData({ ...formData, practicum: e.target.value })}
                  >
                    <option value="" disabled>{t.unitSelect}</option>
                    {STAFF_UNITS.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <select
                    required
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    value={formData.practicum}
                    onChange={(e) => setFormData({ ...formData, practicum: e.target.value })}
                  >
                    <option value="" disabled>{t.practicumSelect}</option>
                    {practicums.map((prac) => (
                      <option key={prac.code} value={prac.code}>{prac.code}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                required
                className="w-full px-4 py-2 bg-background border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="0123456789"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            {t.terms1}
            <span
              onClick={() => {
                setPolicyTab("terms");
                setIsPolicyOpen(true);
              }}
              className="text-primary font-bold hover:underline cursor-pointer"
            >
              {t.terms2}
            </span>
            {t.terms3}
            <span
              onClick={() => {
                setPolicyTab("privacy");
                setIsPolicyOpen(true);
              }}
              className="text-primary font-bold hover:underline cursor-pointer"
            >
              {t.terms4}
            </span>
            {t.terms5}
          </p>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center h-10 shadow-sm disabled:opacity-70"
            >
              {loading ? <LoadingSpinner className="text-white" /> : "Save and Continue"}
            </button>
          </div>
        </form>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-card border border-border shadow-xl rounded-2xl p-8 text-center animate-in zoom-in fade-in duration-300">
            {verificationStatus === "verified" ? (
              <>
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-3">{t.verifiedTitle}</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  Your account has been successfully verified. You can now start booking bikes right away!
                </p>
              </>
            ) : verificationStatus === "pending" ? (
              <>
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-3">{t.pendingTitle}</h2>
                <p className="text-muted-foreground mb-8 text-sm text-center">
                  Your details didn't match our automated records. An administrator will review your profile shortly. You will be notified once verified!
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-3">{t.rejectedTitle}</h2>
                <p className="text-muted-foreground mb-8 text-sm text-center">
                  {t.rejectedDesc}
                </p>
              </>
            )}
            <button
              onClick={() => window.location.replace(verificationStatus === "rejected" ? "/contact" : "/dashboard")}
              className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              {verificationStatus === "rejected" ? t.contactAdmin : "Go to Dashboard"}
            </button>
            {verificationStatus === "rejected" && (
              <button
                onClick={() => window.location.replace("/dashboard")}
                className="w-full mt-3 bg-transparent text-muted-foreground font-semibold py-2 text-sm hover:text-foreground transition-all"
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terms & Privacy Dialog Modal */}
      <PolicyModal
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
        defaultTab={policyTab}
      />
    </div>
  );
}
