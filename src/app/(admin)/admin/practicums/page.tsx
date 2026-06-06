"use client";

import React, { useState, useEffect } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { PracticumDocument } from "@/types";
import { Plus, Upload, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { collection, onSnapshot, doc, deleteDoc, writeBatch, Timestamp, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { deleteAllPracticums, uploadPracticumsCSV } from "@/actions/admin";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminPracticumsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [practicums, setPracticums] = useState<PracticumDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvLoading, setCsvLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "practicums"), (snap) => {
      const data = snap.docs.map(doc => doc.data() as PracticumDocument);
      data.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      setPracticums(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Prevent window close or navigation during CSV upload
  useEffect(() => {
    if (!csvLoading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t("admin.practicums.importWarning");
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [csvLoading]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setSubmitting(true);
    try {
      const formattedCode = code.toUpperCase();
      const exist = await getDocs(query(collection(db, "practicums"), where("code", "==", formattedCode)));
      if (!exist.empty) {
        alert(t("admin.practicums.alreadyExists"));
        setSubmitting(false);
        return;
      }

      const newRef = doc(collection(db, "practicums"));
      const practicumDoc: PracticumDocument = {
        practicumId: newRef.id,
        code: formattedCode,
        label: label || null,
        createdAt: Timestamp.now(),
        createdBy: user?.uid || "system"
      };

      const batch = writeBatch(db);
      batch.set(newRef, practicumDoc);
      await batch.commit();

      setCode("");
      setLabel("");
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert(t("admin.practicums.addFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvData = event.target?.result as string;
        const lines = csvData.split("\n").filter(line => line.trim() !== "");

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
          alert(t("admin.practicums.csvEmpty"));
          return;
        }

        // Auto-detect columns
        const firstRow = parsedLines[0];
        const headersLower = firstRow.map(h => h.toLowerCase());

        let codeIdx = headersLower.findIndex(h => h.includes("code") || h.includes("short") || h.includes("practicum") || h.includes("id") || h.includes("unit"));
        let labelIdx = headersLower.findIndex(h => h.includes("name") || h.includes("label") || h.includes("dept") || h.includes("full") || h.includes("description"));

        const hasHeader = (codeIdx !== -1 || labelIdx !== -1);

        if (!hasHeader || codeIdx === labelIdx || codeIdx === -1 || labelIdx === -1) {
          const numCols = firstRow.length;
          const scores = Array.from({ length: numCols }, () => ({ code: 0, label: 0 }));
          const rowsToSample = parsedLines.slice(0, 10);

          for (const row of rowsToSample) {
            row.forEach((val, idx) => {
              if (idx >= numCols) return;
              const clean = val.trim();
              if (!clean) return;

              // Code score: short, alphanumeric, no spaces (2-6 chars)
              if (clean.length >= 2 && clean.length <= 6 && !/\s/.test(clean)) {
                scores[idx].code += 10;
              } else if (clean.length < 8 && !/\s/.test(clean)) {
                scores[idx].code += 5;
              }

              // Label score: longer, contains spaces, or alphabetical (>= 4 chars)
              if (clean.length >= 6 && (/\s/.test(clean) || /[a-zA-Z]/.test(clean))) {
                scores[idx].label += 10;
              } else if (clean.length >= 4) {
                scores[idx].label += 5;
              }
            });
          }

          const assigned = new Set<number>();

          let maxCode = -1;
          let bestCode = -1;
          for (let i = 0; i < numCols; i++) {
            if (scores[i].code > maxCode) {
              maxCode = scores[i].code;
              bestCode = i;
            }
          }
          if (bestCode !== -1 && maxCode > 0) {
            codeIdx = bestCode;
            assigned.add(codeIdx);
          }

          let maxLabel = -1;
          let bestLabel = -1;
          for (let i = 0; i < numCols; i++) {
            if (assigned.has(i)) continue;
            if (scores[i].label > maxLabel) {
              maxLabel = scores[i].label;
              bestLabel = i;
            }
          }
          if (bestLabel !== -1 && maxLabel > 0) {
            labelIdx = bestLabel;
            assigned.add(labelIdx);
          }
        }

        // Validate detection results
        if (codeIdx === -1 || labelIdx === -1) {
          throw new Error(t("admin.practicums.csvDetectFailed"));
        }

        const rowsToProcess = hasHeader ? parsedLines.slice(1) : parsedLines;
        const validatedRows = [];

        for (let i = 0; i < rowsToProcess.length; i++) {
          const row = rowsToProcess[i];
          const rawCode = row[codeIdx] || "";
          const rawLabel = row[labelIdx] || "";

          const codeClean = rawCode.replace(/\s+/g, '').trim().toUpperCase();
          const labelClean = rawLabel.replace(/\s+/g, ' ').trim();

          if (!codeClean && !labelClean) {
            continue; // Skip blank lines gracefully
          }

          if (!codeClean) {
            throw new Error(t("admin.practicums.csvMissingCode").replace("{row}", (i + (hasHeader ? 2 : 1)).toString()));
          }

          // Code Validation: short alphanumeric (1 to 10 characters)
          if (!/^[A-Z0-9-]{1,10}$/.test(codeClean)) {
            throw new Error(t("admin.practicums.csvInvalidCode").replace("{row}", (i + (hasHeader ? 2 : 1)).toString()).replace("{code}", rawCode));
          }

          // Label Validation: non-empty string, length >= 3
          if (labelClean.length < 3) {
            throw new Error(t("admin.practicums.csvInvalidLabel").replace("{row}", (i + (hasHeader ? 2 : 1)).toString()).replace("{label}", rawLabel));
          }

          validatedRows.push({
            code: codeClean,
            label: labelClean
          });
        }

        if (validatedRows.length === 0) {
          throw new Error(t("admin.practicums.csvNoValid"));
        }

        const res = await uploadPracticumsCSV(validatedRows);
        alert(t("admin.practicums.csvImportSuccess").replace("{added}", res.added.toString()).replace("{skipped}", res.skipped.toString()));
      } catch (err: any) {
        console.error(err);
        alert(err.message || t("admin.practicums.csvImportFailed"));
      } finally {
        setCsvLoading(false);
        e.target.value = ""; // Reset input
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("admin.practicums.deleteConfirm"))) return;
    try {
      await deleteDoc(doc(db, "practicums", id));
    } catch (err) {
      console.error(err);
      alert(t("admin.practicums.deleteFailed"));
    }
  };
  const handleDeleteAll = async () => {
    if (practicums.length === 0) return;
    if (!window.confirm(t("admin.practicums.deleteAllConfirm").replace("{count}", practicums.length.toString()))) return;

    setLoading(true);
    try {
      await deleteAllPracticums();
      alert(t("admin.practicums.deleteAllSuccess"));
    } catch (err) {
      console.error(err);
      alert(t("admin.practicums.deleteAllFailed"));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: "code" as keyof PracticumDocument, label: t("admin.practicums.colCode"), sortable: true, align: "center" as const },
    { key: "label" as keyof PracticumDocument, label: t("admin.practicums.colFullName"), sortable: true, align: "center" as const, render: (v: string) => v || "-" },
    {
      key: "practicumId" as keyof PracticumDocument, label: t("admin.practicums.colActions"), align: "center" as const, render: (v: string) => (
        <button onClick={() => handleDelete(v)} className="text-destructive dark:text-red-400 text-xs font-semibold hover:underline flex items-center gap-1 mx-auto">
          <Trash2 className="h-3 w-3" /> {t("admin.practicums.delete")}
        </button>
      )
    }
  ];

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h2 className="text-[22px] font-medium text-foreground">{t("admin.practicums.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.practicums.breadcrumb")}</span>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto md:justify-end">
          <button
            onClick={() => setShowAdd(true)}
            disabled={csvLoading || loading}
            className="w-full md:w-auto bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus className="h-4 w-4" /> {t("admin.practicums.addNew")}
          </button>

          {practicums.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={csvLoading || loading}
              className="w-full md:w-auto bg-destructive/10 dark:bg-destructive/20 text-destructive dark:text-red-400 border border-destructive/20 dark:border-destructive/40 px-6 py-2.5 rounded-md font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-destructive hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Trash2 className="h-4 w-4" /> {t("admin.practicums.deleteAll")}
            </button>
          )}

          <label className={`w-full md:w-auto cursor-pointer bg-card dark:bg-muted/20 text-primary dark:text-primary-foreground border border-primary dark:border-primary/50 px-6 py-2.5 rounded-md font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-primary/5 dark:hover:bg-primary/10 transition-all flex items-center justify-center gap-2 active:scale-95 ${(csvLoading || loading) ? 'opacity-50 pointer-events-none' : ''}`}>
            {csvLoading ? (
              <>
                <LoadingSpinner /> {t("admin.practicums.importing")}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> {t("admin.practicums.importCsv")}
              </>
            )}
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={csvLoading || loading} />
          </label>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card text-card-foreground rounded-xl shadow-lg border border-border p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
            <h4 className="font-bold text-[14px] text-foreground uppercase tracking-wider mb-5">{t("admin.practicums.registerNew")}</h4>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("admin.practicums.shortCode")}</label>
                <input
                  type="text"
                  placeholder="e.g., S1"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-md text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("admin.practicums.fullName")}</label>
                <input
                  type="text"
                  placeholder="e.g., Computer Science"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-md text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCode("");
                    setLabel("");
                    setShowAdd(false);
                  }}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  {t("admin.practicums.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
                >
                  {submitting ? t("admin.practicums.saving") : t("admin.practicums.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-card text-card-foreground rounded-lg shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <DataTable columns={columns} data={practicums as any} />
        )}
      </div>
    </div>
  );
}
