import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandName } from "@/components/BrandName";
import { useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, QrCode, Users, ArrowRight, Timer,
  MapPin, Search, Clock, TrendingUp, Shield, Zap, ChevronRight,
  Star, Globe, Mail, Lock, Instagram, Facebook, Youtube,
} from "lucide-react";
import { format, isThisWeek, isThisMonth, isFuture } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/")({
  component: Landing,
});

type DateFilter = "all" | "week" | "month";
type StatusFilter = "all" | "open" | "full";

/* Hook scroll animation */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}


function Landing() {
  const { user, loading } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stats, setStats] = useState({ events: 0, participants: 0, organizers: 0 });

  useEffect(() => {
    (async () => {
      const { data: evData, error: evErr } = await (supabase as any).rpc("get_public_events");
      if (evErr) console.error("Events error:", evErr.message);
      const all = evData ?? [];

      // Récupérer les counts de registrations séparément
      let regsMap: Record<string, any[]> = {};
      if (all.length > 0) {
        const ids = all.map((e: any) => e.id);
        const { data: regsData, error: regsErr } = await supabase
          .from("registrations")
          .select("id, event_id, status, expires_at")
          .in("event_id", ids);
        if (regsErr) console.error("Registrations fetch error:", regsErr.message, regsErr.code);
        (regsData ?? []).forEach((r: any) => {
          if (!regsMap[r.event_id]) regsMap[r.event_id] = [];
          regsMap[r.event_id].push(r);
        });
      }

      const enriched = all.map((e: any) => ({ ...e, registrations: regsMap[e.id] ?? [] }));
      setEvents(enriched);
      const totalParticipants = enriched.reduce((acc: number, e: any) =>
        acc + (e.registrations ?? []).filter((r: any) => r.status === "registered" || r.status === "attended").length, 0);
      const organizerIds = new Set(enriched.map((e: any) => e.organizer_id));
      setStats({ events: enriched.length, participants: totalParticipants, organizers: organizerIds.size });
      setEventsLoading(false);
    })();
  }, []);

  function getActive(e: any) {
    const now = new Date();
    return (e.registrations ?? []).filter((r: any) =>
      r.status === "registered" || r.status === "attended" ||
      (r.status === "pending" && r.expires_at && new Date(r.expires_at) > now));
  }
  const filtered = useMemo(() => events.filter((e) => {
    const active = getActive(e);
    const isFull = e.capacity > 0 && active.length >= e.capacity;
    if (q && !e.title.toLowerCase().includes(q.toLowerCase()) && !e.location?.toLowerCase().includes(q.toLowerCase())) return false;
    if (dateFilter === "week" && !isThisWeek(new Date(e.starts_at))) return false;
    if (dateFilter === "month" && !isThisMonth(new Date(e.starts_at))) return false;
    if (statusFilter === "open" && isFull) return false;
    if (statusFilter === "full" && !isFull) return false;
    return true;
  }), [events, q, dateFilter, statusFilter]);

  const upcoming = filtered.filter((e) => isFuture(new Date(e.starts_at)));
  const past = filtered.filter((e) => !isFuture(new Date(e.starts_at)));

  const eventsAnim = useInView(0.1);
  const featuresAnim = useInView(0.1);
  const ctaAnim    = useInView(0.1);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)", overflowX: "clip" }}>
      <div className="pointer-events-none fixed inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/cracki.webp')", opacity: 0.12 }} />
      <div className="pointer-events-none fixed inset-0 bg-gradient-mesh opacity-60" />

      {/* ── Header ── */}
      <header className="relative z-50 w-full border-b border-[#D5A0A8]/30 bg-white/60 backdrop-blur sticky top-0 overflow-hidden">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/logo2.png" alt="Plav'" className="h-10 md:h-20 w-auto object-contain" />
            <BrandName className="h-10 md:h-20" />
          </div>
          <nav className="hidden md:flex items-center gap-16 text-sm font-medium text-[#6B0F2C]">
            <a href="#evenements" className="hover:opacity-70 transition-opacity">Événements</a>
            <a href="#fonctionnalites" className="hover:opacity-70 transition-opacity">Fonctionnalités</a>
            <a href="#contact" className="hover:opacity-70 transition-opacity">Contact</a>
          </nav>
          <div className="flex gap-2">
            {!loading && user ? (
              <Button asChild className="bg-gradient-primary shadow-glow">
                <Link to="/dashboard">Mon espace <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link to="/login">Connexion</Link></Button>
                <Button asChild size="sm" className="bg-gradient-primary shadow-glow"><Link to="/register">Commencer</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
<div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 10% 50%, #C8748870 0%, transparent 55%), radial-gradient(ellipse at 50% 80%, #EED4D860 0%, transparent 50%), radial-gradient(ellipse at 85% 40%, #D5E8A045 0%, transparent 55%)" }} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FDFAF7]/50 via-transparent to-[#FDFAF7]" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-[#FDFAF7]" />

        <div className="relative z-10 container mx-auto">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#D5A0A8] bg-white/70 px-4 py-1.5 text-xs font-medium backdrop-blur text-[#6B0F2C]">
              <img src="/logo2.png" alt="" className="h-4 w-4 object-contain" />
              Organise, gère, scanne — en un seul endroit
            </div>
            <h1 className="text-5xl tracking-tight md:text-7xl font-extrabold" style={{ color: "var(--text-title)" }}>
              Tes soirées{" "}
              <span style={{ color: "#6B0F2C" }}>enflammées</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-[#2C2C2A]/70">
              Billetterie étudiante, réservations avec timer, QR codes —
              la plateforme made for students qui déchire.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {!loading && user ? (
                <>
                  <Button asChild size="lg" className="bg-gradient-primary shadow-glow"><Link to="/dashboard">Accéder à mon espace <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
                  <Button asChild size="lg" variant="outline"><a href="#evenements">Voir les soirées</a></Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg" className="bg-gradient-primary shadow-glow"><Link to="/register">Créer un compte <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
                  <Button asChild size="lg" variant="outline"><a href="#evenements">Découvrir les soirées</a></Button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-3">
            {[
              { value: stats.events, label: "Événements publiés", icon: CalendarDays },
              { value: stats.participants, label: "Participants inscrits", icon: Users },
              { value: stats.organizers, label: "Organisateurs actifs", icon: Star },
            ].map((s) => (
              <div key={s.label} className="rounded-[12px] border border-[#D5A0A8]/50 bg-white/80 p-3 sm:p-5 text-center backdrop-blur shadow-elegant">
                <s.icon className="mx-auto mb-1 h-4 w-4 sm:h-5 sm:w-5 text-[#0F7A4B]" />
                <p className="text-xl sm:text-3xl font-semibold" style={{ color: "var(--text-title)" }}>
                  {eventsLoading ? "—" : s.value}
                </p>
                <p className="mt-1 text-[10px] sm:text-xs text-[#2C2C2A]/60 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── Events section ── */}
      <section id="evenements" className="relative py-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0" style={{ height: "55%", background: "linear-gradient(to bottom, #FDFAF7 0%, rgba(253,250,247,0.8) 40%, transparent 100%)" }} />
        <div className="relative z-10 container mx-auto px-6">
        <div ref={eventsAnim.ref} className={`mb-10 text-center ${eventsAnim.visible ? "animate-fade-up" : ""}`}>
          <h2 className="text-4xl font-bold" style={{ color: "var(--text-title)" }}>Prochaines soirées</h2>
          <p className="mt-2 text-[#2C2C2A]/60">Toutes les soirées publiées, accessibles sans connexion.</p>
        </div>

        <div className={`mx-auto mb-8 flex max-w-3xl flex-col sm:flex-row gap-3 ${eventsAnim.visible ? "animate-fade-up delay-200" : ""}`}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par titre ou lieu…" className="pl-9 bg-white/80 backdrop-blur w-full" />
          </div>
          <div className="flex gap-3">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="flex-1 sm:w-40 bg-white/80 backdrop-blur">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes dates</SelectItem>
                <SelectItem value="week">Cette semaine</SelectItem>
                <SelectItem value="month">Ce mois</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="flex-1 sm:w-40 bg-white/80 backdrop-blur"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="open">Places disponibles</SelectItem>
                <SelectItem value="full">Complet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {eventsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="rounded-[12px] border border-[#D5A0A8]/50 bg-white/60 h-64 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-2 border-dashed mx-auto max-w-md">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-40" />
              Aucun événement trouvé.
            </CardContent>
          </Card>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                {past.length > 0 && <p className="mb-4 text-sm font-medium text-[#0F7A4B] uppercase tracking-wide">À venir</p>}
                <EventGrid events={upcoming} user={user} />
              </>
            )}
            {past.length > 0 && (
              <>
                <p className="mt-10 mb-4 text-sm font-medium text-[#2C2C2A]/40 uppercase tracking-wide">Passés</p>
                <EventGrid events={past} muted user={user} />
              </>
            )}
          </>
        )}

        {!loading && !user && filtered.length > 0 && (
          <div className="mt-10 text-center">
            <p className="text-sm text-[#2C2C2A]/60 mb-3">Connectez-vous pour vous inscrire à un événement.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/login">Se connecter <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        )}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="fonctionnalites" className="relative py-24">
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.5) 10%, rgba(255,255,255,0.5) 90%, transparent 100%)" }} />
        <div ref={featuresAnim.ref} className="container mx-auto px-6">
          <div className={`mb-12 text-center ${featuresAnim.visible ? "animate-fade-up" : ""}`}>
          <h2 className="text-4xl font-bold" style={{ color: "var(--text-title)" }}>Tout ce qu'il te faut</h2>
            <p className="mt-3 text-[#2C2C2A]/60 max-w-xl mx-auto">Une plateforme de billetterie étudiante pensée pour les assos qui organisent et les étudiants qui veulent vivre des soirées de ouf.</p>
          </div>
          <div className={`grid gap-6 md:grid-cols-2 lg:grid-cols-4 ${featuresAnim.visible ? "animate-fade-up delay-200" : ""}`}>
            {[
              { icon: CalendarDays, title: "Création rapide",  desc: "Créez et publiez en quelques secondes avec gestion de capacité, description et image de couverture.", color: "bg-[#EED4D8]", iconColor: "text-[#6B0F2C]" },
              { icon: Timer,        title: "Timer 15 min",     desc: "Chaque réservation bloque la place 15 minutes. Le premier à confirmer gagne — zéro doublon.", color: "bg-[#D5E8A0]", iconColor: "text-[#073D25]" },
              { icon: QrCode,       title: "Scan QR",           desc: "Un QR unique par inscription. Scan caméra ou saisie manuelle le jour J pour un accueil fluide.", color: "bg-gradient-primary", iconColor: "text-white" },
              { icon: Users,        title: "Inscriptions simples",  desc: "Un clic pour réserver sa place. Confirmation immédiate avec QR code et email récapitulatif.", color: "bg-[#EED4D8]", iconColor: "text-[#6B0F2C]" },
              { icon: TrendingUp,   title: "Tableau de bord",  desc: "Visualisez vos inscriptions, taux de remplissage et présences en temps réel.", color: "bg-[#D5E8A0]", iconColor: "text-[#073D25]" },
              { icon: Shield,       title: "Rôles & accès",    desc: "Admin, organisateur, participant ou bénévole — chaque rôle a ses permissions adaptées.", color: "bg-gradient-primary", iconColor: "text-white" },
              { icon: Zap,          title: "Instantané",       desc: "Infrastructure cloud — vos données se synchronisent en temps réel pour tous les utilisateurs.", color: "bg-[#EED4D8]", iconColor: "text-[#6B0F2C]" },
              { icon: Globe,        title: "Accessible",       desc: "Les événements publics sont visibles sans compte. Partagez le lien, c'est tout.", color: "bg-[#D5E8A0]", iconColor: "text-[#073D25]" },
            ].map((f) => (
              <div key={f.title} className="rounded-[12px] border-[0.5px] border-[#D5A0A8] bg-white/80 p-6 backdrop-blur shadow-elegant hover:shadow-glow hover:-translate-y-1 transition-all duration-300">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-[8px] ${f.color}`}>
                  <f.icon className={`h-5 w-5 ${f.iconColor}`} />
                </div>
                <h3 style={{ color: "var(--text-title)", fontSize: "1.1rem", fontWeight: 600 }}>{f.title}</h3>
                <p className="mt-2 text-sm text-[#2C2C2A]/70">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works — scroll-driven stacked cards ── */}
      <StackedHowItWorks />

      {/* ── CTA ── */}
      {!loading && !user && (
        <section ref={ctaAnim.ref} className={`relative py-20 ${ctaAnim.visible ? "animate-fade-up" : ""}`}>
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-2xl rounded-[20px] bg-gradient-primary p-12 text-center shadow-glow">
              <img src="/logo2.png" alt="" className="mx-auto mb-6 h-28 w-28 object-contain drop-shadow-lg brightness-0 invert" />
              <h2 className="text-4xl font-bold text-white">Prêt à organiser ta prochaine soirée ?</h2>
              <p className="mt-4 text-white/80">Rejoins des dizaines d'assos qui font confiance à Plav' pour leurs événements.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" className="bg-white text-[#6B0F2C] hover:bg-white/90">
                  <Link to="/register">Créer un compte gratuitement <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="text-white border border-white/30 hover:bg-white/10">
                  <Link to="/login">Se connecter</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer id="contact" className="relative border-t border-[#D5A0A8]/30 bg-white/60 backdrop-blur py-12">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo2.png" alt="Plav'" className="h-10 w-auto" />
                <BrandName className="h-12" />
              </div>
              <p className="text-sm text-[#2C2C2A]/60">La plateforme de billetterie étudiante pour les assos qui gèrent.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#6B0F2C] mb-3 uppercase tracking-wide">Navigation</h4>
              <ul className="space-y-2 text-sm text-[#2C2C2A]/70">
                <li><a href="#evenements" className="hover:text-[#6B0F2C] transition-colors">Événements</a></li>
                <li><a href="#fonctionnalites" className="hover:text-[#6B0F2C] transition-colors">Fonctionnalités</a></li>
                <li><Link to="/login" className="hover:text-[#6B0F2C] transition-colors">Connexion</Link></li>
                <li><Link to="/register" className="hover:text-[#6B0F2C] transition-colors">Inscription</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#6B0F2C] mb-3 uppercase tracking-wide">À propos</h4>
              <ul className="space-y-2 text-sm text-[#2C2C2A]/70">
                <li><Link to="/about" hash="organisateur" className="hover:text-[#6B0F2C] transition-colors">Organisateur</Link></li>
                <li><Link to="/about" hash="participant" className="hover:text-[#6B0F2C] transition-colors">Participant</Link></li>
                <li><Link to="/about" hash="benevole" className="hover:text-[#6B0F2C] transition-colors">Bénévole</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#6B0F2C] mb-3 uppercase tracking-wide">Contact</h4>
              <div className="flex items-center gap-2 text-sm text-[#2C2C2A]/70 mb-4">
                <Mail className="h-4 w-4" /><span>support@plav.app</span>
              </div>
              <div className="flex items-center gap-3">
                <a href="https://instagram.com/plav_app" target="_blank" rel="noopener noreferrer" className="text-[#2C2C2A]/50 hover:text-[#6B0F2C] transition-colors" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="https://facebook.com/plav.app" target="_blank" rel="noopener noreferrer" className="text-[#2C2C2A]/50 hover:text-[#6B0F2C] transition-colors" aria-label="Facebook">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="https://youtube.com/@plav_app" target="_blank" rel="noopener noreferrer" className="text-[#2C2C2A]/50 hover:text-[#6B0F2C] transition-colors" aria-label="YouTube">
                  <Youtube className="h-5 w-5" />
                </a>
                <a href="https://tiktok.com/@plav_app" target="_blank" rel="noopener noreferrer" className="text-[#2C2C2A]/50 hover:text-[#6B0F2C] transition-colors" aria-label="TikTok">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-[#D5A0A8]/30 pt-6 text-center text-xs text-[#2C2C2A]/40">
            © {new Date().getFullYear()} <BrandName className="h-5 align-middle" />. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}

const HOW_CARDS = [
  { step: "01", title: "Crée ta soirée",                desc: "Remplis le formulaire en quelques secondes : titre, date, lieu, capacité et image. Publie instantanément.",               cta: "Organise tes soirées",    to: "/register", bg: "#6B0F2C", accent: "#EED4D8", icon: CalendarDays },
  { step: "02", title: "Les étudiants s'inscrivent",   desc: "Un clic sur \"Réserver\" bloque la place 15 minutes. Le premier à confirmer gagne sa place — zéro doublon, zéro stress.",   cta: "Découvrir les soirées",   to: "/events/",  bg: "#0F7A4B", accent: "#D5E8A0", icon: Timer       },
  { step: "03", title: "Gère en temps réel",            desc: "Suis les inscriptions, le taux de remplissage et les présences depuis ton tableau de bord dédié.",                        cta: "Mon dashboard",           to: "/register", bg: "#C87488", accent: "#FFF8F0", icon: TrendingUp  },
  { step: "04", title: "Scan le soir J",                desc: "Chaque inscrit reçoit un QR code unique. Scanne à l'entrée en un instant pour valider les présences rapidement.",           cta: "Commencer maintenant",    to: "/register", bg: "#1D5C38", accent: "#D5E8A0", icon: QrCode      },
];

function StackedHowItWorks() {
  return (
    <section style={{ background: "transparent", paddingTop: "4rem" }}>
      <div style={{
        position:   "sticky",
        top:        110,
        zIndex:     6,
        width:      "100%",
        textAlign:  "center",
        padding:    "1rem 0 1.5rem",
        background: "linear-gradient(to bottom, var(--bg-page) 70%, transparent 100%)",
      }}>
        <h2 className="text-4xl font-bold" style={{ color: "var(--text-title)" }}>
          Comment ça marche ?
        </h2>
      </div>

      <div>
        <div style={{ height: "4vh" }} />

        {HOW_CARDS.flatMap((card, i) => [
          <div
            key={`card-${card.step}`}
            style={{
              position:        "sticky",
              top:             `calc(50vh - 180px + ${i * 16}px)`,
              zIndex:          i + 1,
              marginLeft:      "auto",
              marginRight:     "auto",
              width:           "min(860px, 92vw)",
              height:          "min(420px, 58vh)",
              borderRadius:    24,
              overflow:        "hidden",
              backgroundColor: card.bg,
              boxShadow:       "0 20px 60px -10px rgba(0,0,0,0.35)",
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 h-full">
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "clamp(1.5rem, 5vw, 2.5rem)" }}>
                <div>
                  <span style={{ display: "block", fontSize: "clamp(48px, 12vw, 88px)", lineHeight: 0.85, color: card.accent, opacity: 0.12, fontWeight: 800, userSelect: "none" }}>
                    {card.step}
                  </span>
                  <h3 style={{ marginTop: "0.5rem", fontSize: "clamp(1.25rem, 4vw, 2rem)", fontWeight: 700, color: "white", lineHeight: 1.25 }}>
                    {card.title}
                  </h3>
                  <p style={{ marginTop: "1rem", fontSize: "0.85rem", lineHeight: 1.65, color: `${card.accent}cc` }}>
                    {card.desc}
                  </p>
                </div>
                <div style={{ marginTop: "1.5rem" }}>
                  <Link to={card.to}>
                    <button
                      style={{ borderRadius: 8, border: `2px solid ${card.accent}`, color: card.accent, padding: "0.6rem 1.5rem", fontSize: "0.875rem", fontWeight: 500, background: "transparent", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                    >
                      {card.cta}
                    </button>
                  </Link>
                </div>
              </div>
              <div className="hidden sm:flex" style={{ alignItems: "center", justifyContent: "center", opacity: 0.07 }}>
                <card.icon style={{ width: 150, height: 150, color: card.accent }} strokeWidth={0.55} />
              </div>
            </div>
          </div>,

          <div
            key={`spacer-${i}`}
            style={{ height: i < HOW_CARDS.length - 1 ? "50vh" : "20vh" }}
          />,
        ])}
      </div>
    </section>
  );
}

function EventGrid({ events, muted = false, user }: { events: any[]; muted?: boolean; user: any }) {
  function getActive(e: any) {
    const now = new Date();
    return (e.registrations ?? []).filter((r: any) =>
      r.status === "registered" || r.status === "attended" ||
      (r.status === "pending" && r.expires_at && new Date(r.expires_at) > now));
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => {
        const active = getActive(e);
        const taken = active.length;
        const pct = e.capacity > 0 ? Math.min(100, Math.round((taken / e.capacity) * 100)) : 0;
        const isFull = e.capacity > 0 && taken >= e.capacity;
        const remaining = e.capacity - taken;

        return (
          <Link key={e.id} to={user ? "/events/$eventId" : "/login"} params={user ? { eventId: e.id } : undefined}>
            <Card className={`group h-full overflow-hidden border transition-all duration-300 hover:shadow-glow hover:-translate-y-1 ${muted ? "opacity-60" : ""}`}>
              {e.cover_image_url ? (
                <div className="relative h-40 w-full overflow-hidden bg-muted">
                  <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute right-2 top-2 flex gap-1">
                    {e.status === "private" && <Badge className="bg-[#6B0F2C] hover:bg-[#6B0F2C]"><Lock className="mr-1 h-3 w-3" />Privé</Badge>}
                    {isFull ? <Badge variant="destructive">Complet</Badge>
                      : remaining > 0 && remaining < 10 ? <Badge className="bg-orange-500 hover:bg-orange-500">{remaining} place{remaining > 1 ? "s" : ""}</Badge>
                      : null}
                  </div>
                </div>
              ) : (
                <div className="relative h-2 bg-gradient-vibrant">
                  <div className="absolute -bottom-3 right-2 flex gap-1">
                    {e.status === "private" && <Badge className="bg-[#6B0F2C] hover:bg-[#6B0F2C] text-[10px]"><Lock className="mr-1 h-3 w-3" />Privé</Badge>}
                    {isFull ? <Badge variant="destructive" className="text-[10px]">Complet</Badge>
                      : remaining > 0 && remaining < 10 ? <Badge className="bg-orange-500 hover:bg-orange-500 text-[10px]">{remaining} place{remaining > 1 ? "s" : ""}</Badge>
                      : null}
                  </div>
                </div>
              )}
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold group-hover:text-primary line-clamp-2 mt-1 transition-colors">{e.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{e.description || "Aucune description."}</p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-4 w-4 flex-shrink-0" />
                    <span>{format(new Date(e.starts_at), "PPP 'à' p", { locale: fr })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span className="line-clamp-1">{e.location || "En ligne"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4 flex-shrink-0" />
                    <span>{taken} / {e.capacity > 0 ? e.capacity : "∞"}</span>
                  </div>
                </div>
                {e.capacity > 0 && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full transition-all duration-500 ${isFull ? "bg-destructive" : remaining < 10 ? "bg-orange-500" : "bg-gradient-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between">
                  {e.price > 0 ? <span className="text-sm font-semibold text-[#6B0F2C]">{e.price} €</span>
                    : <Badge variant="secondary" className="text-xs">Gratuit</Badge>}
                  <span className="text-xs text-[#0F7A4B] flex items-center gap-1">Voir <ChevronRight className="h-3 w-3" /></span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
