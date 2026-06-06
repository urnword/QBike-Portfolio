"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useLanguage();
  const s = status ? status.toLowerCase() : "";
  
  let bgColor = "bg-muted text-muted-foreground";
  
  if (["verified", "completed", "good", "available"].includes(s)) {
    bgColor = "bg-green-500/10 text-green-600 dark:text-green-500 border border-green-500/20";
  } else if (["pending", "upcoming"].includes(s)) {
    bgColor = "bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20";
  } else if (["active", "collected"].includes(s)) {
    bgColor = "bg-primary/10 text-primary border border-primary/20";
  } else if (["rejected", "late", "flagged", "user_flagged", "blocked", "permanent"].includes(s)) {
    bgColor = "bg-destructive/10 text-destructive border border-destructive/20";
  } else if (["cancelled"].includes(s)) {
    bgColor = "bg-muted text-muted-foreground border border-border/50";
  } else if (["maintenance", "in_use"].includes(s)) {
    bgColor = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
  }

  const translationKey = `status.${s}`;
  const translatedText = t(translationKey);
  const displayStatus = translatedText === translationKey ? status : translatedText;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${bgColor}`}>
      {displayStatus}
    </span>
  );
}
