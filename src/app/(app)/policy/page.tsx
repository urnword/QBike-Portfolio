"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { 
  ShieldAlert, 
  Clock, 
  MapPin, 
  Settings2, 
  Info, 
  Bike, 
  Calendar, 
  Ban, 
  Timer,
  BookOpen,
  FileText,
  AlertTriangle
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { PolicySingleton } from "@/types";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

// Helper to translate short days to English full day names
const getFullDayNameEn = (abbr: string): string => {
  const mapping: Record<string, string> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday"
  };
  return mapping[abbr] || abbr;
};

// Helper to translate short days to Malay full day names
const getFullDayNameMs = (abbr: string): string => {
  const mapping: Record<string, string> = {
    Mon: "Isnin",
    Tue: "Selasa",
    Wed: "Rabu",
    Thu: "Khamis",
    Fri: "Jumaat",
    Sat: "Sabtu",
    Sun: "Ahad"
  };
  return mapping[abbr] || abbr;
};

// Formatter to turn days arrays into natural English sentences
const formatOperatingDaysSentenceEn = (days: string[]): string => {
  if (!days || days.length === 0) return "no active days";
  // Strict check for exactly Mon-Fri
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const isWeekdaysOnly = days.length === 5 && weekdays.every(d => days.includes(d));
  if (isWeekdaysOnly) {
    return "weekdays (Monday through Friday)";
  }
  if (days.length === 7) {
    return "every day of the week (Monday through Sunday)";
  }
  const fullNames = days.map(getFullDayNameEn);
  if (fullNames.length === 1) return fullNames[0] + "s";
  if (fullNames.length === 2) return `${fullNames[0]}s and ${fullNames[1]}s`;
  return fullNames.slice(0, -1).map(d => d + "s").join(", ") + ", and " + fullNames[fullNames.length - 1] + "s";
};

// Formatter to turn days arrays into natural Malay sentences
const formatOperatingDaysSentenceMs = (days: string[]): string => {
  if (!days || days.length === 0) return "tiada hari aktif";
  // Strict check for exactly Mon-Fri
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const isWeekdaysOnly = days.length === 5 && weekdays.every(d => days.includes(d));
  if (isWeekdaysOnly) {
    return "hari bekerja (Isnin hingga Jumaat)";
  }
  if (days.length === 7) {
    return "setiap hari dalam seminggu (Isnin hingga Ahad)";
  }
  const fullNames = days.map(getFullDayNameMs);
  if (fullNames.length === 1) return "hari " + fullNames[0];
  if (fullNames.length === 2) return `hari ${fullNames[0]} dan ${fullNames[1]}`;
  return "hari " + fullNames.slice(0, -1).join(", ") + ", dan " + fullNames[fullNames.length - 1];
};

