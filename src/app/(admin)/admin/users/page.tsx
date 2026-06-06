"use client";

import React, { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserDocument } from "@/types";
import { Timestamp, collection, getDocs, query, limit, startAfter, doc, updateDoc, orderBy, where, getCountFromServer, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Users, Search, UserPlus, Filter, ChevronLeft, ChevronRight, Edit2, Trash2, Ban, CheckCircle, Download, FileSpreadsheet, ChevronDown, ChevronUp, User, Phone, BookOpen, Clock, Activity, ShieldCheck, Mail, Hash, Briefcase, X, Copy, Check, History as HistoryIcon, XCircle, AlertCircle, Settings, ShieldAlert } from "lucide-react";
import { deleteUserAccount, applyPermanentBan, liftPermanentBan, applyManualCooldown, liftManualCooldown } from "@/actions/admin";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePracticums } from "@/lib/hooks/usePracticums";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import * as XLSX from "xlsx";
import { format } from "date-fns";

const STAFF_UNITS = [
  "Bahasa Inggeris",
  "Biologi",
  "Ekonomi",
  "Fizik",
  "Kaunseling",
  "Kimia",
  "Kokurikulum",
  "Matematik",
  "Pengajian Am",
  "Pendidikan Islam",
  "Pendidikan Moral",
  "Pentadbir",
  "Perakaunan",
  "Perniagaan",
  "Sains Komputer",
  "Lain-lain"
];

