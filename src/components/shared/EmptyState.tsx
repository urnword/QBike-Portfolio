import React from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ 
  message = "No items found", 
  icon: Icon = Inbox,
  borderless = false 
}: { 
  message?: string, 
  icon?: any,
  borderless?: boolean 
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-card ${borderless ? "" : "border border-border rounded-xl"}`}>
      <div className="bg-muted p-3 rounded-full mb-3 shadow-sm">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
