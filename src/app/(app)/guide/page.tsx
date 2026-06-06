"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { UserPlus, FileEdit, ShieldCheck, Bike, Calendar, QrCode, ArrowLeftRight, Clock, ChevronRight, AlertCircle, MapPin } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { PolicySingleton } from "@/types";


const guideContent = {
  en: {
    title: "Usage Guide",
    home: "Home",
    subtitle: "Learn how to book, collect, and return your bike",
    proTip: "Pro Tip: Always verify your location",
    proTipDesc: "Ensure you are physically at the college bike station before pressing confirm or scanning the QR code.",
    step1Title: "1. Booking",
    step1Desc1: "Choose an available bike from the Dashboard or Book page.",
    step1Desc2: "Select your required duration (e.g., 30, 60, or 120 minutes).",
    step1Desc3: "Confirm the booking. Your reservation will be held for the grace period (usually 15 minutes).",
    step2Title: "2. Collection",
    step2Desc1: "Go to the college bike station.",
    step2Desc2: "Open the app and tap 'Scan QR' on the navigation bar.",
    step2Desc3: "Scan the QR code pasted on the bike's handlebar.",
    step2Desc4: "Once successful, the bike lock will release and your timer starts.",
    step3Title: "3. Riding",
    step3Desc1: "Always wear safety gear and ride within the allowed college parameters.",
    step3Desc2: "Keep track of your time on the Dashboard to avoid late penalties.",
    step4Title: "4. Return",
    step4Desc1: "Bring the bike back to the designated station.",
    step4Desc2: "Secure the lock manually.",
    step4Desc3: "Open the app, go to your active booking, and scan the station's return QR code to complete the session."
  },
  ms: {
    title: "Panduan Penggunaan",
    home: "Utama",
    subtitle: "Ketahui cara untuk menempah, mengambil, dan memulangkan basikal anda",
    proTip: "Tip Pro: Sentiasa sahkan lokasi anda",
    proTipDesc: "Pastikan anda berada secara fizikal di stesen basikal kolej sebelum menekan sahkan atau mengimbas kod QR.",
    step1Title: "1. Tempahan",
    step1Desc1: "Pilih basikal yang tersedia dari Papan Pemuka atau halaman Tempah.",
    step1Desc2: "Pilih tempoh yang diperlukan (cth., 30, 60, atau 120 minit).",
    step1Desc3: "Sahkan tempahan. Tempahan anda akan disimpan untuk tempoh tangguh (biasanya 15 minit).",
    step2Title: "2. Pengambilan",
    step2Desc1: "Pergi ke stesen basikal kolej.",
    step2Desc2: "Buka aplikasi dan ketik 'Imbas QR' di bar navigasi.",
    step2Desc3: "Imbas kod QR yang ditampal pada pemegang basikal.",
    step2Desc4: "Setelah berjaya, kunci basikal akan dilepaskan dan masa anda bermula.",
    step3Title: "3. Menunggang",
    step3Desc1: "Sentiasa pakai kelengkapan keselamatan dan tunggang dalam parameter kolej yang dibenarkan.",
    step3Desc2: "Jejak masa anda di Papan Pemuka untuk mengelakkan penalti lewat.",
    step4Title: "4. Pemulangan",
    step4Desc1: "Bawa basikal kembali ke stesen yang ditetapkan.",
    step4Desc2: "Kunci basikal secara manual.",
    step4Desc3: "Buka aplikasi, pergi ke tempahan aktif anda, dan imbas kod QR pemulangan stesen untuk melengkapkan sesi."
  }
};

