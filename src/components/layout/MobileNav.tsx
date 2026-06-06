"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { 
  LayoutDashboard, 
  Bike, 
  History, 
  ShieldCheck,
  Calendar,
  Users,
  CheckCircle,
  GraduationCap,
  Settings,
  BarChart,
  Flag,
  Wrench,
  QrCode,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MoreHorizontal,
  ClipboardList,
  Bell
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { clearSession } from "@/app/(auth)/auth/actions";

interface MobileNavProps {
  isAdmin?: boolean;
}

export function MobileNav({ isAdmin = false }: MobileNavProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  
  // Admin-specific state for scrolling
  const navRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

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

  const checkScroll = () => {
    if (navRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navRef.current;
      setShowLeftArrow(scrollLeft > 20);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      checkScroll();
      const navElement = navRef.current;
      if (navElement) {
        navElement.addEventListener("scroll", checkScroll);
      }
      window.addEventListener("resize", checkScroll);
      return () => {
        if (navElement) navElement.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [user, isAdmin]);

  const adminLinks = [
    { href: "/admin", label: "Admin", icon: ShieldCheck },
    { href: "/admin/notifications", label: "Alert", icon: Bell },
    { href: "/admin/bikes", label: "Bikes", icon: Bike },
    { href: "/admin/bookings", label: "Active", icon: Calendar },
    { href: "/admin/bookings/history", label: "History", icon: History },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/verification", label: "Verify", icon: CheckCircle },
    { href: "/admin/practicums", label: "Practicums", icon: GraduationCap },
    { href: "/admin/policy", label: "Config", icon: Settings },
    { href: "/admin/analytics", label: "Stats", icon: BarChart },
    { href: "/admin/reports", label: "Reports", icon: Flag },
    { href: "/admin/maintenance", label: "Fix", icon: Wrench },
    { href: "/admin/action-log", label: "Logs", icon: ClipboardList },
  ];

  const studentStaffLinks = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/book", label: "Book", icon: Bike },
    { href: "/book/scan", label: "Scan", icon: QrCode, isCenter: true },
    { href: "/history", label: "History", icon: History },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ];

  if (isAdmin) {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        {/* Scroll Arrows */}
        {showLeftArrow && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent flex items-center justify-start pl-1 animate-in fade-in slide-in-from-left-2 duration-300">
            <ChevronLeft className="w-4 h-4 text-primary animate-pulse" />
          </div>
        )}
        {showRightArrow && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent flex items-center justify-end pr-1 animate-in fade-in slide-in-from-right-2 duration-300">
            <ChevronRight className="w-4 h-4 text-primary animate-pulse" />
          </div>
        )}

        <nav 
          ref={navRef}
          className="h-16 bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
        >
          <div className="flex items-center w-max min-w-full justify-around h-full px-2 gap-2">
            {adminLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href || (
                link.href !== "/" && 
                pathname.startsWith(link.href + "/") &&
                !adminLinks.some(l => l.href !== link.href && pathname.startsWith(l.href) && l.href.length > link.href.length)
              );
              
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex flex-col items-center justify-center min-w-[64px] h-full gap-1 transition-colors relative ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`p-1.5 rounded-xl transition-colors ${isActive ? "bg-primary/10" : ""}`}>
                    <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : "stroke-[2px]"}`} />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">{t(link.label)}</span>
                  {isActive && (
                    <div className="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full" />
                  )}
                </Link>
              );
            })}
            
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex flex-col items-center justify-center min-w-[64px] h-full gap-1 transition-colors text-muted-foreground hover:text-destructive"
            >
              <div className="p-1.5 rounded-xl transition-colors">
                <LogOut className="w-5 h-5 stroke-[2px]" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">{t("Logout")}</span>
            </button>
          </div>
        </nav>
      </div>
    );
  }

  // Non-Admin View (5-item layout with prominent center scan button)
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-auto pb-safe drop-shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
      <nav className="h-16 bg-primary relative flex items-center justify-around px-2 rounded-t-[1.5rem] pb-1">
        {studentStaffLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (
            link.href !== "/" && 
            pathname.startsWith(link.href + "/") &&
            !studentStaffLinks.some(l => l.href !== link.href && pathname.startsWith(l.href) && l.href.length > link.href.length)
          );

          if (link.isCenter) {
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative ${
                  isActive ? "text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {/* SVG Smooth Bump extending the navbar */}
                <div className="absolute -top-[20px] left-1/2 -translate-x-1/2 w-[84px] h-[20px] text-primary pointer-events-none">
                  <svg viewBox="0 0 84 20" fill="currentColor" className="w-full h-full">
                    <path d="M0,20 C15,20 22,0 42,0 C62,0 69,20 84,20 Z" />
                  </svg>
                </div>
                
                {/* Invisible spacer to maintain layout matching other icons */}
                <div className="h-7 w-7" />

                {/* Actual floating button */}
                <div className="absolute -top-[16px] left-1/2 -translate-x-1/2 w-12 h-12 bg-card text-primary rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform z-20">
                  <Icon className="w-6 h-6 stroke-[2.5px]" />
                </div>

                <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap z-20">
                  {t(link.label)}
                </span>
                
                {isActive && (
                  <div className="absolute bottom-0 w-8 h-1 bg-white rounded-t-full" />
                )}
              </Link>
            );
          }
          
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative ${
                isActive ? "text-white" : "text-white/70 hover:text-white"
              }`}
            >
              <div className={`p-1 rounded-xl transition-colors ${isActive ? "bg-white/20" : ""}`}>
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : "stroke-[2px]"}`} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                {t(link.label)}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-1 bg-white rounded-t-full" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