// Formatter for standard time representations (e.g. "0800" to "8:00 AM")
const formatTimeString = (timeStr: string): string => {
  if (!timeStr || timeStr.length !== 4) return timeStr;
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = timeStr.substring(2, 4);
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutes} ${ampm}`;
};

const policyPageTranslations = {
  en: {
    title: "System Policies",
    home: "Home",
    nav: "Policy",
    unavailable: "Policy guidelines are temporarily unavailable. Please try again later.",
    appealTitle: "Policy Violations & Appeals",
    appealDesc: "Automatic lockouts or penalties are issued strictly for late returns or geofence bypass attempts. If you believe your penalty was applied in error, submit an appeal.",
    appealBtn: "Submit Conduct Appeal",
  },
  ms: {
    title: "Polisi Sistem",
    home: "Utama",
    nav: "Polisi",
    unavailable: "Polisi sistem tidak tersedia buat sementara waktu. Sila cuba lagi nanti.",
    appealTitle: "Pelanggaran Polisi & Rayuan",
    appealDesc: "Sekatan automatik atau denda dikenakan dengan tegas untuk pemulangan lewat atau cubaan pintasan geofence. Sila kemukakan rayuan jika anda percaya denda ini silap.",
    appealBtn: "Hantar Rayuan Tatatertib",
  }
};

export default function PolicyPage() {
  const { language } = useLanguage();
  const t = policyPageTranslations[language];
  const [policy, setPolicy] = useState<PolicySingleton | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "policy", "current"), (snap) => {
      if (snap.exists()) {
        setPolicy(snap.data() as PolicySingleton);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching policy:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Info className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p>{t.unavailable}</p>
      </div>
    );
  }

  // Pre-formatted localized operational metrics
  const operatingDaysSentence = language === "en" 
    ? formatOperatingDaysSentenceEn(policy.operatingDays) 
    : formatOperatingDaysSentenceMs(policy.operatingDays);

  const defaultOpen = formatTimeString(policy.operatingHours.default.open);
  const defaultClose = formatTimeString(policy.operatingHours.default.close);
  
  // Saturday & Sunday override check for Weekend Hours dynamic display
  const isSatActive = policy.operatingDays.includes("Sat");
  const isSunActive = policy.operatingDays.includes("Sun");

  const satHours = policy.operatingHours.overrides["Sat"] || { open: "0800", close: "1200" };
  const satOpen = formatTimeString(satHours.open);
  const satClose = formatTimeString(satHours.close);

  const sunHours = policy.operatingHours.overrides["Sun"] || { open: "0800", close: "1200" };
  const sunOpen = formatTimeString(sunHours.open);
  const sunClose = formatTimeString(sunHours.close);

  // Dynamic filtering of duration options to ensure none exceed the max allowable duration
  const allowedDurations = policy.bookingDurationOptions.filter(d => d <= policy.maxBookingDuration);

  const durationOptions = allowedDurations
    .map(d => `${d} ${language === "en" ? "minutes" : "minit"}`)
    .join(", ");

  const durationOptionsMalay = allowedDurations
    .map(d => `${d} minit`)
    .join(", ");

  // Correctly calculate accumulated late return penalty locks on top of standard return cooldown
  const totalLateCooldown = policy.standardCooldownDays + policy.lateReturnCooldownDays;

  // Build dynamic weekend sentence to gracefully support any Saturday/Sunday combination
  const renderWeekendSentence = () => {
    if (language === "en") {
      if (isSatActive && isSunActive) {
        return <><strong>Weekend Hours:</strong> Saturdays operate from <strong>{satOpen} to {satClose}</strong>, and Sundays operate from <strong>{sunOpen} to {sunClose}</strong>.</>;
      }
      if (isSatActive) {
        return <><strong>Weekend Hours:</strong> Saturdays operate on standard hours from <strong>{satOpen} until {satClose}</strong> in the afternoon, while Sundays are strictly closed.</>;
      }
      if (isSunActive) {
        return <><strong>Weekend Hours:</strong> Sundays operate on standard hours from <strong>{sunOpen} until {sunClose}</strong> in the afternoon, while Saturdays are strictly closed.</>;
      }
      return <><strong>Weekend Hours:</strong> The booking service is strictly closed on Saturdays and Sundays.</>;
    } else {
      if (isSatActive && isSunActive) {
        return <><strong>Waktu Hujung Minggu:</strong> Hari Sabtu beroperasi dari <strong>{satOpen} hingga {satClose}</strong>, dan hari Ahad beroperasi dari <strong>{sunOpen} hingga {sunClose}</strong>.</>;
      }
      if (isSatActive) {
        return <><strong>Waktu Hujung Minggu:</strong> Hari Sabtu beroperasi dari <strong>{satOpen} pagi hingga {satClose}</strong> tengah hari, manakala hari Ahad ditutup sepenuhnya.</>;
      }
      if (isSunActive) {
        return <><strong>Waktu Hujung Minggu:</strong> Hari Ahad beroperasi dari <strong>{sunOpen} pagi hingga {sunClose}</strong> tengah hari, manakala hari Sabtu ditutup sepenuhnya.</>;
      }
      return <><strong>Waktu Hujung Minggu:</strong> Tempahan dan pengambilan basikal ditutup sepenuhnya pada hari Sabtu dan Ahad.</>;
    }
  };

  const sectionsData = [
    {
      id: "eligibility",
      icon: ShieldAlert,
      title: language === "en" ? "Account Eligibility & Access Control" : "Kelayakan Akaun & Kawalan Akses",
      iconBgClass: "bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/10",
      iconTextClass: "text-purple-600 dark:text-purple-400",
      points: language === "en" ? [
        <><strong>Authorized Domain Restriction:</strong> Access to the QBike platform is strictly restricted to active students and authorized staff of the college using verified DELIMa email addresses ending with the <strong>@moe-dl.edu.my</strong> domain.</>,
        <><strong>Profile Verification Controls:</strong> Registration requires authenticating via Google and completing your profile with your legal <strong>Full Name</strong>, student <strong>Matrix Number</strong>, and your current <strong>Practicum</strong>. To prevent identity sharing, this information cannot be changed once verified.</>,
        <><strong>Administrative Authority:</strong> The college administration reserves the right to disable logins and suspend platform access at any time for scheduled server maintenance or safety reviews.</>
      ] : [
        <><strong>Sekatan Domain Dibenarkan:</strong> Akses ke platform QBike dihadkan secara ketat kepada pelajar dan kakitangan aktif menggunakan alamat e-mel DELIMa yang disahkan berakhir dengan domain <strong>@moe-dl.edu.my</strong>.</>,
        <><strong>Pengesahan Profil Pengguna:</strong> Pendaftaran memerlukan log masuk Google dan melengkapkan profil dengan <strong>Nama Penuh</strong> rasmi, <strong>Nombor Matrik</strong> pelajar, serta <strong>Praktikum</strong> anda. Maklumat tidak boleh diubah setelah disahkan untuk mengelakkan perkongsian identiti.</>,
        <><strong>Kuasa Pentadbiran Kolej:</strong> Pihak pentadbiran berhak menyahaktifkan log masuk akaun dan menggantung perkhidmatan pada bila-bila masa semasa penyelenggaraan pelayan atau semakan keselamatan.</>
      ]
    },
    {
      id: "schedule",
      icon: Calendar,
      title: language === "en" ? "System Operating Schedule" : "Jadual Waktu Operasi & Ketersediaan",
      iconBgClass: "bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/10",
      iconTextClass: "text-amber-600 dark:text-amber-500",
      points: [
        <><strong>Weekly Operation Days:</strong> The QBike booking service is active on <strong>{operatingDaysSentence}</strong>.</>,
        <><strong>Standard Daily Hours:</strong> Bookings and bike collections are open starting from <strong>{defaultOpen}</strong> in the morning and close strictly at <strong>{defaultClose}</strong> in the evening.</>,
        renderWeekendSentence(),
        <><strong>Platform Curfew Limits:</strong> No riding sessions may be started or active outside these operational periods. Currently, system reservations are <strong>{policy.isBookingOpen ? (language === "en" ? "fully operational and open" : "beroperasi sepenuhnya dan dibuka") : (language === "en" ? "temporarily closed to students" : "ditutup sementara kepada pelajar")}</strong>.</>
      ]
    },
    {
      id: "booking-limits",
      icon: Bike,
      title: language === "en" ? "Booking Sessions & Fair-Use Limits" : "Sesi Tempahan & Had Penggunaan Adil",
      iconBgClass: "bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/10",
      iconTextClass: "text-emerald-600 dark:text-emerald-500",
      points: language === "en" ? [
        <><strong>Single Possession Rule:</strong> To guarantee equal riding opportunities for all students, you may hold exactly <strong>one active reservation or bike</strong> in your possession at any given time.</>,
        <><strong>Ride Duration Options:</strong> When initiating a reservation, you are free to select from ride intervals of <strong>{durationOptions}</strong>.</>,
        <><strong>Maximum Riding Session:</strong> The maximum allowable duration for any single session is <strong>{policy.maxBookingDuration} minutes</strong>. All ride timer extensions are strictly prohibited to maintain a high rotation of available bikes at the station.</>
      ] : [
        <><strong>Peraturan Milikan Tunggal:</strong> Pelajar hanya dibenarkan memegang <strong>satu tempahan aktif atau satu basikal</strong> dalam milikan pada satu-satu masa demi peluang penggunaan yang adil kepada semua pelajar.</>,
        <><strong>Pilihan Tempoh Tunggangan:</strong> Semasa membuat tempahan, anda bebas memilih daripada selang masa <strong>{durationOptionsMalay}</strong>.</>,
        <><strong>Sesi Tunggangan Maksimum:</strong> Tempoh maksimum bagi satu sesi tunggangan ialah <strong>{policy.maxBookingDuration} minit</strong>. Pelanjutan masa tunggangan dilarang sama sekali untuk menjaga kadar putaran basikal di stesen.</>
      ]
    },
    {
      id: "geofencing",
      icon: MapPin,
      title: language === "en" ? "GPS Geofencing & Station Boundaries" : "Geofencing GPS & Sempadan Stesen",
      iconBgClass: "bg-sky-500/10 dark:bg-sky-500/20 border-sky-500/10",
      iconTextClass: "text-sky-600 dark:text-sky-400",
      points: language === "en" ? [
        <><strong>Designated Station Bounds:</strong> For campus orderliness, all rides must be initiated and returned precisely inside the designated boundaries of the official college Bike Station.</>,
        <><strong>Real-Time GPS Validation:</strong> The system enforces GPS verification centered at coordinates <strong>lat: {policy.stationCoordinates.lat.toFixed(4)}, lng: {policy.stationCoordinates.lng.toFixed(4)}</strong> with a radius boundary of <strong>{policy.gpsRadiusMeters} meters</strong>.</>,
        <><strong>Location Permissions Required:</strong> Mobile device precise location permissions must be granted and enabled to complete a return. {policy.gpsEnabled ? "GPS geofencing is actively enforced." : "Geofencing checks are temporarily waived for emergency maintenance."}</>
      ] : [
        <><strong>Sempadan Stesen Ditetapkan:</strong> Demi menjaga ketertiban kampus, semua tunggangan mesti bermula dan berakhir tepat di Stesen Basikal kolej rasmi.</>,
        <><strong>Pengesahan GPS Masa Nyata:</strong> Sistem menguatkuasakan koordinat geofencing GPS berpusat pada <strong>lat: {policy.stationCoordinates.lat.toFixed(4)}, lng: {policy.stationCoordinates.lng.toFixed(4)}</strong> dengan jejari sempadan <strong>{policy.gpsRadiusMeters} meter</strong>.</>,
        <><strong>Kebenaran Lokasi Tepat:</strong> Lokasi GPS tepat peranti mudah alih mesti dibenarkan dan diaktifkan untuk memulangkan basikal. {policy.gpsEnabled ? "Geofencing GPS sedang dikuatkuasakan secara aktif." : "Pemeriksaan geofencing dikecualikan buat sementara waktu."}</>
      ]
    },
    {
      id: "penalties",
      icon: Timer,
      title: language === "en" ? "Cooldown Enforcement & Late Return Penalties" : "Tempoh Bertenang & Penalti Pemulangan Lewat",
      iconBgClass: "bg-rose-500/10 dark:bg-rose-500/20 border-rose-500/10",
      iconTextClass: "text-rose-600 dark:text-rose-400",
      points: language === "en" ? [
        <><strong>Pickup Grace Period:</strong> After confirming a reservation, a <strong>{policy.pickupGracePeriod}-minute</strong> grace window is active to walk to the station and scan the bike's QR code to start your ride timer.</>,
        <><strong>Cancellation Lockout:</strong> Manually cancelling a reservation triggers a brief <strong>{policy.cancelCooldownMinutes}-minute</strong> lockout from re-booking.</>,
        <><strong>Standard Return Cooldown:</strong> Timely returns face a standard post-ride cooldown of <strong>{policy.standardCooldownDays} days</strong> before another bike can be reserved.</>,
        <><strong>Late Return Cooldown Penalty:</strong> Returning a bike late beyond the <strong>{policy.returnGracePeriod}-minute</strong> return grace period triggers an automatic <strong>{totalLateCooldown}-day</strong> penalty block (comprising the standard <strong>{policy.standardCooldownDays}-day</strong> cooldown plus an additional <strong>{policy.lateReturnCooldownDays}-day</strong> late return surcharge), suspending your riding privileges instantly.</>
      ] : [
        <><strong>Tangguh Pengambilan Basikal:</strong> Tempoh tangguh selama <strong>{policy.pickupGracePeriod} minit</strong> diaktifkan untuk berjalan ke stesen dan mengimbas kod QR basikal bagi memulakan tunggangan.</>,
        <><strong>Sekatan Masa Batal:</strong> Tempahan yang dibatalkan secara manual akan mencetuskan sekatan tempahan semula selama <strong>{policy.cancelCooldownMinutes} minit</strong>.</>,
        <><strong>Tempoh Bertenang Standard:</strong> Pemulangan tepat waktu dikenakan tempoh bertenang standard selama <strong>{policy.standardCooldownDays} hari</strong> sebelum boleh menempah semula.</>,
        <><strong>Penalti Pemulangan Lewat:</strong> Memulangkan basikal lewat melebihi buffer <strong>{policy.returnGracePeriod} minit</strong> akan mencetuskan denda sekatan akaun automatik selama <strong>{totalLateCooldown} hari</strong> secara automatik (terdiri daripada <strong>{policy.standardCooldownDays} hari</strong> tempoh bertenang standard ditambah denda lewat sebanyak <strong>{policy.lateReturnCooldownDays} hari</strong>), menggantung hak tunggangan anda serta-merta.</>
      ]
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-screen bg-background">
      {/* Title & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t.title}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t.home}</Link>
            <span>›</span>
            <span>{t.nav}</span>
          </div>
        </div>
      </div>

      {/* Guidebook Main Content */}
      <div className="space-y-6 md:space-y-8">
        
        {sectionsData.map((section) => (
          <div 
            key={section.id}
            className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all"
          >
            <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${section.iconBgClass} ${section.iconTextClass}`}>
                <section.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-medium text-foreground">
                  {section.title}
                </h3>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <ul className="space-y-4 text-[13px] md:text-[14px] text-muted-foreground leading-relaxed">
                {section.points.map((point, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <span className="flex-1">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}

        {/* Appeals and Penalties Block Card */}
        <div className="bg-destructive/5 rounded-2xl border border-destructive/15 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between mt-8 md:mt-12">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shrink-0 shadow-sm border border-destructive/20 text-destructive">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-[15px] md:text-[16px] font-bold text-foreground">
                {t.appealTitle}
              </h4>
              <p className="text-[12.5px] md:text-[13px] text-muted-foreground leading-relaxed mt-1.5 max-w-4xl">
                {t.appealDesc}
              </p>
            </div>
          </div>
          <Link 
            href="/contact" 
            className="w-full md:w-auto bg-[#EC1C24] hover:bg-[#EC1C24]/90 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0 self-stretch md:self-auto text-center"
          >
             {t.appealBtn}
          </Link>
        </div>

      </div>
    </div>
  );
}