import { useLanguage } from "@/lib/i18n/LanguageContext";
export default function AdminUsersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { practicums } = usePracticums();
  const [studentsList, setStudentsList] = useState<UserDocument[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSearchField, setStudentSearchField] = useState<"displayName" | "matrixNumber" | "email" | "uid">("displayName");
  const [studentPage, setStudentPage] = useState(1);
  const [studentLastVisible, setStudentLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [studentHistory, setStudentHistory] = useState<Array<QueryDocumentSnapshot<DocumentData> | null>>([null]);

  const [staffList, setStaffList] = useState<UserDocument[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSearchField, setStaffSearchField] = useState<"displayName" | "matrixNumber" | "email" | "uid">("displayName");
  const [staffPage, setStaffPage] = useState(1);
  const [staffLastVisible, setStaffLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [staffHistory, setStaffHistory] = useState<Array<QueryDocumentSnapshot<DocumentData> | null>>([null]);

  const [studentSort, setStudentSort] = useState<{ field: string, direction: "asc" | "desc" }>({ field: "matrixNumber", direction: "asc" });
  const [staffSort, setStaffSort] = useState<{ field: string, direction: "asc" | "desc" }>({ field: "matrixNumber", direction: "asc" });

  const [studentHasSorted, setStudentHasSorted] = useState(false);
  const [staffHasSorted, setStaffHasSorted] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    admins: 0,
    staff: 0,
    students: 0
  });

  const [selectedDetailUser, setSelectedDetailUser] = useState<UserDocument | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const [editUser, setEditUser] = useState<UserDocument | null>(null);
  const [editData, setEditData] = useState<Partial<UserDocument>>({});

  const fetchStats = async () => {
    try {
      const usersRef = collection(db, "users");
      const [total, admins, staff, students] = await Promise.all([
        getCountFromServer(usersRef),
        getCountFromServer(query(usersRef, where("role", "==", "admin"))),
        getCountFromServer(query(usersRef, where("role", "==", "staff"))),
        getCountFromServer(query(usersRef, where("role", "==", "student")))
      ]);

      setStats({
        total: total.data().count,
        admins: admins.data().count,
        staff: staff.data().count,
        students: students.data().count
      });
    } catch (err) {
      console.error("Error fetching user stats", err);
    }
  };

  const fetchStudents = async (cursor: QueryDocumentSnapshot<DocumentData> | null = null, sortOverride?: { field: string, direction: "asc" | "desc" }) => {
    setStudentLoading(true);
    try {
      const usersRef = collection(db, "users");
      const currentSort = sortOverride || studentSort;
      let q;

      if (studentSearch) {
        const endTerm = studentSearch + "\uf8ff";
        q = query(
          usersRef,
          where("role", "==", "student"),
          where(studentSearchField, ">=", studentSearch),
          where(studentSearchField, "<=", endTerm),
          orderBy(studentSearchField),
          limit(10)
        );
      } else {
        q = query(
          usersRef,
          where("role", "==", "student"),
          orderBy(currentSort.field, currentSort.direction),
          limit(10)
        );
      }

      if (cursor) {
        if (studentSearch) {
          const endTerm = studentSearch + "\uf8ff";
          q = query(
            usersRef,
            where("role", "==", "student"),
            where(studentSearchField, ">=", studentSearch),
            where(studentSearchField, "<=", endTerm),
            orderBy(studentSearchField),
            startAfter(cursor),
            limit(10)
          );
        } else {
          q = query(
            usersRef,
            where("role", "==", "student"),
            orderBy(currentSort.field, currentSort.direction),
            startAfter(cursor),
            limit(10)
          );
        }
      }

      const snap = await getDocs(q);
      setStudentsList(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserDocument)));
      setStudentLastVisible(snap.empty ? null : snap.docs[snap.docs.length - 1]);
    } catch (err) {
      console.error("Error fetching students", err);
    } finally {
      setStudentLoading(false);
    }
  };

  const fetchStaff = async (cursor: QueryDocumentSnapshot<DocumentData> | null = null, sortOverride?: { field: string, direction: "asc" | "desc" }) => {
    setStaffLoading(true);
    try {
      const usersRef = collection(db, "users");
      const currentSort = sortOverride || staffSort;
      let q;

      if (staffSearch) {
        const endTerm = staffSearch + "\uf8ff";
        q = query(
          usersRef,
          where("role", "in", ["admin", "staff"]),
          where(staffSearchField, ">=", staffSearch),
          where(staffSearchField, "<=", endTerm),
          orderBy(staffSearchField),
          limit(10)
        );
      } else {
        q = query(
          usersRef,
          where("role", "in", ["admin", "staff"]),
          orderBy(currentSort.field, currentSort.direction),
          limit(10)
        );
      }

      if (cursor) {
        if (staffSearch) {
          const endTerm = staffSearch + "\uf8ff";
          q = query(
            usersRef,
            where("role", "in", ["admin", "staff"]),
            where(staffSearchField, ">=", staffSearch),
            where(staffSearchField, "<=", endTerm),
            orderBy(staffSearchField),
            startAfter(cursor),
            limit(10)
          );
        } else {
          q = query(
            usersRef,
            where("role", "in", ["admin", "staff"]),
            orderBy(currentSort.field, currentSort.direction),
            startAfter(cursor),
            limit(10)
          );
        }
      }

      const snap = await getDocs(q);
      setStaffList(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserDocument)));
      setStaffLastVisible(snap.empty ? null : snap.docs[snap.docs.length - 1]);
    } catch (err) {
      console.error("Error fetching staff", err);
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStudents(null);
      fetchStaff(null);
      fetchStats();
    }
  }, [user]);

  const handleNextStudentPage = () => {
    if (!studentLastVisible) return;
    const newHistory = [...studentHistory, studentLastVisible];
    setStudentHistory(newHistory);
    setStudentPage(studentPage + 1);
    fetchStudents(studentLastVisible);
  };

  const handlePrevStudentPage = () => {
    if (studentPage <= 1) return;
    const newHistory = [...studentHistory];
    newHistory.pop();
    setStudentHistory(newHistory);
    setStudentPage(studentPage - 1);
    fetchStudents(newHistory[newHistory.length - 1]);
  };

  const handleNextStaffPage = () => {
    if (!staffLastVisible) return;
    const newHistory = [...staffHistory, staffLastVisible];
    setStaffHistory(newHistory);
    setStaffPage(staffPage + 1);
    fetchStaff(staffLastVisible);
  };

  const handlePrevStaffPage = () => {
    if (staffPage <= 1) return;
    const newHistory = [...staffHistory];
    newHistory.pop();
    setStaffHistory(newHistory);
    setStaffPage(staffPage - 1);
    fetchStaff(newHistory[newHistory.length - 1]);
  };

  const handleStudentSort = (field: string) => {
    let direction: "asc" | "desc" = "asc";
    if (studentSort.field === field && studentSort.direction === "asc") {
      direction = "desc";
    }
    setStudentSort({ field, direction });
    setStudentHasSorted(true);
    setStudentPage(1);
    setStudentHistory([null]);
    fetchStudents(null, { field, direction });
  };

  const handleStaffSort = (field: string) => {
    let direction: "asc" | "desc" = "asc";
    if (staffSort.field === field && staffSort.direction === "asc") {
      direction = "desc";
    }
    setStaffSort({ field, direction });
    setStaffHasSorted(true);
    setStaffPage(1);
    setStaffHistory([null]);
    fetchStaff(null, { field, direction });
  };

  const handleDelete = async (uid: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this user? This will fail if they have active bookings.")) return;
    try {
      await deleteUserAccount(uid);
      alert("User deleted successfully.");
      fetchStudents(null);
      fetchStaff(null);
      fetchStats();
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  const handleApplyPermanentBan = async (item: UserDocument) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY BAN ${item.displayName || "this user"}? They will be locked out of the system entirely.`)) return;

    try {
      await applyPermanentBan(item.uid);

      const newFields = { isBlocked: true, blockType: "admin" as const, cooldownUntil: null };
      const updateFn = (prev: UserDocument[]) => prev.map(u => u.uid === item.uid ? { ...u, ...newFields } as UserDocument : u);
      setStudentsList(updateFn);
      setStaffList(updateFn);
      setSelectedDetailUser(prev => prev && prev.uid === item.uid ? { ...prev, ...newFields } as UserDocument : prev);

      alert("User account has been permanently banned.");
    } catch (err) {
      console.error("Failed to apply permanent ban:", err);
      alert("Failed to apply permanent ban.");
    }
  };

  const handleLiftPermanentBan = async (item: UserDocument) => {
    if (!window.confirm(`Are you sure you want to LIFT the permanent ban for ${item.displayName || "this user"}?`)) return;

    try {
      await liftPermanentBan(item.uid);

      const newFields = { isBlocked: false, blockType: null, cooldownUntil: null, lateReturnCount: 0 };
      const updateFn = (prev: UserDocument[]) => prev.map(u => u.uid === item.uid ? { ...u, ...newFields } as UserDocument : u);
      setStudentsList(updateFn);
      setStaffList(updateFn);
      setSelectedDetailUser(prev => prev && prev.uid === item.uid ? { ...prev, ...newFields } as UserDocument : prev);

      alert("Permanent ban lifted successfully.");
    } catch (err) {
      console.error("Failed to lift permanent ban:", err);
      alert("Failed to lift permanent ban.");
    }
  };

  const handleApplyCooldown = async (item: UserDocument, hours: number) => {
    if (!window.confirm(`Are you sure you want to apply a ${hours}-hour temporary cooldown to ${item.displayName || "this user"}?`)) return;

    try {
      const result = await applyManualCooldown(item.uid, hours);

      const cooldownUntil = result.cooldownUntil ? Timestamp.fromDate(new Date(result.cooldownUntil)) : null;
      const newFields = { isBlocked: false, blockType: null, cooldownUntil };
      const updateFn = (prev: UserDocument[]) => prev.map(u => u.uid === item.uid ? { ...u, ...newFields } as UserDocument : u);
      setStudentsList(updateFn);
      setStaffList(updateFn);
      setSelectedDetailUser(prev => prev && prev.uid === item.uid ? { ...prev, ...newFields } as UserDocument : prev);

      alert(`Temporary cooldown of ${hours} hours applied successfully.`);
    } catch (err) {
      console.error("Failed to apply cooldown:", err);
      alert("Failed to apply cooldown.");
    }
  };

  const handleLiftCooldown = async (item: UserDocument) => {
    if (!window.confirm(`Are you sure you want to LIFT the cooldown for ${item.displayName || "this user"}?`)) return;

    try {
      await liftManualCooldown(item.uid);

      const newFields = { isBlocked: false, blockType: null, cooldownUntil: null, lateReturnCount: 0 };
      const updateFn = (prev: UserDocument[]) => prev.map(u => u.uid === item.uid ? { ...u, ...newFields } as UserDocument : u);
      setStudentsList(updateFn);
      setStaffList(updateFn);
      setSelectedDetailUser(prev => prev && prev.uid === item.uid ? { ...prev, ...newFields } as UserDocument : prev);

      alert("Cooldown lifted successfully.");
    } catch (err) {
      console.error("Failed to lift cooldown:", err);
      alert("Failed to lift cooldown.");
    }
  };

  const triggerApplyCooldownPrompt = (item: UserDocument) => {
    const hoursStr = window.prompt(`Apply Cooldown to ${item.displayName || "user"}:\nEnter duration in hours (e.g. 24 for 1 day):`);
    if (hoursStr === null) return; // User cancelled

    const hours = parseInt(hoursStr, 10);
    if (!isNaN(hours) && hours > 0) {
      handleApplyCooldown(item, hours);
    } else {
      alert("Invalid duration. Please enter a valid number of hours greater than 0.");
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    try {
      const userRef = doc(db, "users", editUser.uid);
      await updateDoc(userRef, editData);
      setStudentsList(prev => prev.map(u => u.uid === editUser.uid ? { ...u, ...editData } as UserDocument : u));
      setStaffList(prev => prev.map(u => u.uid === editUser.uid ? { ...u, ...editData } as UserDocument : u));
      setEditUser(null);
    } catch (err) {
      console.error("Failed to update user", err);
      alert("Failed to update user.");
    }
  };

  const getExportData = (list: UserDocument[], type: "students" | "staff") => {
    const isStaff = type === "staff";
    return list.map(u => {
      const row: Record<string, any> = {
        "Full Name": u.displayName || "-",
        "Email Address": u.email || "-",
      };

      if (isStaff) {
        row["Unique ID"] = u.matrixNumber || "-";
      } else {
        row["Matrix Number"] = u.matrixNumber || "-";
      }

      row["Phone Number"] = u.phoneNumber || "-";

      if (isStaff) {
        row["Unit"] = u.practicum || "-";
      } else {
        row["Practicum"] = u.practicum || "-";
      }

      return {
        ...row,
        "User Role": u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : "-",
        "Verification Status": u.verificationStatus ? (u.verificationStatus.charAt(0).toUpperCase() + u.verificationStatus.slice(1)) : "Unverified",
        "Is Suspended/Blocked": u.isBlocked ? "Yes" : "No",
        "Block Type": u.blockType ? (u.blockType === "admin" ? "Admin Manual Block" : "System Automatic Block") : "None",
        "Cooldown Until": u.cooldownUntil ? format(u.cooldownUntil.toDate(), "yyyy-MM-dd HH:mm") : "N/A",
        "Operational Late Returns (Reset on Lift)": u.lateReturnCount || 0,
        "Account Created At": u.createdAt ? format(u.createdAt.toDate(), "yyyy-MM-dd HH:mm") : "-",
        "Last Login Activity": u.lastLoginAt ? format(u.lastLoginAt.toDate(), "yyyy-MM-dd HH:mm") : "-",
        "Stat: Total Bookings": u.stats?.totalBookings || 0,
        "Stat: Completed Bookings": u.stats?.completedBookings || 0,
        "Stat: Cancelled Bookings": u.stats?.cancelledBookings || 0,
        "Stat: Lifetime Late Bookings": u.stats?.lateBookings || 0,
      };
    });
  };

  const handleExportCSV = (list: UserDocument[], name: string) => {
    const data = getExportData(list, name as "students" | "staff");
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${name}_export_${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
  };

  const handleExportExcel = (list: UserDocument[], name: string) => {
    const data = getExportData(list, name as "students" | "staff");
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, `${name}_export_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const getAccessStatus = (u: UserDocument) => {
    const now = new Date();
    if (u.isBlocked) {
      return {
        label: "Permanently Blocked",
        color: "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30"
      };
    }
    if (u.cooldownUntil && u.cooldownUntil.toDate() > now) {
      return {
        label: "Cooldown",
        color: "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-500 border-amber-100 dark:border-amber-900/30"
      };
    }
    return { label: "Active", color: "bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-500 border-green-100 dark:border-green-900/30" };
  };

  // Internal Table Component to avoid duplication
  const UserTable = ({
    list,
    idLabel = "Matrix / Unique ID",
    sort,
    onSort,
    searchActive = false,
    hasSorted = false
  }: {
    list: UserDocument[],
    idLabel?: string,
    sort?: { field: string, direction: "asc" | "desc" },
    onSort?: (field: string) => void,
    searchActive?: boolean,
    hasSorted?: boolean
  }) => {
    const columns = [
      { key: "matrixNumber", label: idLabel, sortable: !searchActive },
      { key: "displayName", label: t("admin.users.colFullName"), sortable: !searchActive },
      { key: "role", label: t("admin.users.colRole"), sortable: !searchActive },
      { key: "status", label: t("admin.users.colStatus"), sortable: false },
      { key: "createdAt", label: t("admin.users.colAccess"), sortable: !searchActive },
      { key: "actions", label: t("admin.users.colActions"), sortable: false }
    ];

    return (
      <div className="flex flex-col">
        {!searchActive && (
          <div className="px-6 py-2 bg-muted/20 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            {t("admin.users.sortHint")}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead className="bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-6 py-4 whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:bg-muted/80 transition-colors' : ''}`}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {col.label}
                      {col.sortable && hasSorted && sort?.field === col.key && (
                        sort.direction === "asc" ? <ChevronUp className="h-3 w-3 text-primary shrink-0" /> : <ChevronDown className="h-3 w-3 text-primary shrink-0" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((item) => {
                const access = getAccessStatus(item);
                return (
                  <tr
                    key={item.uid}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedDetailUser(item)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-bold text-[13px] text-primary uppercase tracking-tight truncate">{item.matrixNumber}</span>
                    </td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground font-normal whitespace-nowrap truncate max-w-[200px]" title={item.displayName}>
                      {item.displayName}
                    </td>
                    <td className="px-6 py-4 capitalize text-[12px] text-muted-foreground whitespace-nowrap">{item.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex justify-center">
                        <StatusBadge status={item.verificationStatus} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex justify-center">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border whitespace-nowrap ${access.color}`}>
                          {access.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex justify-center gap-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => {
                          setEditUser(item);
                          setEditData({
                            role: item.role,
                            displayName: item.displayName,
                            phoneNumber: item.phoneNumber,
                            matrixNumber: item.matrixNumber,
                            practicum: item.practicum
                          });
                        }} className="text-primary hover:bg-primary/10 p-1.5 rounded-md transition-colors" title="Edit">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {item.role !== "admin" && (
                          <>
                            {item.isBlocked ? (
                              <button onClick={() => handleLiftPermanentBan(item)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 p-1.5 rounded-md transition-colors" title="Lift Permanent Ban">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                            ) : item.cooldownUntil && item.cooldownUntil.toDate() > new Date() ? (
                              <button onClick={() => handleLiftCooldown(item)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 p-1.5 rounded-md transition-colors" title="Lift Cooldown">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <>
                                <button onClick={() => handleApplyPermanentBan(item)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 p-1.5 rounded-md transition-colors" title="Permanent Ban">
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => triggerApplyCooldownPrompt(item)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 p-1.5 rounded-md transition-colors" title="Apply Cooldown">
                                  <Clock className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {item.role !== "admin" && (
                          <button onClick={() => handleDelete(item.uid)} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h2 className="text-[22px] font-medium text-card-foreground">{t("admin.users.title")}</h2>
          <div className="flex items-center text-[13px] text-muted-foreground mt-1 space-x-2">
            <span>{t("admin.overview.title")}</span>
            <span>›</span>
            <span>{t("admin.users.users")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: t("admin.users.totalUsers"), value: stats.total, icon: Users, color: "text-primary", bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: t("admin.users.students"), value: stats.students, icon: BookOpen, color: "text-green-600 dark:text-green-500", bg: "bg-green-50 dark:bg-green-900/20" },
          { label: t("admin.users.staff"), value: stats.staff, icon: Briefcase, color: "text-purple-600 dark:text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
          { label: t("admin.users.administrators"), value: stats.admins, icon: ShieldCheck, color: "text-blue-600 dark:text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" }
        ].map((stat, i) => (
          <div key={i} className="bg-card rounded-lg p-6 shadow-sm border border-border hover:shadow-md transition-all group">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{stat.label}</span>
                <span className="text-2xl font-semibold text-foreground">{stat.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Student Registry Card */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-lg font-medium text-card-foreground">{t("admin.users.studentRegistry")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("admin.users.studentRegistryDesc")}</p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <select
                value={studentSearchField}
                onChange={(e) => setStudentSearchField(e.target.value as "displayName" | "matrixNumber" | "email" | "uid")}
                className="w-full md:w-auto px-3 py-1.5 bg-muted border border-border rounded-lg text-[12px] font-bold uppercase focus:outline-none cursor-pointer"
              >
                <option value="displayName">Name</option>
                <option value="matrixNumber">Matrix No</option>
                <option value="email">Email</option>
                <option value="uid">UID</option>
              </select>
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("admin.users.searchStudents")}
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 bg-background border border-border rounded-full text-[11px] focus:border-primary focus:outline-none transition-all w-full md:w-48 shadow-sm"
                />
              </div>
              <button
                onClick={(e) => { e.preventDefault(); fetchStudents(null); }}
                className="w-full md:w-auto bg-primary text-white px-6 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm hover:bg-primary/90 transition-all active:scale-95"
              >
                {t("admin.users.search")}
              </button>
            </div>

            <div className="grid grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => handleExportCSV(studentsList, "students")}
                disabled={studentsList.length === 0}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-1.5 bg-background border border-border hover:border-primary/50 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
              >
                <Download className="h-3.5 w-3.5" /> {t("admin.users.csv")}
              </button>
              <button
                onClick={() => handleExportExcel(studentsList, "students")}
                disabled={studentsList.length === 0}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-1.5 bg-background border border-border hover:border-primary/50 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> {t("admin.users.xlsx")}
              </button>
            </div>
          </div>
        </div>

        {studentLoading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <>
            <UserTable
              list={studentsList}
              idLabel="Matrix No"
              sort={studentSort}
              onSort={handleStudentSort}
              searchActive={!!studentSearch}
              hasSorted={studentHasSorted}
            />
            <div className="p-4 border-t border-border flex justify-between items-center bg-muted/20">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                {t("admin.users.showingRecords")} {((studentPage - 1) * 10) + 1} - {((studentPage - 1) * 10) + studentsList.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevStudentPage}
                  disabled={studentPage === 1}
                  className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextStudentPage}
                  disabled={!studentLastVisible || studentsList.length < 10}
                  className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Staff & Admins Card */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-lg font-medium text-card-foreground">{t("admin.users.staffRegistry")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("admin.users.staffRegistryDesc")}</p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <select
                value={staffSearchField}
                onChange={(e) => setStaffSearchField(e.target.value as "displayName" | "matrixNumber" | "email" | "uid")}
                className="w-full md:w-auto px-3 py-1.5 bg-muted border border-border rounded-lg text-[12px] font-bold uppercase focus:outline-none cursor-pointer"
              >
                <option value="displayName">Name</option>
                <option value="matrixNumber">Unique ID</option>
                <option value="email">Email</option>
                <option value="uid">UID</option>
              </select>
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("admin.users.searchStaff")}
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 bg-background border border-border rounded-full text-[11px] focus:border-primary focus:outline-none transition-all w-full md:w-48 shadow-sm"
                />
              </div>
              <button
                onClick={(e) => { e.preventDefault(); fetchStaff(null); }}
                className="w-full md:w-auto bg-primary text-white px-6 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm hover:bg-primary/90 transition-all active:scale-95"
              >
                {t("admin.users.search")}
              </button>
            </div>

            <div className="grid grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => handleExportCSV(staffList, "staff")}
                disabled={staffList.length === 0}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-1.5 bg-background border border-border hover:border-primary/50 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
              >
                <Download className="h-3.5 w-3.5" /> {t("admin.users.csv")}
              </button>
              <button
                onClick={() => handleExportExcel(staffList, "staff")}
                disabled={staffList.length === 0}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-1.5 bg-background border border-border hover:border-primary/50 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> {t("admin.users.xlsx")}
              </button>
            </div>
          </div>
        </div>

        {staffLoading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <>
            <UserTable
              list={staffList}
              idLabel="Unique ID"
              sort={staffSort}
              onSort={handleStaffSort}
              searchActive={!!staffSearch}
              hasSorted={staffHasSorted}
            />
            <div className="p-4 border-t border-border flex justify-between items-center bg-muted/20">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("admin.users.showingRecords")} {((staffPage - 1) * 10) + 1} - {((staffPage - 1) * 10) + staffList.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevStaffPage}
                  disabled={staffPage === 1}
                  className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextStaffPage}
                  disabled={!staffLastVisible || staffList.length < 10}
                  className="p-1.5 bg-background border border-border rounded-md text-foreground disabled:opacity-50 hover:bg-muted transition-colors flex items-center justify-center shadow-sm"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {editUser && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl max-w-md w-full p-6 shadow-lg border border-border">
            <h3 className="text-lg font-bold mb-4">{t("admin.users.editUser")}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{t("admin.users.name")}</label>
                <input
                  type="text"
                  value={editData.displayName || ""}
                  onChange={e => setEditData({ ...editData, displayName: e.target.value })}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {editData.role === "staff" ? "Unique ID" : "Matrix Number"}
                </label>
                <input
                  type="text"
                  value={editData.matrixNumber || ""}
                  onChange={e => setEditData({ ...editData, matrixNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {editData.role === "staff" ? t("admin.users.unit") : t("admin.users.practicum")}
                </label>
                {editData.role === "staff" ? (
                  <select
                    value={editData.practicum || ""}
                    onChange={e => setEditData({ ...editData, practicum: e.target.value })}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>Select unit</option>
                    {STAFF_UNITS.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={editData.practicum || ""}
                    onChange={e => setEditData({ ...editData, practicum: e.target.value })}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="">None / External</option>
                    {practicums.map(p => (
                      <option key={p.code} value={p.code}>{p.code}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{t("admin.users.role")}</label>
                <select
                  value={editData.role || "student"}
                  onChange={e => setEditData({ ...editData, role: e.target.value as any })}
                  disabled={user?.uid === editUser.uid} // prevent editing own role
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none disabled:opacity-50"
                >
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
                {user?.uid === editUser.uid && <p className="text-[10px] text-muted-foreground mt-1">You cannot edit your own role.</p>}
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{t("admin.users.phone")}</label>
                <input
                  type="text"
                  value={editData.phoneNumber || ""}
                  onChange={e => setEditData({ ...editData, phoneNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-card-foreground focus:outline-none"
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button onClick={() => setEditUser(null)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">{t("admin.users.cancel")}</button>
                <button onClick={handleSaveEdit} className="px-4 py-2 bg-primary text-white rounded-md text-xs font-bold uppercase tracking-wider">{t("admin.users.saveChanges")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDetailUser && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setSelectedDetailUser(null)}
          />

          {/* Modal Container */}
          <div className="relative bg-card dark:bg-[#1a1f26] border border-border rounded-2xl w-full max-w-[500px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 font-sans max-h-[85vh] md:max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/50 shrink-0 text-left">
              <div>
                <h3 className="text-base font-bold text-foreground">{t("admin.users.userDetails")}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    UID: {selectedDetailUser.uid.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${selectedDetailUser.isBlocked
                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                    : (selectedDetailUser.cooldownUntil && selectedDetailUser.cooldownUntil.toDate() > new Date()
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      : 'bg-green-500/10 text-green-500 border-green-500/20')
                  }`}>
                  {selectedDetailUser.isBlocked ? "Suspended" : (selectedDetailUser.cooldownUntil && selectedDetailUser.cooldownUntil.toDate() > new Date() ? "Cooldown" : "Active")}
                </span>
                <button
                  onClick={() => setSelectedDetailUser(null)}
                  className="w-7 h-7 rounded-full hover:bg-muted dark:hover:bg-muted/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                >
                  <XCircle className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar text-left">

              {/* Top Row Badges */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary dark:text-blue-400 text-[11px] font-bold uppercase">
                  <User className="w-3.5 h-3.5" />
                  <span>{t("admin.users.role")}: {selectedDetailUser.role}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold uppercase">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t("admin.users.status")}: {selectedDetailUser.verificationStatus}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/65 dark:bg-muted/10 border border-border/80 text-muted-foreground text-[11px] font-semibold uppercase">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{t("admin.users.setup")}: {selectedDetailUser.profileComplete ? "Complete" : "Incomplete"}</span>
                </div>
              </div>

              {/* Identity & Profile Section */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-primary" /> {t("admin.users.userIdentity")}
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.name")}</span>
                    <span className="font-semibold text-foreground uppercase truncate max-w-[240px]" title={selectedDetailUser.displayName || "N/A"}>
                      {selectedDetailUser.displayName || "N/A"}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">
                      {selectedDetailUser.role === "staff" ? "Unique ID" : "Matrix No"}
                    </span>
                    <span className="font-semibold text-foreground font-mono uppercase">
                      {selectedDetailUser.matrixNumber || "N/A"}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">
                      {selectedDetailUser.role === "staff" ? t("admin.users.unit") : t("admin.users.practicum")}
                    </span>
                    <span className="font-semibold text-foreground uppercase">
                      {selectedDetailUser.practicum || "EXTERNAL / GEN"}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.phone")}</span>
                    <span className="font-semibold text-foreground">{selectedDetailUser.phoneNumber || "Not provided"}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.email")}</span>
                    <span className="font-semibold text-muted-foreground font-mono truncate max-w-[240px]" title={selectedDetailUser.email}>
                      {selectedDetailUser.email}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account Timeline & Lifecycle */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <HistoryIcon className="h-3.5 w-3.5 text-primary" /> {t("admin.users.accountTimeline")}
                </h4>
                <div className="space-y-2.5 text-xs">

                  {/* Registered */}
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.accountRegistered")}</span>
                    <span className="font-semibold text-foreground">
                      {selectedDetailUser.createdAt ? format(selectedDetailUser.createdAt.toDate(), "dd/MM/yyyy HH:mm:ss") : "N/A"}
                    </span>
                  </div>

                  {/* Last Activity */}
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.lastLogin")}</span>
                    <span className="font-semibold text-foreground">
                      {selectedDetailUser.lastLoginAt ? format(selectedDetailUser.lastLoginAt.toDate(), "dd/MM/yyyy HH:mm:ss") : "Unknown"}
                    </span>
                  </div>

                  {/* Last Booking Cancelled */}
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.lastBookingCancelled")}</span>
                    <span className="font-semibold text-foreground">
                      {selectedDetailUser.lastCancelledAt ? format(selectedDetailUser.lastCancelledAt.toDate(), "dd/MM/yyyy HH:mm:ss") : "No cancellations"}
                    </span>
                  </div>

                </div>

                {/* Session Active Version */}
                <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-lg border border-border/30 text-xs">
                  <span className="text-muted-foreground">{t("admin.users.activeSession")}</span>
                  <span className="font-bold text-foreground">
                    Version {selectedDetailUser.sessionVersion ?? 1}
                  </span>
                </div>

                {/* Active Restrictions Alert Banner */}
                {(selectedDetailUser.isBlocked || (selectedDetailUser.cooldownUntil && selectedDetailUser.cooldownUntil.toDate() > new Date())) && (
                  <div className="flex items-center gap-2 bg-red-500/10 text-red-500 p-3 rounded-xl border border-red-500/20">
                    <AlertCircle className="h-4 w-4 shrink-0 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {selectedDetailUser.isBlocked
                        ? "RESTRICTION VIOLATION: ACCOUNT PERMANENTLY SUSPENDED"
                        : `RESTRICTION VIOLATION: COOLDOWN ACTIVE UNTIL ${format(selectedDetailUser.cooldownUntil!.toDate(), "dd/MM/yyyy HH:mm:ss")}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Technical Audit Logs */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Settings className="h-3.5 w-3.5 text-primary" /> {t("admin.users.technicalLogs")}
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.accruedPenalties")}</span>
                    <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${selectedDetailUser.lateReturnCount > 0 ? 'bg-red-500/10 text-red-500 font-black' : 'bg-muted text-muted-foreground'}`}>
                      {selectedDetailUser.lateReturnCount || 0} times
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.lifetimeLate")}</span>
                    <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${(selectedDetailUser.stats?.lateBookings || 0) > 0 ? 'bg-red-500/10 text-red-500 font-black' : 'bg-muted text-muted-foreground'}`}>
                      {selectedDetailUser.stats?.lateBookings || 0} times
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.totalBookingReqs")}</span>
                    <span className="font-semibold text-foreground">{selectedDetailUser.stats?.totalBookings || 0} sessions</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.completedSessions")}</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{selectedDetailUser.stats?.completedBookings || 0} sessions</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.cancelledSessions")}</span>
                    <span className="font-semibold text-muted-foreground">{selectedDetailUser.stats?.cancelledBookings || 0} sessions</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.emailNotif")}</span>
                    <span className="font-semibold text-foreground">{selectedDetailUser.emailNotification ? "Enabled" : "Disabled"}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">{t("admin.users.pushNotif")}</span>
                    <span className="font-semibold text-foreground">{selectedDetailUser.pushNotification ? "Enabled" : "Disabled"}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-muted-foreground">FCM Token</span>
                    {selectedDetailUser.fcmToken ? (
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] font-mono bg-muted/60 px-2 py-0.5 rounded border border-border text-foreground truncate max-w-[130px]" title={selectedDetailUser.fcmToken}>
                          {selectedDetailUser.fcmToken}
                        </code>
                        <button
                          onClick={() => handleCopyText(selectedDetailUser.fcmToken || '', 'FCM')}
                          className="text-primary hover:bg-primary/10 p-1 rounded transition-colors shrink-0"
                          title="Copy FCM Token"
                        >
                          {copiedText === 'FCM' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Administrative Control Actions */}
              {selectedDetailUser.role !== "admin" && (
                <div className="border-t border-border/50 pt-4 space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5 text-destructive animate-pulse" /> {t("admin.users.adminControls")}
                  </h4>

                  <div className="bg-muted/15 dark:bg-muted/5 border border-border/40 rounded-xl p-3.5 space-y-3">
                    <div className="text-[11px] text-muted-foreground">
                      {t("admin.users.adminControlsDesc")}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* LIFT ACTIONS */}
                      {selectedDetailUser.isBlocked && (
                        <button
                          onClick={() => handleLiftPermanentBan(selectedDetailUser)}
                          className="col-span-2 w-full px-3.5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" /> {t("admin.users.liftPermBan")}
                        </button>
                      )}

                      {selectedDetailUser.cooldownUntil && selectedDetailUser.cooldownUntil.toDate() > new Date() && (
                        <button
                          onClick={() => handleLiftCooldown(selectedDetailUser)}
                          className="col-span-2 w-full px-3.5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" /> {t("admin.users.liftCooldown")}
                        </button>
                      )}

                      {/* BAN ACTIONS */}
                      {!selectedDetailUser.isBlocked && (
                        <button
                          onClick={() => handleApplyPermanentBan(selectedDetailUser)}
                          className="w-full px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                          <span>{t("admin.users.permBan")}</span>
                        </button>
                      )}

                      {/* COOLDOWN ACTION */}
                      {!selectedDetailUser.isBlocked && (
                        <button
                          onClick={() => triggerApplyCooldownPrompt(selectedDetailUser)}
                          className="w-full px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{t("admin.users.applyCooldown")}</span>
                        </button>
                      )}

                      {/* EDIT ACTION */}
                      <button
                        onClick={() => {
                          setEditUser(selectedDetailUser);
                          setEditData({
                            role: selectedDetailUser.role,
                            displayName: selectedDetailUser.displayName,
                            phoneNumber: selectedDetailUser.phoneNumber,
                            matrixNumber: selectedDetailUser.matrixNumber,
                            practicum: selectedDetailUser.practicum
                          });
                          setSelectedDetailUser(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t("admin.users.editProfile")}</span>
                      </button>

                      {/* DELETE ACTION */}
                      <button
                        onClick={() => {
                          handleDelete(selectedDetailUser.uid);
                          setSelectedDetailUser(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-red-800 hover:bg-red-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t("admin.users.deleteUser")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-muted/10 border-t border-border/50 flex justify-between items-center shrink-0">
              <button
                onClick={() => handleCopyText(selectedDetailUser.uid, 'UID')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary dark:text-blue-500 hover:bg-primary/10 rounded-xl transition-all active:scale-95 hover:cursor-pointer justify-center"
              >
                {copiedText === 'UID' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 animate-in zoom-in" />
                    <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t("admin.users.copyUid")}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setSelectedDetailUser(null)}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                {t("admin.users.close")}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
