"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Mail, Send, CheckCircle2, MessageSquare, AlertCircle, Phone } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { functions } from "@/lib/firebase/client";
import { httpsCallable } from "firebase/functions";

const contactContent = {
  en: {
    title: "Support Helpdesk",
    home: "Home",
    nav: "Contact Support",
    directAssist: "Direct Assistance",
    directDesc: "Encountered a technical glitch, GPS geofencing error, or have questions about a penalty? Our administrative team is here to help.",
    avgResponse: "Avg. Response Time: < 24h",
    operating: "Operating: Mon-Fri, 8AM-6PM",
    adminContacts: "Admin Contacts",
    adminRole: "QBike Administrator",
    coordinatorRole: "Support Coordinator",
    developerRole: "QBike Developer",
    sendMessage: "Create Support Ticket",
    messageDesc: "Provide as much detail as possible for a faster resolution",
    successTitle: "Message Sent Successfully!",
    successDesc: "Thank you for reaching out. A support ticket has been created and our team will respond to your registered email address shortly.",
    sendAnother: "Send Another Ticket",
    subjectLabel: "Subject",
    subjectSelect: "Select Topic / Category",
    topicGeneral: "General Inquiry",
    topicIssue: "Report a Bike Issue",
    topicDispute: "Dispute a Penalty",
    topicAccount: "Account Verification",
    topicOther: "Other / Uncategorized",
    messageLabel: "Detailed Description",
    messagePlaceholder: "Describe your issue or question in detail. Include booking IDs, bike IDs, and steps to reproduce if applicable...",
    sendBtn: "Dispatch Support Ticket",
    sendingBtn: "Dispatching Ticket...",
    disclaimer: "By submitting, you agree that your student credentials and device information will be securely logged for follow-up.",
    subjectPlaceholder: "e.g., GPS Validation Error on Booking BKG-912"
  },
  ms: {
    title: "Meja Bantuan",
    home: "Utama",
    nav: "Hubungi Sokongan",
    directAssist: "Bantuan Langsung",
    directDesc: "Menghadapi masalah teknikal, ralat geofencing GPS, atau mempunyai soalan tentang denda? Pasukan pentadbir kami bersedia membantu.",
    avgResponse: "Masa Maklum Balas: < 24j",
    operating: "Beroperasi: Isn-Jum, 8PG-6PTG",
    adminContacts: "Hubungan Pentadbir",
    adminRole: "Pentadbir QBike",
    coordinatorRole: "Penyelaras Sokongan",
    developerRole: "Pembangun QBike",
    sendMessage: "Buka Tiket Sokongan",
    messageDesc: "Sila berikan butiran terperinci untuk penyelesaian yang pantas.",
    successTitle: "Mesej Berjaya Dihantar!",
    successDesc: "Terima kasih. Tiket sokongan anda telah dibuka. Pasukan kami akan memberikan maklum balas ke e-mel rasmi anda dalam masa terdekat.",
    sendAnother: "Buka Tiket Lain",
    subjectLabel: "Subjek Isu",
    subjectSelect: "Pilih Kategori Topik",
    topicGeneral: "Pertanyaan Umum",
    topicIssue: "Lapor Masalah Basikal",
    topicDispute: "Pertikaikan Denda Penalti",
    topicAccount: "Pengesahan Profil Akaun",
    topicOther: "Lain-lain Kategori",
    messageLabel: "Terangan Terperinci",
    messagePlaceholder: "Terangkan masalah atau soalan anda secara terperinci. Nyatakan ID tempahan atau basikal jika berkaitan...",
    sendBtn: "Hantar Tiket Sokongan",
    sendingBtn: "Menghantar Tiket...",
    disclaimer: "Dengan menghantar borang ini, maklumat profil dan peranti anda akan direkodkan secara selamat untuk tindakan susulan.",
    subjectPlaceholder: "cth. Ralat Pengesahan GPS pada Tempahan BKG-912"
  }
};

