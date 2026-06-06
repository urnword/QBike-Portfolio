"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "next-themes";
import { 
  ShieldCheck, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  MapPin, 
  Globe, 
  UserCheck, 
  Clock, 
  ArrowLeft,
  Sun,
  Moon,
  Lock,
  Trash2,
  Mail
} from "lucide-react";

interface StandalonePolicyViewProps {
  initialTab: "terms" | "privacy";
}

export function StandalonePolicyView({ initialTab }: StandalonePolicyViewProps) {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { theme, setTheme } = useTheme();
  
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">(initialTab);
  const [mounted, setMounted] = useState(false);

  // Sync active tab with prop changes (e.g. browser back/forward navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Handle hydration rendering safety
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTabChange = (tab: "terms" | "privacy") => {
    setActiveTab(tab);
    router.push(`/auth/${tab}`);
  };

  const handleBack = () => {
    if (isAuthenticated) {
      router.push("/dashboard");
    } else {
      router.push("/auth");
    }
  };

  const content = {
    en: {
      title: "Legal Agreements",
      termsTitle: "Terms of Service",
      privacyTitle: "Privacy Policy",
      backToLogin: "Back to Login",
      backToDashboard: "Back to Dashboard",
      subtitle: "Please read our operating terms and privacy compliance policies before using QBike.",
      terms: {
        header: "QBike System Terms of Service",
        intro: "By accessing or using the QBike platform, you represent that you are an authorized student or staff member of Kolej Matrikulasi Johor and agree to be bound by these Terms of Service.",
        sections: [
          {
            title: "1. Eligible Domain & User Access",
            icon: UserCheck,
            color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
            text: "Access to QBike is strictly restricted to active students and staff members who possess a valid DELIMa email address (@moe-dl.edu.my). Any attempt to register using personal email domains will be rejected by our secure domain verification gateway."
          },
          {
            title: "2. Rule of Single Possession",
            icon: CheckCircle,
            color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/30",
            text: "To ensure fair access to college resources, a strict single-possession rule is enforced. You may only have one (1) active bicycle booking at any given time. Booking multiple bikes, holding duplicate active bookings, or loaning your account to another student is strictly prohibited."
          },
          {
            title: "3. Safe Custody & Ride Inspection",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
            text: "You are solely responsible for inspecting the bicycle for any structural defects, low tires, or brake issues before finalizing the collection. Once collected, the bicycle remains under your full custody and legal responsibility until safely locked at a designated station."
          },
          {
            title: "4. Late Returns & Automatic Block Policy",
            icon: Clock,
            color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30",
            text: "All bicycles must be returned to a designated college station within the maximum booking time. Late returns past the automatic grace period will log a late strike. Accumulating the system-defined limit of strikes will result in automatic temporary or permanent lockout from booking services."
          },
          {
            title: "5. Station GPS Validation",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/30",
            text: "To prevent abandonment of college assets, pickup and return actions are verified using secure server-side GPS boundaries. You must enable location services on your device to finalize your rental. Attempting to spoof coordinates or bypass GPS checks is a severe policy violation."
          }
        ]
      },
      privacy: {
        header: "Privacy Policy (PDPA 2010)",
        intro: "This Privacy Policy details how the QBike platform collects, stores, and protects your personal data in compliance with the Personal Data Protection Act 2010 (PDPA) of Malaysia.",
        sections: [
          {
            title: "1. Data Collection",
            icon: FileText,
            color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
            text: "We collect specific personal data required to administer the booking service, including: Full Name, Matrix Number, DELIMa email address (@moe-dl.edu.my), system transaction history (rental logs), and temporary GPS coordinates during checkout/return."
          },
          {
            title: "2. Primary Purpose of Processing",
            icon: UserCheck,
            color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/30",
            text: "Your data is processed strictly for: managing bike bookings, verifying college enrollment, maintaining live inventory counts, auditing system activity, enforcing automatic late penalties, and securing college assets against vandalism or theft."
          },
          {
            title: "3. Location Telemetry Controls",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/30",
            text: "Your privacy is paramount. QBike does NOT track your device location in the background or during your ride. GPS telemetry is queried and validated locally on your device ONLY at the exact moments of picking up and returning the bicycle at the station."
          },
          {
            title: "4. Data Storage & Hosting Region",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
            text: "All collected user records are securely stored within Google Firebase Cloud Databases. To optimize latency and ensure compliance with institutional security, our servers are hosted in the asia-southeast1 region (Singapore) with encrypted data-at-rest protocols."
          },
          {
            title: "5. No Third-Party Disclosure",
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
            text: "We do not sell, rent, or lease your personal information. Data is only accessible to authorized college administrators. In cases of severe vandalism, theft, or physical injury, transaction logs and identities may be forwarded directly to HEP."
          },
          {
            title: "6. Google OAuth & User Data Disclosure",
            icon: Lock,
            color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30",
            text: "When you authenticate via Google Sign-In, QBike accesses your Google profile information (specifically your email, full name, and profile picture). Our application's use and transfer of information received from Google APIs to any other app will adhere to Google API Services User Data Policy, including the Limited Use requirements."
          },
          {
            title: "7. User Rights & Account Deletion",
            icon: Trash2,
            color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30",
            text: "You have the right to access, correct, or request deletion of your personal data. If you wish to permanently delete your account and associated transaction history from our system, you may submit a request by contacting the administrator at bm-0862@moe-dl.edu.my. Your data will be deleted within 7 working days."
          },
          {
            title: "8. Contact & Data Protection Officer",
            icon: Mail,
            color: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/30",
            text: "For any inquiries, feedback, or complaints regarding your personal data under the PDPA 2010, please contact our administrative representative at Kolej Matrikulasi Johor or email bm-0862@moe-dl.edu.my."
          }
        ]
      }
    },
    ms: {
      title: "Perjanjian Undang-undang",
      termsTitle: "Syarat Perkhidmatan",
      privacyTitle: "Polisi Privasi",
      backToLogin: "Kembali ke Log Masuk",
      backToDashboard: "Kembali ke Papan Pemuka",
      subtitle: "Sila baca syarat pengendalian dan polisi privasi kami sebelum menggunakan platform QBike.",
      terms: {
        header: "Syarat Perkhidmatan Sistem QBike",
        intro: "Dengan mengakses atau menggunakan platform QBike, anda mengesahkan bahawa anda adalah pelajar atau kakitangan Kolej Matrikulasi Johor yang sah dan bersetuju untuk terikat dengan Syarat Perkhidmatan ini.",
        sections: [
          {
            title: "1. Domain Sah & Akses Pengguna",
            icon: UserCheck,
            color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
            text: "Akses ke QBike dihadkan secara ketat kepada pelajar dan kakitangan aktif yang mempunyai e-mel DELIMa (@moe-dl.edu.my) yang sah. Sebarang cubaan mendaftar menggunakan e-mel peribadi akan ditolak secara automatik."
          },
          {
            title: "2. Peraturan Milikan Tunggal",
            icon: CheckCircle,
            color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/30",
            text: "Bagi memastikan pengagihan sumber kolej yang adil, peraturan milikan tunggal dikuatkuasakan dengan ketat. Anda hanya dibenarkan mempunyai satu (1) tempahan basikal aktif pada satu masa. Menempah lebih dari satu basikal atau meminjamkan akaun kepada pihak lain adalah dilarang keras."
          },
          {
            title: "3. Penjagaan Selamat & Pemeriksaan Fizikal",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
            text: "Anda bertanggungjawab sepenuhnya untuk memeriksa keadaan fizikal basikal (tayar, brek, dan rangka) sebelum mengambilnya. Sebaik sahaja diambil, basikal berada di bawah jagaan dan tanggungjawab undang-undang anda sepenuhnya sehingga ia dikunci semula di stesen."
          },
          {
            title: "4. Pemulangan Lewat & Polisi Sekatan Automatik",
            icon: Clock,
            color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30",
            text: "Semua basikal mesti dipulangkan ke stesen kolej yang ditetapkan sebelum tempoh tamat. Kelewatan melebihi had masa penangguhan (grace period) akan mencetuskan amaran teguran penalti. Pengumpulan teguran berulang akan menyekat akaun anda secara automatik."
          },
          {
            title: "5. Pengesahan Lokasi GPS Stesen",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/30",
            text: "Bagi mengelakkan isu basikal ditinggalkan di luar stesen, proses ambil dan pulang disahkan menggunakan koordinat GPS peranti. Anda perlu mengaktifkan kebenaran lokasi bagi membolehkan tempahan diselesaikan. Pengubahsuaian lokasi atau pintasan GPS adalah pelanggaran polisi yang serius."
          }
        ]
      },
      privacy: {
        header: "Polisi Privasi (Kepatuhan PDPA 2010)",
        intro: "Polisi Privasi ini menjelaskan bagaimana platform QBike mengumpul, menyimpan, dan melindungi data peribadi anda selaras dengan Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia.",
        sections: [
          {
            title: "1. Pengumpulan Data Peribadi",
            icon: FileText,
            color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
            text: "Kami mengumpul maklumat peribadi tertentu yang penting untuk pentadbiran sistem, termasuk: Nama Penuh, Nombor Matrik, e-mel DELIMa (@moe-dl.edu.my), rekod transaksi (log tempahan), dan koordinat GPS sementara semasa proses ambil/pulang."
          },
          {
            title: "2. Tujuan Utama Pemprosesan Data",
            icon: UserCheck,
            color: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/30",
            text: "Data anda digunakan khusus untuk: menguruskan sewaan basikal, mengesahkan status pendaftaran pelajar, mengemas kini inventori semasa, mengesan log aktiviti, menguatkuasaan denda/sekatan automatik, dan melindungi aset kolej."
          },
          {
            title: "3. Kawalan Privasi Lokasi GPS",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/30",
            text: "Privasi anda amat penting. QBike TIDAK menjejaki lokasi peranti anda di latar belakang atau sepanjang perjalanan anda. GPS hanya disemak dan disahkan secara tempatan pada peranti anda pada saat anda mengambil dan mengembalikan basikal di stesen sahaja."
          },
          {
            title: "4. Lokasi & Keselamatan Pelayan",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
            text: "Semua pangkalan data disimpan dengan selamat di Google Firebase. Bagi mengekalkan kepatuhan keselamatan kolej serta kelajuan akses, pelayan kami dihoskan di rantau asia-southeast1 (Singapura) dengan protokol keselamatan data yang disulitkan."
          },
          {
            title: "5. Tiada Pendedahan Kepada Pihak Ketiga",
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
            text: "Kami tidak menjual, menyewa atau berkongsi maklumat peribadi anda dengan mana-mana entiti luar. Data hanya boleh diakses oleh pentadbir kolej yang diberi kuasa. Kes vandalisme teruk, kecurian, atau kecederaan akan dirujuk terus kepada HEP bersama log transaksi."
          },
          {
            title: "6. Kebenaran Google OAuth & Pendedahan Data",
            icon: Lock,
            color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30",
            text: "Apabila anda log masuk menggunakan Google Sign-In, QBike mengakses maklumat profil Google anda (khususnya e-mel, nama penuh, dan gambar profil). Penggunaan dan pemindahan maklumat Google API oleh aplikasi kami ke mana-mana aplikasi lain akan mematuhi Polisi Data Pengguna Perkhidmatan Google API, termasuk keperluan Penggunaan Terhad (Limited Use)."
          },
          {
            title: "7. Hak Pengguna & Pemadaman Akaun",
            icon: Trash2,
            color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30",
            text: "Anda mempunyai hak untuk mengakses, membetulkan, atau meminta pemadaman data peribadi anda. Jika anda ingin memadamkan akaun anda dan sejarah transaksi berkaitan secara kekal daripada sistem kami, anda boleh menghantar permohonan dengan menghubungi pentadbir di bm-0862@moe-dl.edu.my. Data anda akan dipadamkan dalam tempoh 7 hari bekerja."
          },
          {
            title: "8. Hubungan & Pegawai Perlindungan Data",
            icon: Mail,
            color: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/30",
            text: "Untuk sebarang pertanyaan, maklum balas, atau aduan mengenai data peribadi anda di bawah PDPA 2010, sila hubungi wakil pentadbir kami di Kolej Matrikulasi Johor atau e-mel bm-0862@moe-dl.edu.my."
          }
        ]
      }
    }
  };

  const activeLang = language === "ms" ? "ms" : "en";
  const t = content[activeLang];
  const activeTabContent = activeTab === "terms" ? t.terms : t.privacy;

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 relative selection:bg-primary/20">
      
      {/* Container Cards Wrapper */}
      <div className="w-full max-w-3xl flex flex-col space-y-6">
        
        {/* Navigation & Utilities Header Row */}
        <div className="flex items-center justify-between gap-4 w-full shrink-0">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold border border-border bg-card rounded-xl hover:bg-muted/50 transition-all text-foreground cursor-pointer shadow-sm active:scale-95"
            title="Go Back"
          >
            <ArrowLeft className="h-4 w-4 text-primary" />
            <span>{isAuthenticated ? t.backToDashboard : t.backToLogin}</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(language === "en" ? "ms" : "en")}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border bg-card rounded-xl hover:bg-muted/50 transition-colors text-foreground cursor-pointer shadow-sm h-9"
              title="Switch Language / Tukar Bahasa"
            >
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>{language === "en" ? "EN" : "BM"}</span>
            </button>

            {/* Theme Switcher */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-all active:scale-95 shadow-sm flex items-center justify-center cursor-pointer h-9 w-9"
              title="Toggle Theme"
            >
              <Sun className="w-4 h-4 hidden dark:block" />
              <Moon className="w-4 h-4 block dark:hidden" />
            </button>
          </div>
        </div>

        {/* Brand & Header Section */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm text-center relative overflow-hidden">
          {/* Decorative subtle background gradient */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl"></div>
          
          <h1 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight mb-2 flex items-center justify-center gap-2">
            <span>QBike</span>
            <span className="text-[10px] sm:text-xs py-0.5 sm:py-1 px-3 rounded-full bg-primary/10 text-primary font-semibold tracking-wider uppercase">
              {t.title}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border border-border bg-card p-1 rounded-2xl gap-1.5 shadow-sm shrink-0">
          <button
            onClick={() => handleTabChange("terms")}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "terms"
                ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.01]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.termsTitle}</span>
          </button>
          <button
            onClick={() => handleTabChange("privacy")}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "privacy"
                ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.01]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.privacyTitle}</span>
          </button>
        </div>

        {/* Rendered Policy Content Area */}
        <div key={activeTab} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Section Introduction */}
          <div className="p-5 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
            <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
              {activeTabContent.header}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {activeTabContent.intro}
            </p>
          </div>

          {/* Section Items */}
          <div className="space-y-4">
            {activeTabContent.sections.map((section, idx) => {
              const IconComponent = section.icon;
              return (
                <div 
                  key={idx} 
                  className="flex flex-col sm:flex-row sm:gap-5 p-5 bg-card rounded-2xl border border-border hover:border-primary/30 transition-all gap-4 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-3.5 sm:block shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${section.color}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-foreground sm:hidden">
                      {section.title}
                    </h4>
                  </div>
                  <div className="space-y-1.5 w-full">
                    <h4 className="text-sm sm:text-base font-bold text-foreground hidden sm:block">
                      {section.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {section.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Page Footer Legal Notice */}
        <div className="pt-6 pb-12 text-center text-xs text-muted-foreground/60 border-t border-border/60">
          <div>© 2026 Zaid Izzuddin. All Rights Reserved.</div>
          <div className="mt-1 font-medium">Kolej Matrikulasi Johor (KMJ)</div>
        </div>

      </div>
    </div>
  );
}
