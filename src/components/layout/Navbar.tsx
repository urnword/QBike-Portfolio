"use client";

import React, { useState } from "react";
import { Bell, Menu, Search, Bike, X, Moon, Sun, Shield, User } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "next-themes";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

interface NavbarProps {
  isAdmin?: boolean;
  onToggleSidebar?: () => void;
  isCollapsed?: boolean;
}

export function Navbar({ isAdmin = false, onToggleSidebar, isCollapsed }: NavbarProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      where("isRead", "==", false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.filter(doc => {
        const data = doc.data();
        return isAdmin ? data.type === "admin_report" : data.type !== "admin_report";
      }).length;
      setUnreadCount(count);
    });
    return () => unsubscribe();
  }, [user?.uid, isAdmin]);

  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  const getInitials = (name: string) => {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const searchablePages = [
    { name: "Dashboard", href: isAdmin ? "/admin" : "/dashboard" },
    { name: "Book a Bike", href: "/book" },
    { name: "Book for Class", href: "/book/class" },
    { name: "Scan QR", href: "/book/scan" },
    { name: "History", href: "/history" },
    { name: "Notifications", href: "/notifications" },
    { name: "Profile", href: "/profile" },
    { name: "Settings", href: "/settings" },
    { name: "Guide", href: "/guide" },
    { name: "Policy", href: "/policy" },
    { name: "Contact", href: "/contact" },
  ].filter(page => {
    if (page.href === "/book/class") {
      return isAdmin || user?.role === "staff";
    }
    return true;
  });

  const filteredPages = searchablePages.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-[64px] bg-primary text-white flex items-center justify-between shadow-sm z-50 w-full shrink-0 relative">
      <div className="flex items-center h-full flex-1">
        <div className={`${isCollapsed ? "md:w-20" : "md:w-64"} w-auto flex items-center pl-4 md:pl-6 shrink-0 transition-all duration-300`}>
          <Link href={dashboardHref} className="flex items-center gap-2 font-bold text-lg md:text-xl tracking-tighter shrink-0 overflow-hidden">
            <div className="w-8 h-8 rounded-md bg-[#FFFFFF] flex items-center justify-center shrink-0 overflow-hidden p-[2px]">
              <img src="/images/logo/qbike-192x192.webp" alt="QBike Logo" className="w-full h-full object-contain" />
            </div>
            <div className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? "md:max-w-0 md:opacity-0" : "max-w-[100px] opacity-100"}`}>
              <span className="font-bold">QBike</span>
            </div>
          </Link>
        </div>
        <div className="px-2 md:px-4 flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="text-white hover:bg-white/10 p-2 rounded-full transition-colors active:scale-95 hidden md:block"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="relative md:block hidden">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`text-white hover:bg-white/10 p-2 rounded-full transition-colors ${showSearch ? 'bg-white/20' : ''}`}
            >
              <Search className="w-5 h-5" />
            </button>

            {showSearch && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-card rounded-xl shadow-2xl border border-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
                <div className="p-3 border-b border-border flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={t("Search pages...")}
                    className="flex-1 bg-transparent border-none outline-none text-foreground text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button onClick={() => setShowSearch(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto py-2">
                  {filteredPages.length > 0 ? (
                    filteredPages.map(page => (
                      <button
                        key={page.href}
                        onClick={() => {
                          router.push(page.href);
                          setShowSearch(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-between group"
                      >
                        {t(page.name)}
                        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Go to page</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs text-muted-foreground text-center italic">No pages found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex space-x-1 md:space-x-2 px-4 md:px-6 items-center">
        {mounted && user?.role === "admin" && (
          <button
            onClick={() => router.push(isAdmin ? "/dashboard" : "/admin")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-xs font-bold text-white shadow-sm border border-white/10 mr-1 hover:cursor-pointer"
            title={isAdmin ? t("Switch to User View") : t("Switch to Admin Panel")}
          >
            {isAdmin ? (
              <>
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("Admin Panel")}</span>
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("User View")}</span>
              </>
            )}
          </button>
        )}
        <button
          onClick={() => setLanguage(language === "en" ? "ms" : "en")}
          className="p-1.5 md:p-2 relative rounded-full hover:bg-white/10 transition-colors active:scale-95 text-white hover:cursor-pointer"
          title="Toggle Language"
          suppressHydrationWarning
        >
          <span className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center font-bold text-[10px] md:text-xs tracking-wider select-none leading-none">
            {language.toUpperCase()}
          </span>
        </button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-1.5 md:p-2 relative rounded-full hover:bg-white/10 transition-colors active:scale-95 text-white"
          title="Toggle Theme"
        >
          <Sun className="w-4 h-4 md:w-5 md:h-5 hidden dark:block" />
          <Moon className="w-4 h-4 md:w-5 md:h-5 block dark:hidden" />
        </button>
        <button
          onClick={() => router.push(isAdmin ? "/admin/notifications" : "/notifications")}
          className="p-1.5 md:p-2 relative rounded-full hover:bg-white/10 transition-colors active:scale-95 text-white"
        >
          <Bell className="w-4 h-4 md:w-5 md:h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-destructive border border-primary animate-pulse"></span>
          )}
        </button>
        <Link
          href={isAdmin ? "/admin/policy" : "/profile"}
          className="w-8 h-8 md:w-9 md:h-9 rounded-full ml-2 md:ml-4 overflow-hidden border border-[#ffffff33] hover:border-white transition-all active:scale-90 flex items-center justify-center bg-white/10"
        >
          {mounted && user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] md:text-xs font-bold text-white">
              {mounted && user?.displayName ? getInitials(user.displayName) : "U"}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
