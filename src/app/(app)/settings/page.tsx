"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Bell, Smartphone, Palette, Mail } from "lucide-react";
import { useTheme } from "next-themes";
import { useLanguage, Language } from "@/lib/i18n/LanguageContext";
import { clearSession, revokeAllSessions } from "@/app/(auth)/auth/actions";
import { useAuth } from "@/lib/hooks/useAuth";
import { db, auth, messaging } from "@/lib/firebase/client";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { getToken } from "firebase/messaging";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const [isGoogleUser, setIsGoogleUser] = useState(false);

  React.useEffect(() => {
    if (auth.currentUser) {
      const isGoogle = auth.currentUser.providerData.some(
        (provider) => provider.providerId === "google.com"
      );
      setIsGoogleUser(isGoogle);
    }
  }, [user?.uid]);

  React.useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEmailNotifs(data.emailNotification !== false);
        setPushNotifs(data.pushNotification === true);
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const updatePreference = async (field: string, value: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { [field]: value });
    } catch (err) {
      console.error("Failed to update preference:", err);
    }
  };

  const handlePushToggle = async (checked: boolean) => {
    if (!user) return;

    if (!checked) {
      try {
        await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
        toast.success(t("settings.push.disabled"));
      } catch (err) {
        console.error("Failed to disable push notifications:", err);
        toast.error("Failed to update preference.");
      }
      return;
    }

    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      toast.error(t("settings.push.unsupported"));
      return;
    }

    try {
      if (Notification.permission === "denied") {
        toast.error(t("settings.push.blocked"));
        await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
        return;
      }

      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const msg = await messaging();
          if (msg) {
            const token = await getToken(msg, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
            if (token) {
              await updateDoc(doc(db, "users", user.uid), {
                pushNotification: true,
                fcmToken: token,
              });
              toast.success(t("settings.push.enabled"));
            } else {
              toast.error(t("settings.push.tokenFailed"));
              await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
            }
          }
        } else {
          await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
          toast.error(t("settings.push.denied"));
        }
        return;
      }

      if (Notification.permission === "granted") {
        const msg = await messaging();
        if (msg) {
          const token = await getToken(msg, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
          if (token) {
            await updateDoc(doc(db, "users", user.uid), {
              pushNotification: true,
              fcmToken: token,
            });
            toast.success(t("settings.push.enabled"));
          } else {
            toast.error(t("settings.push.tokenFailed"));
            await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
          }
        }
      }
    } catch (err) {
      console.error("Error setting up push notifications:", err);
      toast.error("An error occurred while enabling push notifications.");
      await updateDoc(doc(db, "users", user.uid), { pushNotification: false });
    }
  };

  const [isResetting, setIsResetting] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetError, setResetError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  React.useEffect(() => {
    const savedUntil = localStorage.getItem("settings_reset_cooldown_until");
    if (savedUntil) {
      const remaining = Math.ceil((parseInt(savedUntil, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setCooldown(remaining);
        setResetEmailSent(true);
      }
    }
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setResetEmailSent(false); // Allow retry/resend after 1 minute!
          localStorage.removeItem("settings_reset_cooldown_until");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handlePasswordReset = async () => {
    if (isResetting || resetEmailSent || cooldown > 0) return;
    if (!user?.email) return;
    setIsResetting(true);
    setResetError("");
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailSent(true);
      const until = Date.now() + 60 * 1000;
      localStorage.setItem("settings_reset_cooldown_until", until.toString());
      setCooldown(60);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setResetError(err.message || "Failed to send reset email");
    } finally {
      setIsResetting(false);
    }
  };


  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("settings.title")}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t("dashboard.home")}</Link>
            <span>›</span>
            <span>{t("settings.title")}</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 md:space-y-8">
        {/* Preferences Section */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 border border-purple-500/10">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("settings.preferences")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("settings.customize")}</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("settings.language")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("settings.language.desc")}</p>
              </div>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full sm:w-40 px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none bg-background transition-all cursor-pointer"
                suppressHydrationWarning
              >
                <option value="en">{t("lang.en")}</option>
                <option value="ms">{t("lang.ms")}</option>
              </select>
            </div>
            
            <div className="h-px bg-border"></div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("settings.theme")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("settings.theme.desc")}</p>
              </div>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full sm:w-40 px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none bg-background transition-all cursor-pointer"
                suppressHydrationWarning
              >
                <option value="system">{t("theme.system")}</option>
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0 border border-amber-500/10">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("nav.notifications")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("settings.notifications.desc")}</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-foreground">{t("settings.email")}</p>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("settings.email.desc")}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-xl bg-blue-500/10 text-primary border border-blue-500/10 shrink-0 select-none">
                {t("settings.comingSoon")}
              </span>
            </div>
            
            <div className="h-px bg-border"></div>
            
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-foreground">{t("settings.push")}</p>
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("settings.push.desc")}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" className="sr-only peer" checked={pushNotifs} onChange={(e) => handlePushToggle(e.target.checked)} />
                <div className="w-11 h-6 bg-muted dark:bg-muted/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
          <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-primary dark:text-blue-500 shrink-0 border border-blue-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-medium text-foreground">{t("settings.security")}</h3>
              <p className="text-[12px] md:text-[13px] text-muted-foreground">{t("settings.security.desc")}</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{t("settings.changePwd")}</p>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                    {isGoogleUser
                      ? t("settings.changePwd.google")
                      : t("settings.changePwd.email")}
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                  <button 
                    onClick={handlePasswordReset} 
                    disabled={isGoogleUser || isResetting || resetEmailSent || cooldown > 0 || !user?.email}
                    className="w-full sm:w-40 py-2.5 bg-primary text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGoogleUser 
                      ? t("settings.googleAccount") 
                      : isResetting 
                        ? t("settings.sending") 
                        : cooldown > 0 
                          ? `${language === "ms" ? "Tunggu" : "Wait"} (${cooldown}s)` 
                          : t("settings.sendEmail")}
                  </button>
                  {resetError && <p className="text-red-500 text-xs w-full sm:w-40 text-center">{resetError}</p>}
                </div>
              </div>

              {resetEmailSent && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-xs text-amber-800 dark:text-amber-300 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="font-semibold text-[13px] text-amber-900 dark:text-amber-200">
                    {t("settings.emailSent")}
                  </p>
                  <p className="leading-relaxed">
                    {t("settings.checkSpam")}
                  </p>
                </div>
              )}
            </div>
            
            <div className="h-px bg-border"></div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{t("settings.logoutAll")}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t("settings.logoutAll.desc")}</p>
              </div>
              <button 
                onClick={async () => {
                  if (confirm(t("settings.logoutConfirm"))) {
                    const toastId = toast.loading(t("settings.loggingOut"));
                    try {
                      const res = await revokeAllSessions();
                      if (res.success) {
                        toast.success(t("settings.logoutSuccess"), { id: toastId });
                        await auth.signOut();
                        router.push("/auth");
                      } else {
                        toast.error(res.error || "Failed to logout", { id: toastId });
                      }
                    } catch (e) {
                      toast.error("An error occurred", { id: toastId });
                    }
                  }
                }}
                className="w-full sm:w-40 py-2.5 bg-destructive text-white rounded-xl text-sm font-medium shadow-lg shadow-destructive/20 hover:bg-destructive/90 transition-all active:scale-95 shrink-0"
              >
                {t("settings.logoutAll.btn")}
              </button>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
