"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, AlertTriangle, Info, ShieldAlert, Bell, CheckCircle2, AlertCircle, XCircle, MoreVertical, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { NotificationDocument } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { db } from "@/lib/firebase/client";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from "firebase/firestore";

export default function NotificationsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Partial<NotificationDocument>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Partial<NotificationDocument>[] = [];
      snapshot.forEach((doc) => {
        if (doc.data().type !== "admin_report") {
          notifs.push({ notificationId: doc.id, ...doc.data() } as Partial<NotificationDocument>);
        }
      });
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const markAllRead = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      if (!n.isRead && n.notificationId) {
        batch.update(doc(db, "users", user.uid, "notifications", n.notificationId), { isRead: true });
      }
    });
    await batch.commit();
  };

  const clearAll = async () => {
    if (!user) return;
    if (confirm("Are you sure you want to clear all notifications?")) {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (n.notificationId) {
          batch.delete(doc(db, "users", user.uid, "notifications", n.notificationId));
        }
      });
      await batch.commit();
    }
  };

  const markRead = async (id: string) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "notifications", id), { isRead: true });
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "notifications", id));
  };

  const getIcon = (type: string, isRead: boolean) => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case "booking": 
        return (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isRead ? 'bg-muted dark:bg-muted/20 text-muted-foreground' : 'bg-green-500/10 text-green-600 dark:text-green-500'}`}>
            <CheckCircle2 className={iconClass} />
          </div>
        );
      case "block": 
        return (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isRead ? 'bg-muted dark:bg-muted/20 text-muted-foreground' : 'bg-destructive/10 text-destructive dark:text-red-500'}`}>
            <XCircle className={iconClass} />
          </div>
        );
      case "system": 
        return (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isRead ? 'bg-muted dark:bg-muted/20 text-muted-foreground' : 'bg-primary/10 text-primary dark:text-blue-500'}`}>
            <Info className={iconClass} />
          </div>
        );
      default: 
        return (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isRead ? 'bg-muted dark:bg-muted/20 text-muted-foreground' : 'bg-amber-500/10 text-amber-600 dark:text-amber-500'}`}>
            <Bell className={iconClass} />
          </div>
        );
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-y-2 md:gap-y-0">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t("notifications.title")}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t("Home")}</Link>
            <span>›</span>
            <span>{t("notifications.title")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto mt-1 md:mt-0">
          <button 
            onClick={markAllRead}
            disabled={!notifications.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-card dark:bg-muted/10 text-primary dark:text-blue-500 border border-border px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="whitespace-nowrap">{t("notifications.markAllRead")}</span>
          </button>
          <button 
            onClick={clearAll}
            disabled={!notifications.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t("notifications.clearAll")}</span>
          </button>
        </div>
      </div>

      {!notifications.length && !loading ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border text-center max-w-md mx-auto p-12">
          <div className="w-20 h-20 bg-muted dark:bg-muted/20 text-muted-foreground rounded-full flex items-center justify-center mx-auto mb-6">
            <Bell className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{t("notifications.empty")}</h2>
          <p className="text-[14px] text-muted-foreground mb-8 leading-relaxed">
            Stay tuned! We&apos;ll notify you when there&apos;s an update on your bike booking or college policy.
          </p>
          <Link href="/dashboard" className="bg-primary text-white px-8 py-3 rounded-xl font-medium text-sm hover:bg-primary/90 transition-all inline-block shadow-lg shadow-primary/20">
            Back to Dashboard
          </Link>
        </div>
      ) : loading ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border text-center max-w-md mx-auto p-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground text-sm">{t("notifications.loading")}</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 md:p-8 border-b border-border bg-muted/5">
            <h3 className="text-lg font-medium text-foreground">{t("notifications.recent")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("notifications.recentDesc")}</p>
          </div>
          
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <div 
                key={n.notificationId} 
                onClick={() => markRead(n.notificationId!)}
                className={`flex items-start gap-4 md:gap-6 p-5 md:p-8 transition-all cursor-pointer relative group ${n.isRead ? "bg-card" : "bg-primary/5 dark:bg-blue-900/5"}`}
              >
                {!n.isRead && (
                  <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-primary rounded-r-full"></div>
                )}
                
                {getIcon(n.type!, !!n.isRead)}
                
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 mb-1.5">
                    <h4 className={`text-[15px] md:text-base ${n.isRead ? "font-medium text-foreground" : "font-bold text-primary dark:text-blue-500"}`}>
                      {n.title}
                    </h4>
                    <span className="text-[10px] md:text-[11px] font-bold text-muted-foreground uppercase tracking-widest block md:hidden">
                      {formatDistanceToNow(new Date(n.createdAt!.seconds * 1000), { addSuffix: true })}
                    </span>
                  </div>
                  <p className={`text-[13px] md:text-[14px] leading-relaxed w-full ${n.isRead ? "text-muted-foreground" : "text-muted-foreground/90 font-medium"}`}>
                    {n.body}
                  </p>
                </div>
                
                <div className="hidden md:flex items-center justify-center w-32 shrink-0">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right whitespace-nowrap">
                    {formatDistanceToNow(new Date(n.createdAt!.seconds * 1000), { addSuffix: true })}
                  </span>
                </div>
                
                <div className="flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => deleteNotification(e, n.notificationId!)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
