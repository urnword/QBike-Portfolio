"use client";

import React, { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BookingDocument, ReportDocument } from "@/types";
import { Download, Search, FileSpreadsheet, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users, User, Bike, AlertCircle, History as HistoryIcon, Info, Calendar, Clock, ClipboardList, Copy, Check, XCircle, Tag, Settings, Link2, ShieldAlert, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { db, storage } from "@/lib/firebase/client";
import { collection, query, orderBy, getDocs, where, limit, Timestamp, documentId, doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";

export default function AdminBookingHistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<BookingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<BookingDocument | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyIdToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  
  const [selectedReport, setSelectedReport] = useState<ReportDocument | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");

  const handleViewReport = async (reportId: string) => {
    setLoadingReportId(reportId);
    try {
      const docRef = doc(db, "reports", reportId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSelectedReport({ reportId: docSnap.id, ...docSnap.data() } as ReportDocument);
      } else {
        alert("Report not found");
      }
    } catch (error) {
      console.error("Error fetching report:", error);
      alert("Error fetching report details");
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleViewPhoto = async (path: string) => {
    if (!path) return;
    setPhotoError("");
    try {
      let url = "";
      if (path.startsWith("http://") || path.startsWith("https://")) {
        url = path;
      } else {
        const imageRef = ref(storage, path);
        url = await getDownloadURL(imageRef);
      }
      setViewingPhotoUrl(url);
    } catch (err: any) {
      console.error("Failed to load photo:", err);
      setPhotoError(err.message || "Failed to retrieve photo.");
      alert(`Error loading photo: ${err.message || "Could not retrieve from storage."}`);
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "-";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return format(date, "yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      return "-";
    }
  };

  const formatBoolean = (val: boolean) => {
    return val ? "Yes" : "No";
  };

  const formatBookingType = (val: string) => {
    if (!val) return "-";
    if (val.toLowerCase() === "ondemand") return "On-Demand";
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const formatCancelledBy = (val: string | null) => {
    if (!val) return "-";
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const formatCondition = (val: string | null) => {
    if (!val) return "-";
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const formatBikeHistory = (val: string[] | null | undefined) => {
    if (!val || val.length === 0) return "-";
    return val.join(", ");
  };

  const getReportsCount = (val: string[] | null | undefined) => {
    return val ? val.length : 0;
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState<"userFullName" | "userMatrixNo" | "bookingId">("userFullName");
  
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Sorting state
  const [sortKey, setSortKey] = useState<keyof BookingDocument | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reset page when search parameters or data change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, searchField, startDate, endDate, sortKey, sortOrder, history]);

  const sortedHistory = React.useMemo(() => {
    if (!sortKey) return history;
    return [...history].sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (valA?.seconds !== undefined) valA = valA.seconds;
      if (valB?.seconds !== undefined) valB = valB.seconds;
      
      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      return sortOrder === "asc" ? 1 : -1;
    });
  }, [history, sortKey, sortOrder]);

  const totalPages = Math.ceil(sortedHistory.length / pageSize) || 1;
  const paginatedHistory = React.useMemo(() => {
    return sortedHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedHistory, currentPage, pageSize]);

  const handleSort = (key: keyof BookingDocument) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    setSelectedBooking(null);
    
    try {
      const bookingsRef = collection(db, "bookings");
      let q = query(bookingsRef, orderBy("createdAt", "desc"), limit(100));

      if (searchQuery) {
        const endTerm = searchQuery + "\uf8ff";
        const targetField = searchField === "bookingId" ? documentId() : searchField;
        
        q = query(
          bookingsRef, 
          where(targetField, ">=", searchQuery), 
          where(targetField, "<=", endTerm),
          orderBy(targetField),
          limit(100)
        );
      } else if (startDate && endDate) {
        const startTimestamp = Timestamp.fromDate(new Date(startDate));
        const endTimestamp = Timestamp.fromDate(new Date(new Date(endDate).setHours(23, 59, 59, 999)));
        
        q = query(
          bookingsRef,
          where("startTime", ">=", startTimestamp),
          where("startTime", "<=", endTimestamp),
          orderBy("startTime", "desc"),
          limit(100)
        );
      }

      const snap = await getDocs(q);
      setHistory(snap.docs.map(doc => ({ bookingId: doc.id, ...doc.data() } as BookingDocument)));
    } catch (err) {
      console.error("Error fetching history:", err);
      if (!searchQuery && (!startDate || !endDate)) {
          const fallback = await getDocs(query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(100)));
          setHistory(fallback.docs.map(doc => ({ bookingId: doc.id, ...doc.data() } as BookingDocument)));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const getActualDuration = (start: any, end: any) => {
    if (!start || !end) return "-";
    const s = start.seconds || start._seconds;
    const e = end.seconds || end._seconds;
    if (!s || !e) return "-";
    const diff = Math.floor((e - s) / 60);
    return diff > 0 ? `${diff}m` : "0m";
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory();
  };

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">Booking History</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>Admin Console</span>
            <span>›</span>
            <span>Booking History</span>
          </div>
        </div>
      </div>

      {/* Student Booking History Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-6 border-b border-border bg-card flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-lg font-medium text-card-foreground">All Booking History</h3>
            <p className="text-[13px] text-muted-foreground">Historical records of student bookings</p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button 
              onClick={() => {
                const data = history.map(h => ({
                  "Booking ID": h.bookingId,
                  "Student Name": h.userFullName || "-",
                  "Student Matrix No": h.userMatrixNo ? h.userMatrixNo.toUpperCase() : "-",
                  "Student Practicum": h.practicum || "-",
                  "Assigned Bike ID": h.bikeId || "-",
                  "Booking Type": formatBookingType(h.bookingType),
                  "Booking Duration (Min)": h.duration || 0,
                  "Reschedule Count": h.rescheduleCount || 0,
                  "Booking Status": h.status ? h.status.toUpperCase() : "-",
                  "Created Time": formatTimestamp(h.createdAt),
                  "Scheduled Start Time": formatTimestamp(h.startTime),
                  "Collected Time": formatTimestamp(h.collectedAt),
                  "Scheduled End Time": formatTimestamp(h.endTime),
                  "Returned Time": formatTimestamp(h.returnedAt),
                  "Returned Late?": formatBoolean(h.isLate),
                  "Late Duration (Min)": h.lateReturnMinutes !== null ? h.lateReturnMinutes : 0,
                  "Bike Condition on Return": formatCondition(h.bikeConditionOnReturn),
                  "Bike Swaps History": formatBikeHistory(h.bikeHistory),
                  "Cancellation Time": formatTimestamp(h.cancelledAt),
                  "Cancelled By": formatCancelledBy(h.cancelledBy),
                  "Number of Linked Reports": getReportsCount(h.linkedReportIds),
                }));
                if (data.length === 0) return;
                const ws = XLSX.utils.json_to_sheet(data);
                const csv = XLSX.utils.sheet_to_csv(ws);
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `booking_history_${format(new Date(), "yyyyMMdd")}.csv`;
                link.click();
              }}
              disabled={history.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-background border border-border hover:border-primary/50 text-foreground rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button 
              onClick={() => {
                const data = history.map(h => ({
                  "Booking ID": h.bookingId,
                  "Student Name": h.userFullName || "-",
                  "Student Matrix No": h.userMatrixNo ? h.userMatrixNo.toUpperCase() : "-",
                  "Student Practicum": h.practicum || "-",
                  "Assigned Bike ID": h.bikeId || "-",
                  "Booking Type": formatBookingType(h.bookingType),
                  "Booking Duration (Min)": h.duration || 0,
                  "Reschedule Count": h.rescheduleCount || 0,
                  "Booking Status": h.status ? h.status.toUpperCase() : "-",
                  "Created Time": formatTimestamp(h.createdAt),
                  "Scheduled Start Time": formatTimestamp(h.startTime),
                  "Collected Time": formatTimestamp(h.collectedAt),
                  "Scheduled End Time": formatTimestamp(h.endTime),
                  "Returned Time": formatTimestamp(h.returnedAt),
                  "Returned Late?": formatBoolean(h.isLate),
                  "Late Duration (Min)": h.lateReturnMinutes !== null ? h.lateReturnMinutes : 0,
                  "Bike Condition on Return": formatCondition(h.bikeConditionOnReturn),
                  "Bike Swaps History": formatBikeHistory(h.bikeHistory),
                  "Cancellation Time": formatTimestamp(h.cancelledAt),
                  "Cancelled By": formatCancelledBy(h.cancelledBy),
                  "Number of Linked Reports": getReportsCount(h.linkedReportIds),
                }));
                if (data.length === 0) return;
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Booking History");
                XLSX.writeFile(wb, `booking_history_${format(new Date(), "yyyyMMdd")}.xlsx`);
              }}
              disabled={history.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-background border border-border hover:border-primary/50 text-foreground rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX
            </button>
          </div>
        </div>

        <div className="p-6 border-b border-border">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Search</label>
              <div className="flex flex-col md:flex-row gap-2">
                <select 
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value as any)}
                  className="w-full md:w-auto px-3 py-2 bg-muted border border-border rounded-lg text-sm text-card-foreground focus:outline-none"
                >
                  <option value="userFullName">By Name</option>
                  <option value="userMatrixNo">By Matrix</option>
                  <option value="bookingId">By Booking ID</option>
                </select>
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Enter prefix to search..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-card-foreground focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Date Range</label>
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 bg-muted border border-border rounded-lg text-sm text-card-foreground focus:outline-none"
                />
                <span className="text-muted-foreground text-center">to</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 bg-muted border border-border rounded-lg text-sm text-card-foreground focus:outline-none"
                />
              </div>
            </div>

            <button type="submit" className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-all h-[38px]">
              Fetch
            </button>
          </form>
        </div>
        
        {loading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No records found matching criteria.</div>
        ) : (
          <div>
            <div className="px-6 py-2 bg-muted/20 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              CLICK ON COLUMN HEADERS TO SORT RECORDS
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                <tr>
                  <th onClick={() => handleSort("bookingId")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Booking ID {sortKey === "bookingId" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th onClick={() => handleSort("userFullName")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Name {sortKey === "userFullName" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th onClick={() => handleSort("userMatrixNo")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Matrix No {sortKey === "userMatrixNo" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th onClick={() => handleSort("bikeId")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Bike ID {sortKey === "bikeId" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th onClick={() => handleSort("createdAt")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Session {sortKey === "createdAt" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th onClick={() => handleSort("status")} className="px-6 py-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-center gap-1">
                      Status {sortKey === "status" && (sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      Note
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedHistory.map((item) => (
                  <tr 
                    key={item.bookingId}
                    className="hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap text-card-foreground"
                    onClick={() => setSelectedBooking(item)}
                  >
                    <td className="px-6 py-4 text-center text-[13px]">
                      <span className="font-mono text-primary font-bold">
                        {(() => {
                          const parts = item.bookingId.split('-');
                          return parts.length >= 3 
                            ? `${parts[1].slice(-1)}-${parts[2]}` 
                            : item.bookingId;
                        })()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-[13px]">
                      <div className="truncate max-w-[180px] mx-auto" title={item.userFullName}>
                        {item.userFullName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-[13px] uppercase">{item.userMatrixNo}</td>
                    <td className="px-6 py-4 text-center text-[13px]">
                      {item.bikeId ? <span className="font-mono font-bold text-primary dark:text-blue-500">{item.bikeId}</span> : "-"}
                    </td>
                    <td className="px-6 py-4 text-center text-[13px]">
                      {item.startTime ? format((item.startTime as any).toDate(), "MMM dd, hh:mm a") : "-"}
                    </td>
                    <td className="px-6 py-4 text-center text-[13px]">
                      <div className="flex justify-center">
                        <StatusBadge status={item.status} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-[13px]">
                      <div className="flex justify-center">
                        {(() => {
                          const isLate = item.isLate || item.status === "late";
                          const isFlagged = item.bikeConditionOnReturn === "flagged";

                          if (isLate && isFlagged) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-950/30 text-destructive dark:text-red-400 border border-red-200 dark:border-red-900/50">
                                Late & Damaged
                              </span>
                            );
                          }
                          if (isLate) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                                Late Return
                              </span>
                            );
                          }
                          if (isFlagged) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-950/30 text-destructive dark:text-red-400 border border-red-200 dark:border-red-900/50">
                                Damaged
                              </span>
                            );
                          }
                          return <span className="text-muted-foreground text-xs font-normal">-</span>;
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            {sortedHistory.length > 0 && (
              <div className="flex items-center justify-between px-4 md:px-6 py-4 border-t border-border bg-card">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground select-none">
                  <Users className="h-4 w-4 text-muted-foreground/75" />
                  <span>
                    Showing records <span className="font-semibold text-card-foreground">{((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sortedHistory.length)}</span>
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
        )}
      </div>

      {/* ─── Detailed Booking History Modal ─── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => setSelectedBooking(null)}
          />

          {/* Modal Container */}
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[500px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 font-sans max-h-[85vh] md:max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">Booking Details</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-foreground dark:text-white uppercase tracking-widest">
                    ID: {(() => {
                      const parts = selectedBooking.bookingId.split('-');
                      return parts.length >= 3 
                        ? `${parts[1].slice(-1)}-${parts[2]}` 
                        : selectedBooking.bookingId;
                    })()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedBooking.status} />
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                >
                  <XCircle className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              
              {/* Top Row Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary dark:text-blue-400 text-[11px] font-bold">
                  <Bike className="w-3.5 h-3.5" />
                  <span>Bike: {selectedBooking.bikeId || "UNASSIGNED"}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duration: {selectedBooking.duration} mins</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold capitalize">
                  <Info className="w-3.5 h-3.5" />
                  <span>Type: {selectedBooking.bookingType === "ondemand" ? "On-Demand" : selectedBooking.bookingType}</span>
                </div>
              </div>

              {/* Rider Profile section */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-primary" /> Rider Profile
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/20 dark:bg-muted/5 p-3.5 rounded-xl border border-border/40 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Rider Name</span>
                    <span className="font-bold text-foreground line-clamp-1">{selectedBooking.userFullName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Matrix No</span>
                    <span className="font-bold text-foreground font-mono uppercase">{selectedBooking.userMatrixNo || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">Practicum</span>
                    <span className="font-semibold text-primary dark:text-blue-400 uppercase">{selectedBooking.practicum || "GEN"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[9px] uppercase tracking-wider block mb-0.5">User UID</span>
                    <span className="font-mono text-muted-foreground block truncate" title={selectedBooking.userId}>
                      {selectedBooking.userId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit Timeline section */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <HistoryIcon className="h-3.5 w-3.5 text-primary" /> Journey Timeline & Metrics
                </h4>
                <div className="relative pl-5 space-y-3.5 before:absolute before:left-[8px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border/60">
                  {/* Created */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-slate-400 ring-2 ring-slate-400/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Booking Created</span>
                      <span className="font-medium text-foreground">
                        {selectedBooking.createdAt ? format((selectedBooking.createdAt as any).toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Scheduled Start */}
                  <div className="relative">
                    <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-primary ring-2 ring-primary/20" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Start Window</span>
                      <span className="font-medium text-foreground">
                        {selectedBooking.startTime ? format((selectedBooking.startTime as any).toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Collected At */}
                  {selectedBooking.collectedAt && (
                    <div className="relative">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-blue-500 ring-2 ring-blue-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Picked Up</span>
                        <span className="font-semibold text-primary">
                          {format((selectedBooking.collectedAt as any).toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Returned At */}
                  {selectedBooking.returnedAt && (
                    <div className="relative">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-green-500 ring-2 ring-green-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Bike Returned</span>
                        <span className={`font-semibold ${selectedBooking.isLate ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                          {format((selectedBooking.returnedAt as any).toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Cancelled At */}
                  {selectedBooking.cancelledAt && (
                    <div className="relative">
                      <div className="absolute -left-[15px] top-1.5 w-[6px] h-[6px] rounded-full border border-card bg-red-500 ring-2 ring-red-500/20" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-red-500 font-bold">Session Cancelled</span>
                        <span className="font-semibold text-red-500">
                          {format((selectedBooking.cancelledAt as any).toDate(), "dd/MM/yyyy HH:mm:ss")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actual Duration vs Allowed Duration */}
                <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-lg border border-border/30 text-xs">
                  <span className="text-muted-foreground">Actual Ride Duration:</span>
                  <span className={`font-bold ${selectedBooking.isLate ? 'text-destructive' : 'text-foreground'}`}>
                    {getActualDuration(selectedBooking.collectedAt || selectedBooking.startTime, selectedBooking.returnedAt)}
                  </span>
                </div>

                {/* System Violation Warning */}
                {selectedBooking.isLate && (
                  <div className="flex items-center gap-2 bg-red-500/10 text-red-500 p-3 rounded-xl border border-red-500/20">
                    <AlertCircle className="h-4 w-4 shrink-0 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Late Return Violation: {selectedBooking.lateReturnMinutes || "0"} Minutes Overtime
                    </span>
                  </div>
                )}
              </div>

              {/* System Audit Details */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Settings className="h-3.5 w-3.5 text-primary" /> Technical Audit Logs
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Return Bike Condition</span>
                    <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${selectedBooking.bikeConditionOnReturn === 'good' ? 'bg-green-500/10 text-green-500' : selectedBooking.bikeConditionOnReturn === 'flagged' ? 'bg-orange-500/10 text-orange-500' : 'bg-muted text-muted-foreground'}`}>
                      {selectedBooking.bikeConditionOnReturn || "N/A"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Inspection Photo</span>
                    {selectedBooking.returnPhotoPath ? (
                      <button 
                        onClick={() => handleViewPhoto(selectedBooking.returnPhotoPath!)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded text-[10px] font-bold uppercase transition-colors"
                      >
                        <ImageIcon className="w-3 h-3" /> View Photo
                      </button>
                    ) : (
                      <span className="font-mono text-muted-foreground">None</span>
                    )}
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Reschedule Count</span>
                    <span className="font-semibold text-foreground">{selectedBooking.rescheduleCount || 0} times</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Mid-Ride Bike Swaps</span>
                    <span className="font-mono text-foreground font-medium">
                      {selectedBooking.bikeHistory && selectedBooking.bikeHistory.length > 0 
                        ? selectedBooking.bikeHistory.join(" → ") 
                        : "None"
                      }
                    </span>
                  </div>

                  <div className={`flex ${selectedBooking.linkedReportIds && selectedBooking.linkedReportIds.length > 0 ? "flex-col gap-1.5" : "justify-between items-center"} py-2 border-b border-border/30`}>
                    <span className="text-muted-foreground text-xs">Linked Incident Reports</span>
                    {selectedBooking.linkedReportIds && selectedBooking.linkedReportIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedBooking.linkedReportIds.map(reportId => (
                          <button
                            key={reportId}
                            onClick={() => handleViewReport(reportId)}
                            disabled={loadingReportId === reportId}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded text-[11px] font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingReportId === reportId ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            {reportId}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono text-muted-foreground">None</span>
                    )}
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Class Booking Link ID</span>
                    <span className={selectedBooking.classBookingId ? "font-mono text-primary font-bold" : "font-mono text-muted-foreground"}>
                      {selectedBooking.classBookingId || "None"}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Cancellation Authority</span>
                    {selectedBooking.cancelledBy ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                        <ShieldAlert className="h-3 w-3" /> {selectedBooking.cancelledBy}
                      </span>
                    ) : (
                      <span className="font-mono text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-muted/40 dark:bg-muted/10 border-t border-border/60 flex flex-row items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => copyIdToClipboard(selectedBooking.bookingId)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary dark:text-blue-500 hover:bg-primary/10 rounded-xl transition-all active:scale-95 hover:cursor-pointer justify-center"
              >
                {copiedId === selectedBooking.bookingId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 animate-in zoom-in" />
                    <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full ID</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => setSelectedBooking(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 hover:cursor-pointer shadow-md shadow-primary/15"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detailed Report Modal ─── */}
      {selectedReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => setSelectedReport(null)}
          />
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 font-sans max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">Incident Report</h3>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-0.5">
                  ID: {selectedReport.reportId}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 cursor-pointer"
              >
                <XCircle className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              <div className="flex flex-wrap gap-2 mb-2">
                <div className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                  Type: {selectedReport.type.replace('_', ' ')}
                </div>
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  selectedReport.severity === 'critical' ? 'bg-red-500/10 text-red-500' :
                  selectedReport.severity === 'high' ? 'bg-orange-500/10 text-orange-500' :
                  selectedReport.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-600' :
                  'bg-green-500/10 text-green-500'
                }`}>
                  Severity: {selectedReport.severity}
                </div>
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  selectedReport.status === 'resolved' ? 'bg-green-500/10 text-green-500' :
                  selectedReport.status === 'dismissed' ? 'bg-slate-500/10 text-slate-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  Status: {selectedReport.status}
                </div>
              </div>
              
              <div className="space-y-2 text-xs">
                {Object.entries(selectedReport.payload || {}).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;
                  
                  if (key.toLowerCase().includes('photo') && typeof value === 'string') {
                    return (
                      <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/path/gi, '').replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <button 
                          onClick={() => handleViewPhoto(value)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded text-[10px] font-bold uppercase transition-colors"
                        >
                          <ImageIcon className="w-3 h-3" /> View Photo
                        </button>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={key} className="flex justify-between py-1.5 border-b border-border/30 gap-4">
                      <span className="text-muted-foreground capitalize whitespace-nowrap">
                        {key.replace(/path/gi, '').replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="font-semibold text-foreground text-right break-words">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 bg-muted/40 border-t border-border/50 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-6 py-2 bg-primary text-white font-bold text-[10px] uppercase tracking-wider rounded-full shadow-md hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Photo Viewer Modal ─── */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity cursor-pointer" 
            onClick={() => setViewingPhotoUrl(null)}
          />
          <div className="relative z-10 max-w-4xl w-full flex flex-col items-center">
            <div className="w-full flex justify-end mb-4">
              <button
                onClick={() => setViewingPhotoUrl(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-black/50 p-2">
              <img 
                src={viewingPhotoUrl} 
                alt="Report Evidence" 
                className="max-w-full max-h-[80vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
