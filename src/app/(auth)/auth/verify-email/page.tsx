"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { sendEmailVerification, signOut } from "firebase/auth";
import { createSession, clearSession } from "../actions";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(60);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Initialize cooldown timer from localStorage on mount
    const savedUntil = localStorage.getItem("verification_resend_cooldown_until");
    if (savedUntil) {
      const remaining = Math.ceil((parseInt(savedUntil, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        setCountdown(0);
      }
    } else {
      // First arrival: start 60s cooldown and save
      const until = Date.now() + 60 * 1000;
      localStorage.setItem("verification_resend_cooldown_until", until.toString());
      setCountdown(60);
    }

    const checkEmailVerified = async () => {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          localStorage.removeItem("verification_resend_cooldown_until");
          // Refresh the session cookie with the new verified status
          const idToken = await user.getIdToken(true);
          await createSession(idToken);
          router.push("/onboarding");
        }
      }
    };

    const timer = setInterval(checkEmailVerified, 3000);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResend = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        await sendEmailVerification(user);
        const until = Date.now() + 60 * 1000;
        localStorage.setItem("verification_resend_cooldown_until", until.toString());
        setCountdown(60);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleGoBack = async () => {
    try {
      localStorage.removeItem("verification_resend_cooldown_until");
      await signOut(auth);
      await clearSession();
      router.push("/auth");
    } catch (e) {
      console.error(e);
      router.push("/auth");
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-background overflow-x-hidden relative">
      {/* Left Side: Verification Content */}
      <div className="w-full lg:w-[38%] flex-1 flex flex-col items-center justify-center p-8 sm:p-12 lg:p-16 bg-background z-10 shadow-2xl relative">
        <div className="w-full max-w-sm text-center flex flex-col items-center">
          <div className="h-20 w-20 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-8 border border-primary/20 shadow-inner">
            <MailCheck className="h-10 w-10" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-3">Verify your email</h1>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            We&apos;ve sent a verification link to your email address. Please check your inbox and <strong className="text-destructive font-bold underline underline-offset-2 whitespace-nowrap">spam folder</strong>.
          </p>

          <div className="w-full bg-muted/50 rounded-xl border border-border p-4 text-sm font-semibold mb-8 text-primary shadow-sm">
            {auth.currentUser?.email || "student@moe-dl.edu.my"}
          </div>

          <div className="space-y-6 w-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest italic animate-pulse">
              Waiting for verification...
            </p>

            <button
              onClick={handleResend}
              disabled={countdown > 0}
              className="w-full text-sm font-bold text-primary hover:underline disabled:text-muted-foreground/60 disabled:no-underline transition-all"
            >
              {countdown > 0 ? `Resend email in ${countdown}s` : "Resend verification email"}
            </button>

            <div className="pt-8 border-t border-border w-full">
              <p className="text-xs text-muted-foreground">
                Wrong email address? <button onClick={handleGoBack} className="text-primary font-bold hover:underline cursor-pointer">Go back</button>
              </p>
            </div>
            <div className="mt-8 pb-6 text-center text-[10px] text-muted-foreground/60">
              © 2026 Zaid Izzuddin. All Rights Reserved.
            </div>
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
    </div>
  );
}