export default function ContactPage() {
  const { language } = useLanguage();
  const t = contactContent[language];
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("app_bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const createReport = httpsCallable(functions, "createReport");
      await createReport({
        type: "contact_support",
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSuccess(true);
      setSubject("");
      setMessage("");
      setCategory("app_bug");
    } catch (err: unknown) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

      {/* Grid container where left column content sets overall height */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Support Direct Assistance Sidebar Column */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Assist Card */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all flex-none">
            <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 border border-purple-500/10">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-medium text-foreground">{t.directAssist}</h3>
              </div>
            </div>
            
            <div className="p-6 md:p-8 space-y-6">
              <p className="text-[13px] md:text-[14px] text-muted-foreground leading-relaxed">
                {t.directDesc}
              </p>
              
              <div className="h-px bg-border"></div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
                  <span className="text-[13px] font-medium">{t.avgResponse}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 shadow-sm" />
                  <span className="text-[13px] font-medium">{t.operating}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Contacts Card - Naturally sizes showing all items without scrollbar */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all flex-none">
            <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5">
              <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 border border-sky-500/10">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-medium text-foreground">{t.adminContacts}</h3>
              </div>
            </div>
            
            {/* Direct natural listing */}
            <div className="p-6 md:p-8 space-y-5">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-foreground text-sm">Pn. Mardhiah</span>
                <span className="text-[12px] text-muted-foreground">{t.adminRole}</span>
                <a 
                  href="tel:+60136334933" 
                  className="text-primary hover:text-primary/80 font-medium text-[13px] flex items-center gap-1.5 mt-1 transition-colors w-fit"
                >
                  📞 +60 13-6334 933
                </a>
              </div>
              
              <div className="h-px bg-border"></div>

              <div className="flex flex-col gap-1">
                <span className="font-semibold text-foreground text-sm">Zaid Izzuddin</span>
                <span className="text-[12px] text-muted-foreground">{t.developerRole}</span>
                <a 
                  href="tel:+60183770754" 
                  className="text-primary hover:text-primary/80 font-medium text-[13px] flex items-center gap-1.5 mt-1 transition-colors w-fit"
                >
                  📞 +60 18-377 0754
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Contact Support Ticket Form Column - Stretches dynamically to match left column */}
        <div className="lg:col-span-2 lg:h-full flex flex-col">
          
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all flex-1 flex flex-col">
            <div className="p-5 md:p-6 border-b border-border flex items-center gap-4 bg-muted/5 flex-none">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-primary dark:text-blue-500 shrink-0 border border-blue-500/10">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-medium text-foreground">{t.sendMessage}</h3>
                <p className="text-[12px] md:text-[13px] text-muted-foreground mt-0.5">{t.messageDesc}</p>
              </div>
            </div>

            {/* Inner dynamic body stretching */}
            <div className="p-6 md:p-8 flex-1 flex flex-col">
              {success ? (
                <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-300 my-auto">
                  <div className="h-16 w-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/10">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{t.successTitle}</h3>
                  <p className="text-[14px] text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
                    {t.successDesc}
                  </p>
                  <button 
                    onClick={() => setSuccess(false)}
                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/20"
                  >
                    {t.sendAnother}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-5">
                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm p-4 rounded-xl flex items-center gap-3 flex-none">
                      <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                      <span className="text-[13px] font-medium">{error}</span>
                    </div>
                  )}

                  <div className="space-y-2 flex-none">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {t.subjectSelect}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-3 border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none bg-background transition-all cursor-pointer"
                    >
                      <option value="app_bug">{t.topicGeneral}</option>
                      <option value="access">{t.topicAccount}</option>
                      <option value="billing">{t.topicDispute}</option>
                      <option value="other">{t.topicOther}</option>
                    </select>
                  </div>

                  <div className="space-y-2 flex-none">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {t.subjectLabel}
                    </label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={t.subjectPlaceholder}
                      className="w-full px-4 py-3 border border-border rounded-xl text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none bg-background transition-all"
                    />
                  </div>
                  
                  {/* Detailed Description textarea: dynamically stretches to fill remaining height */}
                  <div className="space-y-2 flex-1 flex flex-col min-h-[160px] lg:min-h-0">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block flex-none">
                      {t.messageLabel}
                    </label>
                    <textarea
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full flex-1 min-h-0 px-4 py-3 border border-border rounded-xl text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none bg-background transition-all resize-none animate-none"
                      placeholder={t.messagePlaceholder}
                    />
                  </div>

                  <div className="pt-2 space-y-4 flex-none">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-wider text-xs py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-md shadow-primary/10 active:scale-95 disabled:opacity-50"
                    >
                      {loading ? (
                        <LoadingSpinner />
                      ) : (
                        <><Send className="h-4 w-4"/> {t.sendBtn}</>
                      )}
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center italic leading-relaxed">
                      {t.disclaimer}
                    </p>
                  </div>
                </form>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
