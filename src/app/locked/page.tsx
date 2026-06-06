import React from 'react';
import { Lock } from 'lucide-react';
import Link from 'next/link';

export default function LockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            System Temporarily Unavailable
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            QBike is currently down for scheduled maintenance. Non-admin logins are temporarily disabled to ensure data integrity.
          </p>
        </div>

        <div className="bg-muted p-4 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground">
            If you are an administrator, you may be able to <Link href="/auth" className="text-primary hover:underline font-medium">log in here</Link>. 
            All other users, please try again later.
          </p>
        </div>
        <div className="mt-8 pb-6 text-center text-[10px] text-muted-foreground/60">
          © 2026 Zaid Izzuddin. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
