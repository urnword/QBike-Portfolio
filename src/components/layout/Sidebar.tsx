"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  LayoutDashboard,
  Bike,
  History,
  Bell,
  User,
  Settings,
  BookOpen,
  FileText,
  Mail,
  LogOut,
  Users,
  CheckCircle,
  GraduationCap,
  BarChart,
  Flag,
  Wrench,
  Calendar,
  QrCode,
  ClipboardList
} from "lucide-react";

import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { clearSession } from "@/app/(auth)/auth/actions";

interface SidebarProps {
  isAdmin?: boolean;
  isCollapsed?: boolean;
}

export function Sidebar({ isAdmin = false, isCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const getInitials = (name: string) => {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const studentLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/book", label: "Book a Bike", icon: Bike },
    { href: "/book/scan", label: "Scan QR", icon: QrCode },
    { href: "/history", label: "History", icon: History },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const staffLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/book", label: "Book a Bike", icon: Bike },
    { href: "/book/scan", label: "Scan QR", icon: QrCode },
    { href: "/history", label: "History", icon: History },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const studentSecondaryLinks = [
    { href: "/guide", label: "Guide", icon: BookOpen },
    { href: "/policy", label: "Policy", icon: FileText },
    { href: "/contact", label: "Contact", icon: Mail },
  ];

  const adminLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/notifications", label: "Notifications", icon: Bell },
    { type: "divider", label: "Bike Management" },
    { href: "/admin/bikes", label: "Bikes", icon: Bike },
    { type: "divider", label: "Booking Management" },
    { href: "/admin/bookings", label: "Active Bookings", icon: Calendar },
    { href: "/admin/bookings/history", label: "Booking History", icon: History },
    { type: "divider", label: "User Management" },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/verification", label: "Verification", icon: CheckCircle },
    { type: "divider", label: "System" },
    { href: "/admin/practicums", label: "Practicums", icon: GraduationCap },
    { href: "/admin/policy", label: "Policy Config", icon: Settings },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart },
    { href: "/admin/reports", label: "Reports", icon: Flag },
    { href: "/admin/maintenance", label: "Maintenance", icon: Wrench },
    { href: "/admin/action-log", label: "Action Log", icon: ClipboardList },
  ];

  const links = isAdmin ? adminLinks : (user?.role === 'staff' ? staffLinks : studentLinks);

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

  return (
    <aside className={`hidden md:flex ${isCollapsed ? "w-20" : "w-64"} bg-card border-r border-border flex flex-col z-10 shadow-sm overflow-hidden h-full transition-all duration-300`}>
      {/* Profile Banner */}
      <div className="relative h-32 bg-gradient-to-br from-primary to-primary/80 p-4 flex flex-col justify-end">
        <div className="absolute inset-0 opacity-10 mix-blend-overlay"></div>
        <div className={`relative z-10 flex items-center transition-all duration-300 ${isCollapsed ? "justify-center" : "gap-4"}`}>
          <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-white/10 shadow-md shrink-0 flex items-center justify-center">
            {mounted && user?.photoURL ? (
              <img src={user.photoURL} alt="User Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-sm">
                {mounted && user?.displayName ? getInitials(user.displayName) : "U"}
              </span>
            )}
          </div>
          <div className={`transition-all duration-300 overflow-hidden whitespace-nowrap flex flex-col justify-center ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100"}`}>
            <div className="text-white font-medium text-sm drop-shadow-md truncate">
              {mounted && user?.displayName ? user.displayName : "User"}
            </div>
            <div className="text-white/80 text-xs truncate">
              {mounted && user?.role === 'admin' ? 'Administrator' : (mounted && user?.role === 'staff' ? 'Staff' : 'Student')}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden w-full custom-scrollbar flex flex-col pt-4">
        <div className={`pb-2 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase ${isCollapsed ? "flex justify-center px-0" : "px-6"}`}>
          {isCollapsed ? <span className="text-lg leading-none">...</span> : t("Personal")}
        </div>
        {links.map((link, idx) => {
          if ('type' in link && link.type === "divider") {
            return (
              <div key={idx} className={`pt-6 pb-2 px-6 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase animate-in fade-in duration-300 ${isCollapsed ? "flex justify-center" : ""}`}>
                {isCollapsed ? <span className="text-lg leading-none">...</span> : t(link.label)}
              </div>
            );
          }

          const Icon = link.icon as React.ElementType;
          const href = 'href' in link ? (link.href as string) : null;
          if (!href) return null;

          // Improved isActive logic:
          // 1. Exact matches always win.
          // 2. StartsWith matches only if there isn't a more specific match in the sidebar list.
          const isActive = pathname === href || (
            href !== "/" &&
            href !== "/admin" &&
            href !== "/dashboard" &&
            pathname.startsWith(href + "/") &&
            !links.some(l => 'href' in l && l.href !== href && pathname.startsWith(l.href!) && l.href!.length > href.length)
          );
          return (
            <Link
              key={idx}
              href={href!}
              className={`flex items-center gap-4 pl-5 mx-3 py-3 text-[14px] transition-colors relative rounded-full mb-1 group ${isActive ? "bg-secondary text-white shadow-md" : "text-muted-foreground hover:bg-muted hover:text-primary"
                }`}
            >
              <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${isActive ? "text-white" : "text-muted-foreground group-hover:text-primary"}`} />
              <span className={`transition-[max-width,opacity] duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
                {t(link.label)}
              </span>
              {isCollapsed && (
                <div className="fixed left-[80px] mt-1 ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap">
                  {t(link.label)}
                </div>
              )}
            </Link>
          );
        })}

        {!isAdmin && (
          <>
            <div className="my-2" />
            <div className={`pb-2 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase ${isCollapsed ? "flex justify-center px-0" : "px-6"}`}>
              {isCollapsed ? <span className="text-lg leading-none">...</span> : t("Apps")}
            </div>
            {studentSecondaryLinks.map((link, idx) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={idx}
                  href={link.href}
                  className={`flex items-center gap-4 pl-5 mx-3 py-3 text-[14px] transition-colors relative rounded-full mb-1 group ${isActive ? "bg-secondary text-white shadow-md" : "text-muted-foreground hover:bg-muted hover:text-primary"
                    }`}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${isActive ? "text-white" : "text-muted-foreground group-hover:text-primary"}`} />
                  <span className={`transition-[max-width,opacity] duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
                    {t(link.label)}
                  </span>
                  {isCollapsed && (
                    <div className="fixed left-[80px] mt-1 ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap">
                      {t(link.label)}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="py-4 border-t border-border w-full flex flex-col">
        <button onClick={handleLogout} className="flex items-center gap-4 pl-5 mx-3 py-3 text-sm font-medium text-muted-foreground rounded-full hover:bg-muted hover:text-destructive transition-colors group relative">
          <LogOut className="h-[18px] w-[18px] shrink-0 transition-colors duration-200" />
          <span className={`transition-[max-width,opacity] duration-300 overflow-hidden whitespace-nowrap text-left ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[100px] opacity-100"}`}>
            {t("Log out")}
          </span>
          {isCollapsed && (
            <div className="fixed left-[80px] mt-1 ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap">
              {t("Log out")}
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
