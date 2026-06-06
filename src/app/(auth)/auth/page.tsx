"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { auth, db } from "@/lib/firebase/client";
import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createSession } from "./actions";
import { PolicyModal } from "@/components/auth/PolicyModal";
import { useTheme } from "next-themes";
import { Sun, Moon, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const authContent = {
  en: {
    maintenance: "System is currently under maintenance. Login is disabled for students and staff.",
    emailLabel: "DELIMa Email Address",
    continueBtn: "Continue",
    orContinueWith: "Or continue with",
    signingInAs: "Signing in as",
    changeBtn: "Change",
    passwordLabel: "Password",
    forgotPassword: "Forgot password?",
    signInBtn: "Sign In",
    creatingAccountFor: "Creating account for",
    confirmPasswordLabel: "Confirm Password",
    passwordsDoNotMatch: "Passwords do not match",
    passwordHint: "Must be at least 8 characters",
    createAccountBtn: "Create Account",
    terms1: "By continuing, you agree to QBike's ",
    terms2: "Terms of Service",
    terms3: " and ",
    terms4: "Privacy Policy",
    rights: "© 2026 Zaid Izzuddin. All Rights Reserved."
  },
  ms: {
    maintenance: "Sistem kini dalam penyelenggaraan. Log masuk dinyahaktifkan untuk pelajar dan kakitangan.",
    emailLabel: "Alamat E-mel DELIMa",
    continueBtn: "Seterusnya",
    orContinueWith: "Atau log masuk dengan",
    signingInAs: "Log masuk sebagai",
    changeBtn: "Tukar",
    passwordLabel: "Kata Laluan",
    forgotPassword: "Lupa kata laluan?",
    signInBtn: "Log Masuk",
    creatingAccountFor: "Mencipta akaun untuk",
    confirmPasswordLabel: "Sahkan Kata Laluan",
    passwordsDoNotMatch: "Kata laluan tidak sepadan",
    passwordHint: "Mestilah sekurang-kurangnya 8 aksara",
    createAccountBtn: "Daftar Akaun",
    terms1: "Dengan meneruskan, anda bersetuju dengan ",
    terms2: "Terma Perkhidmatan",
    terms3: " dan ",
    terms4: "Dasar Privasi",
    rights: "© 2026 Zaid Izzuddin. All Rights Reserved."
  }
};

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMaintenance = searchParams.get("maintenance") === "true";
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = authContent[language];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"check_email" | "login" | "signup">("check_email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyTab, setPolicyTab] = useState<"terms" | "privacy">("terms");

  React.useEffect(() => {
    const savedUntil = localStorage.getItem("auth_reset_cooldown_until");
    if (savedUntil) {
      const remaining = Math.ceil((parseInt(savedUntil, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setCooldown(remaining);
        setSuccess("dispatched");
      }
    }
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setSuccess(""); // Allow retry after 1 minute!
          localStorage.removeItem("auth_reset_cooldown_until");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleEmailCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const domain = "@moe-dl.edu.my";
    if (!email.toLowerCase().endsWith(domain)) {
      setError(`Only ${domain} accounts are permitted`);
      return;
    }

    setLoading(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        if (methods.includes("google.com") && !methods.includes("password")) {
          setError(
            language === "ms"
              ? "E-mel ini telah didaftarkan melalui Google OAuth. Sila log masuk dengan Google."
              : "This email is registered via Google OAuth. Please sign in with Google instead."
          );
          setLoading(false);
          return;
        }
        setMode("login");
      } else {
        setMode("signup");
      }
    } catch (err: any) {
      console.error("Email check error:", err);
      setError(err.message || "An error occurred checking your email");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const idToken = await user.getIdToken();
      const sessionResult = await createSession(idToken);

      if (!sessionResult.success) {
        throw new Error(sessionResult.error || "Failed to create secure session");
      }

      const role = sessionResult.role;

      if (role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError(t.passwordsDoNotMatch);
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const idToken = await user.getIdToken();
      await createSession(idToken);

      // Redirect to email verification
      await sendEmailVerification(user);
      router.push("/auth/verify-email");
    } catch (err: any) {
      console.error("Signup error:", err);
      setError(err.message || "An error occurred during sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: "moe-dl.edu.my" // Hint for domain enforcement
    });

    let popupRef: Window | null = null;
    const originalOpen = window.open;

    // Intercept the popup window reference to poll its closure status
    window.open = function (this: any, ...args: any[]) {
      const win = (originalOpen as any).apply(this, args);
      popupRef = win;
      return win;
    };

    let timer: NodeJS.Timeout | null = null;

    try {
      const signInPromise = signInWithPopup(auth, provider);

      // Restore window.open immediately after triggering the call
      window.open = originalOpen;

      // Start rapid polling of the popup window closure state
      timer = setInterval(() => {
        if (popupRef && popupRef.closed) {
          if (timer) clearInterval(timer);
          setLoading((currLoading) => {
            if (currLoading) {
              setError("Sign-in cancelled. Please try again if you wish to continue.");
              return false;
            }
            return currLoading;
          });
        }
      }, 500);

      const result = await signInPromise;
      if (timer) clearInterval(timer);

      const user = result.user;

      if (!user.email?.endsWith("@moe-dl.edu.my")) {
        await auth.signOut();
        setError("Only @moe-dl.edu.my accounts are permitted");
        setLoading(false);
        return;
      }

      // Check if they signed up using Email/Password first
      const methods = await fetchSignInMethodsForEmail(auth, user.email || "");
      if (methods.includes("password")) {
        await auth.signOut();
        setError(
          language === "ms"
            ? "E-mel ini telah didaftarkan dengan E-mel & Kata Laluan. Sila log masuk menggunakan e-mel dan kata laluan anda."
            : "This email is registered via Email/Password. Please sign in using your email and password instead."
        );
        setLoading(false);
        return;
      }

      const idToken = await user.getIdToken();
      const sessionResult = await createSession(idToken);

      if (!sessionResult.success) {
        throw new Error(sessionResult.error || "Failed to create secure session");
      }

      const role = sessionResult.role;

      if (role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      if (timer) clearInterval(timer);

      // Safety check: ensure window.open is restored
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }

      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in cancelled. Please try again if you wish to continue.");
        setLoading(false);
        return;
      }

      if (err.code === "auth/popup-blocked") {
        setError("The sign-in popup was blocked by your browser. Please allow popups for this site.");
        setLoading(false);
        return;
      }

      if (err.code === "auth/cancelled-popup-request") {
        setLoading(false);
        return;
      }

      console.error("Google login error:", err);
      setError(err.message || "An error occurred during Google Sign-In");
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading || success || cooldown > 0) return;
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setError("");
      setSuccess("dispatched");
      const until = Date.now() + 60 * 1000;
      localStorage.setItem("auth_reset_cooldown_until", until.toString());
      setCooldown(60);
    } catch (err: any) {
      console.error("Reset error:", err);
      setError(err.message || "An error occurred. Make sure your email is valid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-background overflow-x-hidden relative">
      {/* Left Side: Auth Form */}
      <div className="w-full lg:w-[38%] flex-1 flex flex-col items-center justify-center p-8 sm:p-12 lg:p-16 bg-background z-10 shadow-2xl relative">
        {/* Floating Theme and Language Toggles */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
          {/* Language Selector */}
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "ms" : "en")}
            className="p-2.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 active:scale-95 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Toggle Language / Tukar Bahasa"
          >
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="uppercase">{language}</span>
          </button>

          {/* Theme Selector */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-all active:scale-95 shadow-sm flex items-center justify-center hover:cursor-pointer"
            title="Toggle Theme / Tukar Tema"
          >
            <Sun className="w-4 h-4 hidden dark:block text-amber-500" />
            <Moon className="w-4 h-4 block dark:hidden text-indigo-600" />
          </button>
        </div>

        <div className="w-full max-w-sm">
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-primary tracking-tight mb-2">
              QBike<span className="text-destructive">.</span>
            </h1>
            <p className="text-muted-foreground text-sm font-medium">
              KMJ bike booking system
            </p>
          </div>

          {isMaintenance && !error && (
            <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm mb-6 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30 animate-in fade-in slide-in-from-top-2 duration-300">
              {t.maintenance}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-6 border border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 p-4 rounded-xl text-sm mb-6 border border-amber-200 dark:border-amber-900/30 animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-1.5">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {language === "ms" ? "Pautan Tetapan Semula Dihantar!" : "Reset Link Sent!"}
              </p>
              <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                {language === "ms" ? (
                  <>Sila semak peti masuk anda. Jika tiada, ia kemungkinan besar berada di dalam <strong className="text-destructive font-bold underline underline-offset-2 whitespace-nowrap">folder SPAM</strong> anda.</>
                ) : (
                  <>Please check your email inbox. If you don&apos;t see it, it is highly likely sitting inside your <strong className="text-destructive font-bold underline underline-offset-2 whitespace-nowrap">SPAM folder</strong>.</>
                )}
              </p>
            </div>
          )}

          <div className="space-y-6">
            {mode === "check_email" && (
              <form onSubmit={handleEmailCheck} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">
                    {t.emailLabel}
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm outline-none placeholder:text-muted-foreground/60"
                    placeholder="name@moe-dl.edu.my"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-all transform active:scale-[0.98] flex items-center justify-center h-12 shadow-lg shadow-primary/20 disabled:opacity-70"
                >
                  {loading ? <LoadingSpinner className="text-white" /> : t.continueBtn}
                </button>

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wider">
                    <span className="px-4 bg-background text-muted-foreground font-medium">
                      {t.orContinueWith}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  className="w-full bg-background text-foreground border border-border font-bold py-3 rounded-xl hover:bg-muted/50 transition-all flex items-center justify-center gap-3 h-12 shadow-sm disabled:opacity-70"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </button>
              </form>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">
                      {t.signingInAs}
                    </span>
                    <span className="text-sm font-semibold truncate max-w-[150px]">
                      {email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode("check_email")}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    {t.changeBtn}
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-sm font-semibold text-foreground">
                      {t.passwordLabel}
                    </label>
                    <button
                      type="button"
                      disabled={loading || !!success || cooldown > 0}
                      onClick={handleForgotPassword}
                      className="text-xs text-primary font-bold hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      {cooldown > 0 
                        ? `${t.forgotPassword} (${cooldown}s)` 
                        : t.forgotPassword}
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm outline-none"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-all transform active:scale-[0.98] flex items-center justify-center h-12 shadow-lg shadow-primary/20 mt-2"
                >
                  {loading ? <LoadingSpinner className="text-white" /> : t.signInBtn}
                </button>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">
                      {t.creatingAccountFor}
                    </span>
                    <span className="text-sm font-semibold truncate max-w-[150px]">
                      {email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode("check_email")}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    {t.changeBtn}
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">
                    {t.passwordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm outline-none animate-in fade-in slide-in-from-top-1 duration-200"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground ml-1">
                    {t.passwordHint}
                  </p>
                </div>
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-sm font-semibold text-foreground ml-1">
                    {t.confirmPasswordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm outline-none"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-all transform active:scale-[0.98] flex items-center justify-center h-12 shadow-lg shadow-primary/20 mt-2"
                >
                  {loading ? (
                    <LoadingSpinner className="text-white" />
                  ) : (
                    t.createAccountBtn
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="mt-12 text-center">
            <p className="text-xs text-muted-foreground">
              {t.terms1}
              <Link
                href="/auth/terms"
                onClick={(e) => {
                  e.preventDefault();
                  setPolicyTab("terms");
                  setIsPolicyOpen(true);
                }}
                className="text-primary font-bold hover:underline cursor-pointer"
              >
                {t.terms2}
              </Link>{" "}
              {t.terms3}
              <Link
                href="/auth/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  setPolicyTab("privacy");
                  setIsPolicyOpen(true);
                }}
                className="text-primary font-bold hover:underline cursor-pointer"
              >
                {t.terms4}
              </Link>
              .
            </p>
          </div>
          <div className="mt-8 pb-6 text-center text-[10px] text-muted-foreground/60">
            {t.rights}
          </div>
        </div>
      </div>

      {/* Right Side: Animated Image Area */}
      <div className="hidden lg:block lg:w-[62%] relative bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-primary/40 dark:bg-black/40 z-10 backdrop-blur-[1px]"></div>
        <img
          src="/images/ui/auth-bg.webp"
          alt="Background"
          className="absolute inset-0 h-full w-auto min-w-[115%] object-cover animate-panning opacity-90"
        />


      </div>

      {/* Terms & Privacy Dialog Modal */}
      <PolicyModal 
        isOpen={isPolicyOpen} 
        onClose={() => setIsPolicyOpen(false)} 
        defaultTab={policyTab} 
      />
    </div>
  );
}
