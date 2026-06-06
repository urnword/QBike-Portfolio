"use client";

import React, { useState, useEffect } from "react";
import { Upload, Plus, Check, Copy, X, ShieldCheck, FileText, Search, Info, Trash2, ChevronLeft, ChevronRight, Users, Sparkles, ExternalLink, ShieldOff } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { useAuth } from "@/lib/hooks/useAuth";
import { db } from "@/lib/firebase/client";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { UserDocument, VerificationUpload, VerificationListEntry } from "@/types";
import { uploadVerificationCSV, deleteVerificationUpload, addManualVerification, processPendingVerification, searchVerificationEntry, resetVerificationClaim, bulkProcessVerifications, unverifyStudentByMatrix } from "@/actions/admin";
import { usePracticums } from "@/lib/hooks/usePracticums";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminVerificationPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { practicums } = usePracticums();

  const [pending, setPending] = useState<UserDocument[]>([]);
  const [uploads, setUploads] = useState<VerificationUpload[]>([]);

  const [activePendingTab, setActivePendingTab] = useState<"student" | "staff">("student");
  const [studentPage, setStudentPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  const itemsPerPage = 10;

  const [csvLoading, setCsvLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);

  const [manualMatrix, setManualMatrix] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPracticum, setManualPracticum] = useState("");

  const [searchMatrix, setSearchMatrix] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [unverifyMatrix, setUnverifyMatrix] = useState("");
  const [unverifyLoading, setUnverifyLoading] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  useEffect(() => {
    if (!user) return;

    // Fetch Pending Verifications
    const qPending = query(collection(db, "users"), where("verificationStatus", "==", "pending"));
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPending(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserDocument)));
    });

    // Fetch Verification Uploads
    const qUploads = query(collection(db, "verificationUploads"));
    const unsubUploads = onSnapshot(qUploads, (snap) => {
      setUploads(snap.docs.map(doc => ({ uploadId: doc.id, ...doc.data() } as VerificationUpload)));
    });

    return () => {
      unsubPending();
      unsubUploads();
    };
  }, [user]);

  // Prevent window close or navigation during CSV upload
  useEffect(() => {
    if (!csvLoading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "An upload is currently in progress. If you close this page now, the upload may fail or be cancelled midway.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [csvLoading]);

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvData = event.target?.result as string;
        const lines = csvData.split("\n").filter(l => l.trim() !== "");

        const parsedLines = lines.map(line => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        }).filter(r => r.length > 0 && r.some(c => c !== ""));

        if (parsedLines.length === 0) {
          alert("The CSV file is empty.");
          return;
        }

        // Auto-detect columns
        const firstRow = parsedLines[0];
        const headersLower = firstRow.map(h => h.toLowerCase());
        
        let matrixIdx = headersLower.findIndex(h => h.includes("matrix") || h.includes("matric") || h.includes("number") || h.includes("no.") || h.includes("id") || h.includes("matrixnumber"));
        let nameIdx = headersLower.findIndex(h => h.includes("name") || h.includes("display") || h.includes("nama") || h.includes("full"));
        let practicumIdx = headersLower.findIndex(h => h.includes("practicum") || h.includes("class") || h.includes("dept") || h.includes("code") || h.includes("unit") || h.includes("kumpulan"));

        const hasHeader = (matrixIdx !== -1 || nameIdx !== -1 || practicumIdx !== -1);
        
        // If detection fails or we don't have distinct headers, fallback to intelligent value scoring
        if (!hasHeader || matrixIdx === nameIdx || matrixIdx === practicumIdx || nameIdx === practicumIdx || matrixIdx === -1 || nameIdx === -1) {
          const numCols = firstRow.length;
          const scores = Array.from({ length: numCols }, () => ({ matrix: 0, name: 0, practicum: 0 }));
          const rowsToSample = parsedLines.slice(0, 10);

          for (const row of rowsToSample) {
            row.forEach((val, idx) => {
              if (idx >= numCols) return;
              const clean = val.trim();
              if (!clean) return;

              // Matrix scoring: starts with letter followed by digits, or pure numbers (4-15 chars)
              if (/^[a-zA-Z]\d{2,15}$/.test(clean)) {
                scores[idx].matrix += 10;
              } else if (/^\d{4,12}$/.test(clean)) {
                scores[idx].matrix += 5;
              }

              // Practicum scoring: e.g. S1, F3, MS12, alphanumeric and no spaces
              if (/^[a-zA-Z]+\d+$/.test(clean) && clean.length >= 2 && clean.length <= 6) {
                scores[idx].practicum += 10;
              } else if (clean.length >= 2 && clean.length <= 5 && !/\s/.test(clean)) {
                scores[idx].practicum += 6;
              }

              // Name scoring: longer, contains spaces, alphabetical
              if (clean.length >= 6 && /\s/.test(clean) && !/\d/.test(clean)) {
                scores[idx].name += 10;
              } else if (clean.length >= 5 && !/\d/.test(clean)) {
                scores[idx].name += 5;
              }
            });
          }

          const assigned = new Set<number>();
          
          let maxMatrix = -1;
          let bestMatrix = -1;
          for (let i = 0; i < numCols; i++) {
            if (scores[i].matrix > maxMatrix) {
              maxMatrix = scores[i].matrix;
              bestMatrix = i;
            }
          }
          if (bestMatrix !== -1 && maxMatrix > 0) {
            matrixIdx = bestMatrix;
            assigned.add(matrixIdx);
          }

          let maxPracticum = -1;
          let bestPracticum = -1;
          for (let i = 0; i < numCols; i++) {
            if (assigned.has(i)) continue;
            if (scores[i].practicum > maxPracticum) {
              maxPracticum = scores[i].practicum;
              bestPracticum = i;
            }
          }
          if (bestPracticum !== -1 && maxPracticum > 0) {
            practicumIdx = bestPracticum;
            assigned.add(practicumIdx);
          }

          let maxName = -1;
          let bestName = -1;
          for (let i = 0; i < numCols; i++) {
            if (assigned.has(i)) continue;
            if (scores[i].name > maxName) {
              maxName = scores[i].name;
              bestName = i;
            }
          }
          if (bestName !== -1 && maxName > 0) {
            nameIdx = bestName;
            assigned.add(nameIdx);
          }
        }

        // Validate detection results
        if (matrixIdx === -1 || nameIdx === -1) {
          throw new Error("Could not automatically detect Matrix Number and Student Name columns. Please ensure your CSV contains these fields.");
        }

        const rowsToProcess = hasHeader ? parsedLines.slice(1) : parsedLines;
        const validatedRows = [];

        for (let i = 0; i < rowsToProcess.length; i++) {
          const row = rowsToProcess[i];
          const rawMatrix = row[matrixIdx] || "";
          const rawName = row[nameIdx] || "";
          const rawPracticum = practicumIdx !== -1 ? (row[practicumIdx] || "") : "";

          const matrixClean = rawMatrix.replace(/\s+/g, '').trim().toUpperCase();
          const nameClean = rawName.replace(/\s+/g, ' ').trim();
          const practicumClean = rawPracticum.replace(/\s+/g, '').trim().toUpperCase();

          if (!matrixClean && !nameClean) {
            continue; // Skip blank lines gracefully
          }

          // Strict validation checks to reject malformed or dumb data
          if (!/^[A-Z0-9-]{3,20}$/.test(matrixClean)) {
            throw new Error(`Row ${i + (hasHeader ? 2 : 1)} contains an invalid Matrix Number format: "${rawMatrix}". Must be 3-20 alphanumeric characters.`);
          }

          if (nameClean.length < 3) {
            throw new Error(`Row ${i + (hasHeader ? 2 : 1)} contains an invalid Student Name: "${rawName}". Name must be at least 3 characters long.`);
          }

          if (practicumClean && !/^[A-Z0-9-]{1,10}$/.test(practicumClean)) {
            throw new Error(`Row ${i + (hasHeader ? 2 : 1)} contains an invalid Practicum code: "${rawPracticum}". Code must be 1-10 alphanumeric characters.`);
          }

          validatedRows.push({
            matrixNumber: matrixClean,
            displayName: nameClean,
            practicumCode: practicumClean || ""
          });
        }

        if (validatedRows.length === 0) {
          throw new Error("No valid student rows found in the CSV file.");
        }

        const res = await uploadVerificationCSV(validatedRows, file.name);
        alert(`Successfully uploaded! Added: ${res.added}, Skipped (Duplicates): ${res.skipped}`);
      } catch (err: any) {
        console.error(err);
        alert("Failed to upload CSV: " + err.message);
      } finally {
        setCsvLoading(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMatrix || !manualName) return;

    setManualLoading(true);
    try {
      await addManualVerification(manualMatrix, manualName, manualPracticum);
      alert("Added successfully.");
      setManualMatrix("");
      setManualName("");
      setManualPracticum("");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to add record.");
    } finally {
      setManualLoading(false);
    }
  };

  const handleSearchReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchMatrix) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await searchVerificationEntry(searchMatrix);
      setSearchResult(res);
      if (!res) alert("No record found for this matrix number.");
    } catch (err) {
      console.error(err);
      alert("Search failed.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleResetClaim = async () => {
    if (!searchResult) return;
    if (!window.confirm("Are you sure you want to clear this claim? This will reset 'isUsed' and 'claimedBy'.")) return;

    try {
      await resetVerificationClaim(searchResult.id);
      alert("Claim cleared successfully.");
      setSearchResult({ ...searchResult, isUsed: false, claimedBy: null });
    } catch (err) {
      console.error(err);
      alert("Failed to reset claim.");
    }
  };

  const handleUnverifyStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unverifyMatrix) return;

    if (!window.confirm(`Are you sure you want to unverify student with matrix number "${unverifyMatrix.toUpperCase()}"? This will set their verification status to "unverified".`)) {
      return;
    }

    setUnverifyLoading(true);
    try {
      await unverifyStudentByMatrix(unverifyMatrix);
      alert("Student unverified successfully.");
      setUnverifyMatrix("");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to unverify student.");
    } finally {
      setUnverifyLoading(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    if (!window.confirm("Are you sure you want to delete this upload? Unclaimed entries will be removed.")) return;
    try {
      const res = await deleteVerificationUpload(uploadId);
      if (!res.success) {
        alert(res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete upload.");
    }
  };

  const handlePendingAction = async (uid: string, action: "verified" | "rejected") => {
    let reason = "";
    if (action === "rejected") {
      const r = window.prompt("Reason for rejection:");
      if (!r) return;
      reason = r;
    } else {
      if (!window.confirm("Approve this student?")) return;
    }

    try {
      await processPendingVerification(uid, action, reason);
    } catch (err) {
      console.error(err);
      alert("Action failed.");
    }
  };

  const handleBulkAction = async (action: "verified" | "rejected") => {
    const pendingStudents = pending.filter(p => p.role !== "staff" && p.role !== "admin");
    const pendingStaff = pending.filter(p => p.role === "staff");
    const listToProcess = activePendingTab === "student" ? pendingStudents : pendingStaff;
    if (listToProcess.length === 0) return;

    let reason = "";
    const roleLabel = activePendingTab === "student" ? "students" : "staff members";
    if (action === "rejected") {
      const r = window.prompt(`Are you sure you want to REJECT ALL (${listToProcess.length}) pending ${roleLabel}? Enter reason:`);
      if (!r) return;
      reason = r;
    } else {
      if (!window.confirm(`Are you sure you want to APPROVE ALL (${listToProcess.length}) pending ${roleLabel}?`)) return;
    }

    setManualLoading(true); // Reuse loading state or add new one
    try {
      const uids = listToProcess.map(p => p.uid);
      await bulkProcessVerifications(uids, action, reason);
      alert(`Successfully processed ${listToProcess.length} ${roleLabel}.`);
    } catch (err) {
      console.error(err);
      alert("Bulk action failed.");
    } finally {
      setManualLoading(false);
    }
  };

  // Split pending queue
  const pendingStudents = pending.filter(p => p.role !== "staff" && p.role !== "admin");
  const pendingStaff = pending.filter(p => p.role === "staff");

  // Paginated Students
  const totalStudentPages = Math.ceil(pendingStudents.length / itemsPerPage);
  const paginatedStudents = pendingStudents.slice((studentPage - 1) * itemsPerPage, studentPage * itemsPerPage);

  // Paginated Staff
  const totalStaffPages = Math.ceil(pendingStaff.length / itemsPerPage);
  const paginatedStaff = pendingStaff.slice((staffPage - 1) * itemsPerPage, staffPage * itemsPerPage);

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">{t("admin.verification.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.verification.title")}</span>
          </div>
        </div>
      </div>

      {/* Pending Verifications Table - MOVED TO TOP */}
      <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-foreground">{t("admin.verification.pendingQueue")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("admin.verification.pendingQueueDesc")}</p>
          </div>
          {pending.length > 0 && (
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <button
                onClick={() => handleBulkAction("verified")}
                className="w-full md:w-auto px-6 py-2 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800/50 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
              >
                {t("admin.verification.approveAll")} {activePendingTab === "student" ? `${t("admin.verification.students")} (${pendingStudents.length})` : `${t("admin.verification.staff")} (${pendingStaff.length})`}
              </button>
              <button
                onClick={() => handleBulkAction("rejected")}
                className="w-full md:w-auto px-6 py-2 bg-destructive/10 dark:bg-destructive/20 text-destructive dark:text-red-400 hover:bg-destructive/20 dark:hover:bg-destructive/30 border border-destructive/20 dark:border-destructive/40 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
              >
                {t("admin.verification.rejectAll")} {activePendingTab === "student" ? `${t("admin.verification.students")} (${pendingStudents.length})` : `${t("admin.verification.staff")} (${pendingStaff.length})`}
              </button>
            </div>
          )}
        </div>

        {/* Tab Selector */}
        <div className="flex w-full border-b border-border bg-muted/10">
          <button
            onClick={() => { setActivePendingTab("student"); setStudentPage(1); }}
            className={`flex-1 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activePendingTab === "student"
              ? "border-primary text-primary bg-background border-b-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
          >
            {t("admin.verification.students")} ({pendingStudents.length})
          </button>
          <button
            onClick={() => { setActivePendingTab("staff"); setStaffPage(1); }}
            className={`flex-1 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activePendingTab === "staff"
              ? "border-primary text-primary bg-background border-b-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
          >
            {t("admin.verification.staff")} ({pendingStaff.length})
          </button>
        </div>

        {activePendingTab === "student" ? (
          pendingStudents.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
              {t("admin.verification.queueClearStudent")}
            </div>
          ) : (
            <>
              <div className="px-6 py-2 bg-muted/20 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                {t("admin.verification.manualReviewReqStudent")} {pendingStudents.length}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-[11px] font-bold uppercase tracking-wider border-b border-border">
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colStudentName")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colMatrix")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colPracticum")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colPhone")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedStudents.map((p) => (
                      <tr key={p.uid} className="hover:bg-muted/30 dark:hover:bg-muted/10 transition-colors border-b border-border/50">
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground whitespace-nowrap">{p.displayName}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground uppercase whitespace-nowrap">{p.matrixNumber}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground uppercase whitespace-nowrap">{p.practicum || "-"}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground whitespace-nowrap">{p.phoneNumber || "-"}</td>
                        <td className="px-8 py-4 whitespace-nowrap">
                          <div className="flex justify-center gap-3">
                            <button onClick={() => handlePendingAction(p.uid, "verified")} className="h-9 w-9 bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40 rounded-full flex items-center justify-center transition-all shadow-sm border border-green-200 dark:border-green-800/50 active:scale-90 cursor-pointer" title="Approve">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => handlePendingAction(p.uid, "rejected")} className="h-9 w-9 bg-destructive/10 dark:bg-destructive/20 text-destructive dark:text-red-400 hover:bg-destructive/20 dark:hover:bg-destructive/30 rounded-full flex items-center justify-center transition-all shadow-sm border border-destructive/20 dark:border-destructive/40 active:scale-90 cursor-pointer" title="Reject">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-border flex justify-between items-center bg-muted/20">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  {t("admin.verification.showingRecords")} {((studentPage - 1) * itemsPerPage) + 1} - {Math.min(studentPage * itemsPerPage, pendingStudents.length)} / {pendingStudents.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                    disabled={studentPage === 1}
                    className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))}
                    disabled={studentPage >= totalStudentPages}
                    className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )
        ) : (
          pendingStaff.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
              {t("admin.verification.queueClearStaff")}
            </div>
          ) : (
            <>
              <div className="px-6 py-2 bg-muted/20 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                {t("admin.verification.manualReviewReqStaff")} {pendingStaff.length}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-[11px] font-bold uppercase tracking-wider border-b border-border">
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colStaffName")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colEmail")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colUnit")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colPhone")}</th>
                      <th className="px-8 py-4 whitespace-nowrap">{t("admin.verification.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedStaff.map((p) => (
                      <tr key={p.uid} className="hover:bg-muted/30 dark:hover:bg-muted/10 transition-colors border-b border-border/50">
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground whitespace-nowrap">{p.displayName}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground whitespace-nowrap">{p.email || "-"}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground uppercase whitespace-nowrap">{p.practicum || "-"}</td>
                        <td className="px-8 py-4 text-[13px] font-normal text-foreground whitespace-nowrap">{p.phoneNumber || "-"}</td>
                        <td className="px-8 py-4 whitespace-nowrap">
                          <div className="flex justify-center gap-3">
                            <button onClick={() => handlePendingAction(p.uid, "verified")} className="h-9 w-9 bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40 rounded-full flex items-center justify-center transition-all shadow-sm border border-green-200 dark:border-green-800/50 active:scale-90 cursor-pointer" title="Approve">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => handlePendingAction(p.uid, "rejected")} className="h-9 w-9 bg-destructive/10 dark:bg-destructive/20 text-destructive dark:text-red-400 hover:bg-destructive/20 dark:hover:bg-destructive/30 rounded-full flex items-center justify-center transition-all shadow-sm border border-destructive/20 dark:border-destructive/40 active:scale-90 cursor-pointer" title="Reject">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-border flex justify-between items-center bg-muted/20">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  {t("admin.verification.showingRecords")} {((staffPage - 1) * itemsPerPage) + 1} - {Math.min(staffPage * itemsPerPage, pendingStaff.length)} / {pendingStaff.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStaffPage(p => Math.max(1, p - 1))}
                    disabled={staffPage === 1}
                    className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setStaffPage(p => Math.min(totalStaffPages, p + 1))}
                    disabled={staffPage >= totalStaffPages}
                    className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>

      {/* Bulk CSV Register */}
      <div className="w-full bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> {t("admin.verification.bulkCsv")}
          </h3>
          <p className="text-[13px] text-muted-foreground">{t("admin.verification.bulkCsvDesc")}</p>
        </div>
        <div className="p-8">
          <label className={`border-2 border-dashed border-input rounded-xl p-10 text-center transition-all cursor-pointer group block ${csvLoading ? 'opacity-50 pointer-events-none' : 'bg-muted/50 dark:bg-muted/10 hover:bg-muted dark:hover:bg-muted/20'}`}>
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-border group-hover:scale-110 transition-transform">
              {csvLoading ? <LoadingSpinner /> : <FileText className="h-8 w-8 text-primary" />}
            </div>
            <h4 className="text-sm font-bold text-foreground mb-1">{csvLoading ? t("admin.verification.processing") : t("admin.verification.clickDragCsv")}</h4>
            <p className="text-[12px] text-muted-foreground">{t("admin.verification.csvFormat")}</p>
          </label>
          <div className="mt-6 flex items-start gap-3 bg-blue-500/10 dark:bg-blue-500/20 p-4 rounded-xl border border-blue-500/20 dark:border-blue-500/30">
            <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-[12px] font-bold text-foreground flex items-center gap-1.5">
                {t("admin.verification.csvHelper")}
              </h5>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("admin.verification.csvHelperDesc")}
              </p>
              <a
                href="https://gemini.google.com/gem/1E06TpkLzkIzHSkHGz8hkPk36g3Pz01Cc?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline transition-all"
              >
                {t("admin.verification.launchGemini")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Uploads List */}
          {uploads.length > 0 && (
            <div className="mt-6">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("admin.verification.recentUploads")}</h4>
              <div className="space-y-2">
                {uploads.map(up => (
                  <div key={up.uploadId} className="flex items-center justify-between bg-background border border-border rounded-lg p-3">
                    <div>
                      <p className="text-sm font-bold text-foreground">{up.label}</p>
                      <p className="text-[11px] text-muted-foreground">{t("admin.verification.totalEntries")} {up.totalEntries} • {up.uploadedAt ? new Date(up.uploadedAt.seconds * 1000).toLocaleDateString() : t("admin.verification.justNow")}</p>
                    </div>
                    <button onClick={() => handleDeleteUpload(up.uploadId)} className="p-2 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded-md">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Add - MOVED BELOW & HORIZONTAL */}
      <div className="w-full bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Plus className="h-5 w-5 text-secondary" /> {t("admin.verification.manualReg")}
          </h3>
          <p className="text-[13px] text-muted-foreground">{t("admin.verification.manualRegDesc")}</p>
        </div>
        <form onSubmit={handleManualAdd} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("admin.verification.matrixNumUpper")}</label>
              <input
                type="text"
                value={manualMatrix}
                onChange={e => setManualMatrix(e.target.value)}
                required
                placeholder="e.g., P20230001"
                className="w-full px-4 py-2.5 bg-background dark:bg-muted/20 border border-input rounded-md text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all uppercase"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("admin.verification.fullNameUpper")}</label>
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                required
                placeholder="e.g., AHMAD BIN ALI"
                className="w-full px-4 py-2.5 bg-background dark:bg-muted/20 border border-input rounded-md text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all uppercase"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("admin.verification.practicumUpper")}</label>
              <select
                value={manualPracticum}
                onChange={e => setManualPracticum(e.target.value)}
                className="w-full px-4 py-2.5 bg-background dark:bg-muted/20 border border-input rounded-md text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="">{t("admin.verification.noPracticum")}</option>
                {practicums.map(p => (
                  <option key={p.code} value={p.code}>{p.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={manualLoading}
              className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-secondary-foreground py-3.5 rounded-md font-bold text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              {manualLoading ? t("admin.verification.processing") : t("admin.verification.regRecord")}
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Unverify Student Tool */}
        <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/20">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" /> {t("admin.verification.unverifyUtility")}
            </h3>
            <p className="text-[13px] text-muted-foreground">{t("admin.verification.unverifyUtilityDesc")}</p>
          </div>
          <div className="p-8">
            <form onSubmit={handleUnverifyStudent} className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <ShieldOff className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={unverifyMatrix}
                  onChange={e => setUnverifyMatrix(e.target.value)}
                  placeholder={t("admin.verification.studentMatrixPlaceholder")}
                  className="w-full pl-10 pr-4 py-2.5 bg-background dark:bg-muted/20 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={unverifyLoading}
                className="w-full md:w-auto bg-destructive hover:bg-destructive/90 text-white px-8 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                {unverifyLoading ? t("admin.verification.processing") : t("admin.verification.unverify")}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-3 bg-destructive/10 dark:bg-destructive/20 p-4 rounded-xl border border-destructive/20 dark:border-destructive/30">
              <Info className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[12px] text-destructive leading-relaxed font-semibold">
                  {t("admin.verification.warning")}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("admin.verification.warningDesc")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Reset Utility */}
        <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/20">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> {t("admin.verification.claimRecovery")}
            </h3>
            <p className="text-[13px] text-muted-foreground">{t("admin.verification.claimRecoveryDesc")}</p>
          </div>
          <div className="p-8">
            <form onSubmit={handleSearchReset} className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchMatrix}
                  onChange={e => setSearchMatrix(e.target.value)}
                  placeholder={t("admin.verification.searchMatrix")}
                  className="w-full pl-10 pr-4 py-2.5 bg-background dark:bg-muted/20 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="w-full md:w-auto bg-primary text-white px-8 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                {searchLoading ? t("admin.verification.searching") : t("admin.verification.lookup")}
              </button>
            </form>


            <div className="mt-6 flex items-start gap-3 bg-blue-500/10 dark:bg-blue-500/20 p-4 rounded-xl border border-blue-500/20 dark:border-blue-500/30">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[12px] text-blue-600 dark:text-blue-400 leading-relaxed font-semibold">
                  {t("admin.verification.infoRecovery")}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("admin.verification.infoRecoveryDesc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {searchResult && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          {/* Backdrop Click */}
          <div className="absolute inset-0" onClick={() => setSearchResult(null)} />

          {/* Modal Card */}
          <div className="relative w-full max-w-md bg-card text-card-foreground rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/20">
              <span className="text-sm font-bold text-foreground tracking-wide flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> {t("admin.verification.lookupResult")}
              </span>
              <button
                onClick={() => setSearchResult(null)}
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-all cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">

              {/* Status Banner */}
              <div className={`p-4 rounded-xl flex items-center gap-3 border ${searchResult.isUsed
                ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                : "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
                }`}>
                {searchResult.isUsed ? (
                  <ShieldOff className="h-5 w-5 shrink-0" />
                ) : (
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                )}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{t("admin.verification.claimStatus")}</div>
                  <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
                    {searchResult.isUsed ? t("admin.verification.claimedInUse") : t("admin.verification.availReg")}
                  </div>
                </div>
              </div>

              {/* Student Info Card */}
              <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-4">
                <div>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("admin.verification.fullName")}</span>
                  <span className="text-base font-extrabold text-foreground tracking-tight block uppercase mt-0.5">{searchResult.displayName || "Unknown Student"}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("admin.verification.matrixNumber")}</span>
                    <span className="text-sm font-bold text-foreground font-mono block mt-0.5">{searchResult.matrixNumber}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("admin.verification.practicum")}</span>
                    <span className="text-sm font-bold text-foreground block mt-0.5">{searchResult.practicum || "N/A"}</span>
                  </div>
                </div>

                {searchResult.isUsed && searchResult.claimedBy && (
                  <div className="pt-3 border-t border-border/50">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">{t("admin.verification.claimedByAccount")}</span>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-foreground font-mono break-all select-all">{searchResult.claimedBy}</span>
                      <button
                        onClick={() => handleCopyUid(searchResult.claimedBy)}
                        className="p-1 hover:bg-muted text-muted-foreground hover:text-primary rounded transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        title="Copy UID to clipboard"
                      >
                        {copiedUid ? (
                          <span className="text-[9px] text-green-500 font-bold uppercase tracking-wider flex items-center gap-0.5">
                            <Check className="h-3 w-3" /> {t("admin.verification.copied")}
                          </span>
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Restorative Action */}
              {searchResult.isUsed && (
                <div className="flex items-start gap-2.5 bg-destructive/10 dark:bg-destructive/20 p-3 rounded-lg border border-destructive/20">
                  <Info className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] text-destructive font-bold uppercase tracking-wider leading-none">{t("admin.verification.adminAction")}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("admin.verification.adminActionDesc")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-muted/20 border-t border-border flex gap-3">
              {searchResult.isUsed ? (
                <>
                  <button
                    onClick={handleResetClaim}
                    className="flex-1 bg-destructive hover:bg-destructive/90 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all cursor-pointer text-center"
                  >
                    {t("admin.verification.resetClaim")}
                  </button>
                  <button
                    onClick={() => setSearchResult(null)}
                    className="px-6 bg-muted hover:bg-muted/80 text-foreground py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
                  >
                    {t("admin.verification.close")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSearchResult(null)}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/95 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all cursor-pointer text-center"
                >
                  {t("admin.verification.closeLookup")}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
