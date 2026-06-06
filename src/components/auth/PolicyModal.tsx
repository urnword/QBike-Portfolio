"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { 
  X, 
  ShieldCheck, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  MapPin, 
  Globe, 
  UserCheck, 
  Clock,
  Lock,
  Trash2,
  Mail 
} from "lucide-react";

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "terms" | "privacy";
}

export function PolicyModal({ isOpen, onClose, defaultTab = "terms" }: PolicyModalProps) {
  const { language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">(defaultTab);

  if (!isOpen) return null;

  const content = {
    en: {
      title: "Legal Agreements",
      termsTitle: "Terms of Service",
      privacyTitle: "Privacy Policy",
      close: "Close",
      subtitle: "Please read our operating terms and privacy compliance policies before using QBike.",
      terms: {
        header: "QBike System Terms of Service",
        intro: "By accessing or using the QBike platform, you represent that you are an authorized student or staff member of Kolej Matrikulasi Johor and agree to be bound by these Terms of Service.",
        sections: [
          {
            title: "1. Eligible Domain & User Access",
            icon: UserCheck,
            color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
            text: "Access to QBike is strictly restricted to active students and staff members who possess a valid DELIMa email address (@moe-dl.edu.my). Any attempt to register using personal email domains will be rejected by our secure domain verification gateway."
          },
          {
            title: "2. Rule of Single Possession",
            icon: CheckCircle,
            color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
            text: "To ensure fair access to college resources, a strict single-possession rule is enforced. You may only have one (1) active bicycle booking at any given time. Booking multiple bikes, holding duplicate active bookings, or loaning your account to another student is strictly prohibited."
          },
          {
            title: "3. Safe Custody & Ride Inspection",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
            text: "You are solely responsible for inspecting the bicycle for any structural defects, low tires, or brake issues before finalizing the collection. Once collected, the bicycle remains under your full custody and legal responsibility until safely locked at a designated station."
          },
          {
            title: "4. Late Returns & Automatic Block Policy",
            icon: Clock,
            color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
            text: "All bicycles must be returned to a designated college station within the maximum booking time. Late returns past the automatic grace period will log a late strike. Accumulating the system-defined limit of strikes will result in automatic temporary or permanent lockout from booking services."
          },
          {
            title: "5. Station GPS Validation",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
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
            color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
            text: "We collect specific personal data required to administer the booking service, including: Full Name, Matrix Number, DELIMa email address (@moe-dl.edu.my), system transaction history (rental logs), and temporary GPS coordinates during checkout/return."
          },
          {
            title: "2. Primary Purpose of Processing",
            icon: UserCheck,
            color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
            text: "Your data is processed strictly for: managing bike bookings, verifying college enrollment, maintaining live inventory counts, auditing system activity, enforcing automatic late penalties, and securing college assets against vandalism or theft."
          },
          {
            title: "3. Location Telemetry Controls",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
            text: "Your privacy is paramount. QBike does NOT track your device location in the background or during your ride. GPS telemetry is queried and validated locally on your device ONLY at the exact moments of picking up and returning the bicycle at the station."
          },
          {
            title: "4. Data Storage & Hosting Region",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
            text: "All collected user records are securely stored within Google Firebase Cloud Databases. To optimize latency and ensure compliance with institutional security, our servers are hosted in the asia-southeast1 region (Singapore) with encrypted data-at-rest protocols."
          },
          {
            title: "5. No Third-Party Disclosure",
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
            text: "We do not sell, rent, or lease your personal information. Data is only accessible to authorized college administrators. In cases of severe vandalism, theft, or physical injury, transaction logs and identities may be forwarded directly to HEP."
          },
          {
            title: "6. Google OAuth & User Data Disclosure",
            icon: Lock,
            color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30",
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
      close: "Tutup",
      subtitle: "Sila baca syarat pengendalian dan polisi privasi kami sebelum menggunakan platform QBike.",
      terms: {
        header: "Syarat Perkhidmatan Sistem QBike",
        intro: "Dengan mengakses atau menggunakan platform QBike, anda mengesahkan bahawa anda adalah pelajar atau kakitangan Kolej Matrikulasi Johor yang sah dan bersetuju untuk terikat dengan Syarat Perkhidmatan ini.",
        sections: [
          {
            title: "1. Domain Sah & Akses Pengguna",
            icon: UserCheck,
            color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
            text: "Akses ke QBike dihadkan secara ketat kepada pelajar dan kakitangan aktif yang mempunyai e-mel DELIMa (@moe-dl.edu.my) yang sah. Sebarang cubaan mendaftar menggunakan e-mel peribadi akan ditolak secara automatik."
          },
          {
            title: "2. Peraturan Milikan Tunggal",
            icon: CheckCircle,
            color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
            text: "Bagi memastikan pengagihan sumber kolej yang adil, peraturan milikan tunggal dikuatkuasakan dengan ketat. Anda hanya dibenarkan mempunyai satu (1) tempahan basikal aktif pada satu masa. Menempah lebih dari satu basikal atau meminjamkan akaun kepada pihak lain adalah dilarang keras."
          },
          {
            title: "3. Penjagaan Selamat & Pemeriksaan Fizikal",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
            text: "Anda bertanggungjawab sepenuhnya untuk memeriksa keadaan fizikal basikal (tayar, brek, dan rangka) sebelum mengambilnya. Sebaik sahaja diambil, basikal berada di bawah jagaan dan tanggungjawab undang-undang anda sepenuhnya sehingga ia dikunci semula di stesen."
          },
          {
            title: "4. Pemulangan Lewat & Polisi Sekatan Automatik",
            icon: Clock,
            color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
            text: "Semua basikal mesti dipulangkan ke stesen kolej yang ditetapkan sebelum tempoh tamat. Kelewatan melebihi had masa penangguhan (grace period) akan mencetuskan amaran teguran penalti. Pengumpulan teguran berulang akan menyekat akaun anda secara automatik."
          },
          {
            title: "5. Pengesahan Lokasi GPS Stesen",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
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
            color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
            text: "Kami mengumpul maklumat peribadi tertentu yang penting untuk pentadbiran sistem, termasuk: Nama Penuh, Nombor Matrik, e-mel DELIMa (@moe-dl.edu.my), rekod transaksi (log tempahan), dan koordinat GPS sementara semasa proses ambil/pulang."
          },
          {
            title: "2. Tujuan Utama Pemprosesan Data",
            icon: UserCheck,
            color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
            text: "Data anda digunakan khusus untuk: menguruskan sewaan basikal, mengesahkan status pendaftaran pelajar, mengemas kini inventori semasa, mengesan log aktiviti, menguatkuasaan denda/sekatan automatik, dan melindungi aset kolej."
          },
          {
            title: "3. Kawalan Privasi Lokasi GPS",
            icon: MapPin,
            color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
            text: "Privasi anda amat penting. QBike TIDAK menjejaki lokasi peranti anda di latar belakang atau sepanjang perjalanan anda. GPS hanya disemak dan disahkan secara tempatan pada peranti anda pada saat anda mengambil dan mengembalikan basikal di stesen sahaja."
          },
          {
            title: "4. Lokasi & Keselamatan Pelayan",
            icon: ShieldCheck,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
            text: "Semua pangkalan data disimpan dengan selamat di Google Firebase. Bagi mengekalkan kepatuhan keselamatan kolej serta kelajuan akses, pelayan kami dihoskan di rantau asia-southeast1 (Singapura) dengan protokol keselamatan data yang disulitkan."
          },
          {
            title: "5. Tiada Pendedahan Kepada Pihak Ketiga",
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
            text: "Kami tidak menjual, menyewa atau berkongsi maklumat peribadi anda dengan mana-mana entiti luar. Data hanya boleh diakses oleh pentadbir kolej yang diberi kuasa. Kes vandalisme teruk, kecurian, atau kecederaan akan dirujuk terus kepada HEP bersama log transaksi."
          },
          {
            title: "6. Kebenaran Google OAuth & Pendedahan Data",
            icon: Lock,
            color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30",
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

  const t = content[language];
  const activeTabContent = activeTab === "terms" ? t.terms : t.privacy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl flex flex-col max-h-[80vh] overflow-hidden z-10 animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border/80 shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <span>QBike</span>
            <span className="text-[10px] sm:text-xs py-0.5 sm:py-1 px-2 rounded-full bg-primary/10 text-primary font-semibold tracking-wider">
              {t.title}
            </span>
          </h2>
          <div className="flex items-center justify-between gap-4 mt-1.5">
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-normal">
              {t.subtitle}
            </p>
            <button
              onClick={() => setLanguage(language === "en" ? "ms" : "en")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold border border-border rounded-lg hover:bg-muted/50 transition-colors text-foreground h-8 shrink-0"
              title="Switch Language / Tukar Bahasa"
            >
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>{language === "en" ? "EN" : "BM"}</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-muted/30 p-1 gap-1 shrink-0">
          <button
            onClick={() => setActiveTab("terms")}
            className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "terms"
                ? "bg-card text-primary shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">{t.termsTitle}</span>
          </button>
          <button
            onClick={() => setActiveTab("privacy")}
            className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "privacy"
                ? "bg-card text-primary shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">{t.privacyTitle}</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar">
          
          {/* Section Introduction */}
          <div className="p-3.5 sm:p-4 bg-muted/40 border border-border/50 rounded-lg sm:rounded-xl">
            <h3 className="text-sm sm:text-base font-bold text-foreground mb-1">
              {activeTabContent.header}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {activeTabContent.intro}
            </p>
          </div>

          {/* Section Items */}
          <div className="space-y-3 sm:space-y-4">
            {activeTabContent.sections.map((section, idx) => {
              const IconComponent = section.icon;
              return (
                <div 
                  key={idx} 
                  className="flex flex-col sm:flex-row sm:gap-4 p-3.5 sm:p-4 rounded-lg sm:rounded-xl border border-border hover:bg-muted/20 transition-all gap-3"
                >
                  <div className="flex items-center gap-3 sm:block shrink-0">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 shadow-sm ${section.color}`}>
                      <IconComponent className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-foreground sm:hidden">
                      {section.title}
                    </h4>
                  </div>
                  <div className="space-y-1 w-full">
                    <h4 className="text-xs sm:text-sm font-bold text-foreground hidden sm:block">
                      {section.title}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                      {section.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 sm:py-2 bg-primary hover:bg-primary/95 text-white font-bold rounded-lg sm:rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-primary/10 active:scale-[0.98]"
          >
            {t.close}
          </button>
        </div>

      </div>
    </div>
  );
}