export default function GuidePage() {
  const { language } = useLanguage();
  const t = guideContent[language];
  const [policy, setPolicy] = useState<PolicySingleton | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "policy", "current"), (snap) => {
      if (snap.exists()) {
        setPolicy(snap.data() as PolicySingleton);
      }
    });
    return () => unsub();
  }, []);

  const steps = [
    {
      title: "Create / Login",
      icon: UserPlus,
      desc: "Register or log in using your DELIMa email address (@moe-dl.edu.my). You can authenticate securely using Google or basic email credentials, ensuring a quick and secure sign-in experience.",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Fill in Information",
      icon: FileEdit,
      desc: "Complete your profile by entering your Full Name, student Matrix Number, and selecting your Practicum. Ensure correct details as information cannot be changed once verified.",
      color: "text-[#26c6da]",
      bgColor: "bg-secondary/10"
    },
    {
      title: "Getting Verified",
      icon: ShieldCheck,
      desc: "Once submitted, the system will run an automated credential match. If manual verification is required, a college administrator will review your profile. You will receive a notification once your account has been verified.",
      color: "text-green-500",
      bgColor: "bg-green-500/10"
    },
    {
      title: "Book a Bike",
      icon: Bike,
      desc: `Access real-time bike availability directly on the dashboard. Choose a session duration and confirm. You will have a ${policy?.pickupGracePeriod ?? 15}-minute window to physically walk to the station and collect your bike.`,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Collect Bike",
      icon: QrCode,
      desc: "Head over to the college bike station, pick a bike of your choice and inspect its condition (check tire pressure, brakes, and chains for safety). Once satisfied, open the app's scanner, and scan the QR code on the bike to start your active ride timer.",
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    },
    {
      title: "Return & Photo Upload",
      icon: ArrowLeftRight,
      desc: "Bring the bike back to the bike station, park the bike nicely and neatly at the designated racks, scan the QR code on the bike, and upload a clear side-profile photo of the returned bike to complete your session and verify it is returned undamaged.",
      color: "text-green-500",
      bgColor: "bg-green-500/10"
    },
    {
      title: "Report Issues Easily",
      icon: AlertCircle,
      desc: "Spotted a mechanical fault? Whether before checking out, during your ride, or right at return, you can instantly flag problems (like flat tires, chain slips, or brake issues) directly via the app to notify the college maintenance team.",
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    },
    {
      title: "Fair-Use Cooldown",
      icon: Clock,
      desc: `To guarantee equal riding opportunities for all students, a fair-use cooldown lock is enforced after every ride. Each student can ride once every ${policy?.standardCooldownDays ?? 1} days. Returning bikes late will trigger longer cooldown duration or temporary account blocks.`,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10"
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-foreground">{t.title}</h2>
          <div className="flex items-center text-[12px] md:text-[13px] text-muted-foreground mt-1 space-x-2">
            <Link href="/dashboard" className="hover:text-primary transition-colors">{t.home}</Link>
            <span>›</span>
            <span>{t.title}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step, idx) => (
          <div key={idx} className="bg-card p-6 rounded-lg shadow-sm border border-border transition-all hover:shadow-md group">
            <div className={`w-12 h-12 ${step.bgColor} ${step.color} rounded-full flex items-center justify-center mb-5 shrink-0 group-hover:scale-110 transition-transform`}>
              <step.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full uppercase tracking-wider">Step {idx + 1}</span>
              </div>
              <h3 className="font-semibold text-card-foreground text-[15px] mb-2 leading-tight">
                {step.title}
              </h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Tips & Support Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        {/* Card 1: GPS Geofencing */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 flex items-start gap-5 hover:shadow-sm transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h4 className="text-card-foreground font-bold text-[13px] uppercase tracking-wide mb-1.5">
              GPS Geofencing
            </h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Our system relies on precise GPS to confirm that bikes are returned correctly to the right place. If you encounter any return verification issues, please check that your mobile GPS precise location permission is granted, your signal is strong, and you are positioned within 50 meters of the physical station boundaries.
            </p>
          </div>
        </div>

        {/* Card 2: Damage Reporting */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex items-start gap-5 hover:shadow-sm transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h4 className="text-card-foreground font-bold text-[13px] uppercase tracking-wide mb-1.5">
              Hassle-Free Reporting
            </h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Encountered a mechanical problem or flat tire? We encourage students to report all wear and issues immediately to keep the campus fleet in peak riding shape. All reports are handled constructively—there are no penalties or punishments for reporting issues unless it is a clear act of deliberate vandalism.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
