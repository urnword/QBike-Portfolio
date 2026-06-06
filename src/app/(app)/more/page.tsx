"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { 
  User, 
  Settings, 
  Bell, 
  BookOpen, 
  FileText, 
  Mail, 
  LogOut,
  ChevronRight
} from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { clearSession } from "@/app/(auth)/auth/actions";

export default function MorePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

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

  const moreLinks = [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/notifications", label: "Alerts", icon: Bell },
    { href: "/guide", label: "Guide", icon: BookOpen },
    { href: "/policy", label: "Policy", icon: FileText },
    { href: "/contact", label: "Contact", icon: Mail },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("More")}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t("Home")}</Link>
            <span>›</span>
            <span>{t("More")}</span>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all">
        <div className="flex flex-col">
          {moreLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between p-5 md:p-6 hover:bg-muted/30 transition-colors active:bg-muted/50 border-b border-border"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-foreground">{t(link.label)}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground/50" />
              </Link>
            );
          })}

          <button
            onClick={handleLogout}
            className="flex items-center justify-between p-5 md:p-6 hover:bg-destructive/5 transition-colors active:bg-destructive/10 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0 transition-colors group-hover:bg-destructive group-hover:text-white">
                <LogOut className="w-5 h-5" />
              </div>
              <span className="text-base font-medium text-destructive">{t("Logout")}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/50" />
          </button>
        </div>
      </div>
    </div>
  );
}
