"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, List } from "lucide-react";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  id?: string;
  key: keyof T;
  label: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: T[keyof T], item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({ columns, data, pageSize = 10, onRowClick }: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const totalPages = Math.ceil(data.length / pageSize) || 1;

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: "base" });
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortOrder]);

  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!data.length) {
    return <EmptyState message="No records found." borderless />;
  }

  const hasSortable = columns.some(col => col.sortable);

  return (
    <div className="w-full">
      {hasSortable && (
        <div className="px-4 md:px-6 py-2 bg-muted/20 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          Click on column headers to sort records
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm text-left text-card-foreground">
          <thead className="text-[11px] text-muted-foreground uppercase bg-muted border-b border-border">
            <tr>
              {columns.map((col, cIdx) => {
                const alignClass = col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left";
                return (
                  <th
                    key={col.id || `${String(col.key)}-${cIdx}`}
                    className={`px-4 md:px-6 py-3 md:py-4 font-bold tracking-wider ${alignClass} ${col.sortable ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className={`flex items-center gap-1 ${col.align === "center" ? "justify-center" : col.align === "right" ? "justify-end" : "justify-start"} line-clamp-2 break-words`}>
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.map((item, index) => (
              <tr 
                key={index} 
                onClick={() => onRowClick && onRowClick(item)}
                className={`hover:bg-muted/70 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((col, cIdx) => {
                  const alignClass = col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left";
                  return (
                    <td key={col.id || `${String(col.key)}-${cIdx}`} className={`px-4 md:px-6 py-3 md:py-4 text-[13px] ${alignClass}`}>
                      <div className="line-clamp-2 break-words">
                        {col.render ? col.render(item[col.key], item) : String(item[col.key])}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length > 0 && (
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-t border-border bg-card">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground select-none">
            <List className="h-4 w-4 text-muted-foreground/75" />
            <span>
              Showing records <span className="font-semibold text-card-foreground">{((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, data.length)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center bg-card disabled:opacity-40 disabled:pointer-events-none hover:bg-muted transition-all active:scale-95 hover:cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center bg-card disabled:opacity-40 disabled:pointer-events-none hover:bg-muted transition-all active:scale-95 hover:cursor-pointer"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
