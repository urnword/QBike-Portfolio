"use client";

import React from "react";
import { Construction } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminAnalyticsPage() {
  const { t } = useLanguage();
  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen flex flex-col justify-between">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">{t("admin.analytics.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.analytics.insights")}</span>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F2F4F8] dark:bg-card rounded-xl border border-border p-8 md:p-12 text-center w-full shadow-sm">
        <div className="w-16 h-16 rounded-full bg-[#1B3392]/10 dark:bg-[#1B3392]/20 flex items-center justify-center text-[#1B3392] mb-6">
          <Construction className="w-8 h-8" />
        </div>

        <h3 className="text-xl font-medium text-foreground mb-2">
          {t("admin.analytics.underConstruction")}
        </h3>
        
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          {t("admin.analytics.underConstructionDesc")}
        </p>
      </div>

      <div className="mt-8" />
    </div>
  );
}




