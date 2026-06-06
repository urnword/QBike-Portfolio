"use client";

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      <Navbar 
        isAdmin={true} 
        isCollapsed={isCollapsed} 
        onToggleSidebar={() => setIsCollapsed(!isCollapsed)} 
      />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar isAdmin={true} isCollapsed={isCollapsed} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0 flex flex-col justify-between">
          <div className="flex-1 w-full flex flex-col">
            {children}
          </div>
          <footer className="pt-4 pb-8 text-center text-[11px] text-muted-foreground/60 border-t border-border/20 w-full mt-auto bg-card/5 shrink-0">
            © 2026 Zaid Izzuddin. All Rights Reserved.
          </footer>
        </main>
      </div>
      <MobileNav isAdmin={true} />
    </div>
  );
}
