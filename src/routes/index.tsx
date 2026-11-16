import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { BrandName } from "@/components/BrandName";
import { useEffect, useState, useMemo, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchTakenCounts, takenOf } from "@/lib/event-taken";
import { useLikes } from "@/lib/likes";
import { Calendar, QrCode, Users, ArrowRight, ArrowUpRight, Timer, Search, Clock, TrendingUp, Shield, Zap, Globe, Mail, Lock, Instagram, Facebook, Youtube } from "lucide-react";
import { isThisWeek, isThisMonth } from "date-fns";
import { isPastEvent } from "@/lib/event-dates";
import { Capacitor } from "@capacitor/core";
import { AppWelcome } from "@/components/AppWelcome";
import { useInView } from "@/components/landing/hooks";
import { CountUp, Reveal } from "@/components/landing/Motion";
import { HeroCocotte } from "@/components/landing/HeroCocotte";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { FeaturesBento, type BentoFeature } from "@/components/landing/FeaturesBento";
import { AppShowcase } from "@/components/landing/AppShowcase";
import { EventMosaic, EventMosaicSkeleton } from "@/components/events/EventMosaic";
import { LandingSky } from "@/components/landing/LandingSky";
import "@/components/landing/landing.css";

export const Route = createFileRoute("/")({
  // Dans l'app native : écran d'accueil dédié au lieu de la page vitrine.
  component: () => (Capacitor.isNativePlatform() ? <AppWelcome /> : <Landing />),
});

type DateFilter = "all" | "week" | "month";
type StatusFilter = "all" | "open" | "full";

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

      const taken = await fetchTakenCounts(all.map((e: any) => e.id));
      const enriched = all.map((e: any) => ({ ...e, registrations: regsMap[e.id] ?? [], taken: taken[e.id] }));
      setEvents(enriched);
      const totalParticipants = enriched.reduce((acc: number, e: any) =>
        acc + (e.registrations ?? []).filter((r: any) => r.status === "registered" || r.status === "attended").length, 0);
      const organizerIds = new Set(enriched.map((e: any) => e.organizer_id));
      setStats({ events: enriched.length, participants: totalParticipants, organizers: organizerIds.size });
      setEventsLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => events.filter((e) => {
    const isFull = e.capacity > 0 && takenOf(e) >= e.capacity;
    if (q && !e.title.toLowerCase().includes(q.toLowerCase()) && !e.location?.toLowerCase().includes(q.toLowerCase())) return false;
    if (dateFilter === "week" && !isThisWeek(new Date(e.starts_at))) return false;
    if (dateFilter === "month" && !isThisMonth(new Date(e.starts_at))) return false;
    if (statusFilter === "open" && isFull) return false;
    if (statusFilter === "full" && !isFull) return false;
    return true;
  }), [events, q, dateFilter, statusFilter]);

  // Les événements passés ne sont plus affichés (ils restent dans « Mes billets »).
  const upcoming = filtered.filter((e) => !isPastEvent(e.starts_at));

  const heroAnim   = useInView<HTMLElement>(0, false);
  const statsAnim  = useInView(0.3);
  const eventsAnim = useInView(0.1);
  const featuresAnim = useInView(0.1);
  const ctaAnim    = useInView<HTMLElement>(0, false);

  const features: BentoFeature[] = [
    { icon: Calendar,     title: "Création rapide",    desc: "Titre, date, lieu, capacité. Ton event est en ligne en moins d'une minute.", area: "crea" },
    { icon: Timer,        title: "Timer 15 min",      desc: "La place est bloquée 15 min à la réservation. Le premier à confirmer l'obtient.", area: "timer" },
    { icon: QrCode,       title: "QR code à l'entrée", desc: "Chaque inscrit reçoit son QR. Tu scannes, tu valides. Rapide et sans papier.", area: "qr" },
    { icon: Users,        title: "Inscription en un clic", desc: "Un clic pour réserver, confirmation par email. Pas besoin de faire compliqué.", area: "insc" },
    { icon: TrendingUp,   title: "Dashboard en direct", desc: "Inscriptions, taux de remplissage, présences — tout se met à jour en temps réel.", area: "dash" },
    { icon: Shield,       title: "Rôles clairs",      desc: "Orga, participant, bénévole, admin — chacun voit ce dont il a besoin.", area: "roles" },
    { icon: Zap,          title: "Synchro instantanée", desc: "Tout le monde voit les mêmes données, au même moment.", area: "sync" },
    { icon: Globe,        title: "Sans compte requis", desc: "Les events publics sont visibles par tout le monde. Partage le lien, c'est réglé.", area: "web" },
  ];

  return (
    <div className="lp-page min-h-screen" style={{ overflowX: "clip" }}>
      <LandingSky />

      {/* ── Header : blanc, logo couleur, liens en petites capitales ── */}
      <LandingHeader
        actions={
          !loading && user ? (
            <Button asChild>
              <Link to="/dashboard">Mon espace <ArrowRight /></Link>
            </Button>
          ) : (
            <>
              <Link to="/login" className="lp-caps text-encre transition-colors hover:text-bordeaux-600">Connexion</Link>
              <Button asChild size="sm"><Link to="/register">Commencer</Link></Button>
            </>
          )
        }
      />

      {/* ── Hero « studio » : fond blanc, cocotte 3D à gauche, titre empilé à droite ── */}
      <section ref={heroAnim.ref} className="lp-hero">
        <HeroCocotte playing={heroAnim.visible} />

        <div className="lp-hero-grid container mx-auto px-4 sm:px-6">
          {/* Petit texte : badge (sans cadre) */}
          <p className="lp-hero-badge lp-caps-sm lp-fade-late">
            <img src="/plav-cocotte.svg" alt="" className="h-4 w-4 object-contain" />
            <span>plav' · la billetterie étudiante</span>
          </p>

          {/* Titre empilé, aligné à droite */}
          <h1 className="lp-hero-title">
            <span className="lp-line" style={{ "--i": 0 } as CSSProperties}>Pour ceux qui</span>{" "}
            <span className="lp-line" style={{ "--i": 1 } as CSSProperties}>organisent,</span>{" "}
            <span className="lp-line text-bordeaux-600" style={{ "--i": 2 } as CSSProperties}>et ceux qui</span>{" "}
            <span className="lp-line text-bordeaux-600" style={{ "--i": 3 } as CSSProperties}><span className="t-accent plav-highlight">viennent.</span></span>
          </h1>

          {/* Petit texte : sous-titre */}
          <p className="lp-hero-sub lp-caps-sm lp-fade-later">
            Organise ou participe — <span className="text-bordeaux-800">plav' s'occupe du reste.</span>
          </p>

          {/* Chiffres en haut à droite */}
          <div ref={statsAnim.ref} className="lp-hero-stats lp-fade-late">
            {[
              { value: stats.events, label: "events publiés" },
              { value: stats.participants, label: "participants" },
              { value: stats.organizers, label: "organisateurs" },
            ].map((s) => (
              <div key={s.label} className="lp-stat">
                <p className="lp-stat-value">
                  <sup className="lp-stat-plus">+</sup>
                  {eventsLoading ? "—" : <CountUp value={s.value} active={statsAnim.visible} delay={900} />}
                </p>
                <p className="lp-stat-label lp-caps-xs">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Actions : lien vers les soirées + bouton Principal */}
          <div className="lp-hero-actions lp-fade-later">
            {!loading && user ? (
              <>
                <a href="#evenements" className="lp-arrow-link lp-caps">Voir les soirées <ArrowUpRight /></a>
                <Button asChild size="lg" variant="secondary"><Link to="/dashboard">Accéder à mon espace <ArrowRight /></Link></Button>
              </>
            ) : (
              <>
                <a href="#evenements" className="lp-arrow-link lp-caps">Découvrir les soirées <ArrowUpRight /></a>
                <Button asChild size="lg" variant="secondary"><Link to="/register">Créer un compte <ArrowRight /></Link></Button>
              </>
            )}
          </div>
        </div>
      </section>


      {/* ── Events section (clair) ── */}
      <section id="evenements" className="lp-events relative py-20 md:py-28">
        <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div ref={eventsAnim.ref} className={`mb-10 md:mb-12 ${eventsAnim.visible ? "animate-fade-up" : "opacity-0"}`}>
          <h2 className="lp-section-title" style={{ color: "var(--text-title)" }}>Les prochains <span className="t-accent plav-highlight">events</span></h2>
          <p className="mt-4 t-corps-l text-encre">Accessibles sans compte. Un lien, c'est tout.</p>
        </div>

        <div className={`mb-10 flex flex-col gap-3 md:flex-row ${eventsAnim.visible ? "animate-fade-up delay-200" : "opacity-0"}`}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par titre ou lieu…" className="pl-9 bg-white w-full" />
          </div>
          <div className="flex flex-wrap gap-3 md:flex-nowrap">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="flex-1 min-w-fit md:w-auto md:min-w-52 bg-white [&>span]:flex-1 [&>span]:text-left">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes dates</SelectItem>
                <SelectItem value="week">Cette semaine</SelectItem>
                <SelectItem value="month">Ce mois</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="flex-1 min-w-fit md:w-auto md:min-w-52 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="open">Places disponibles</SelectItem>
                <SelectItem value="full">Complet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {eventsLoading ? (
          <EventMosaicSkeleton />
        ) : upcoming.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <EmptyState title="Aucun événement trouvé." />
          </Card>
        ) : (
          <EventGrid events={upcoming} user={user} />
        )}

        </div>
      </section>

      {/* ── Features (sombre) : grille bento ── */}
      <section id="fonctionnalites" className="lp-dark-fade relative overflow-hidden">
        <div ref={featuresAnim.ref} className="container mx-auto px-4 sm:px-6">
          <div className={`mb-12 md:mb-16 ${featuresAnim.visible ? "animate-fade-up" : "opacity-0"}`}>
            <h2 className="lp-section-title text-blanc">Simple. <span className="t-accent text-jaune-300">Complet.</span></h2>
            <p className="mt-4 max-w-xl t-corps-l text-bordeaux-200">De la création de l'event à l'accueil à l'entrée, tout est là.</p>
          </div>
          <FeaturesBento features={features} />
        </div>
      </section>

      {/* ── How it works — scroll-driven stacked cards ── */}
      <StackedHowItWorks />

      {/* ── L'appli ── */}
      <AppShowcase />

      {/* ── CTA (sombre) ── */}
      {!loading && !user && (
        <section ref={ctaAnim.ref} className="lp-dark-fade relative overflow-hidden px-4 sm:px-6">
          <img
            src="/plav-cocotte.svg"
            alt=""
            aria-hidden="true"
            className={`lp-cta-cocotte pointer-events-none plav-drift ${ctaAnim.visible ? "" : "lp-paused"}`}
          />
          <Reveal className="relative z-10 container mx-auto text-center">
            <img src="/plav-cocotte.svg" alt="" className="mx-auto mb-8 h-24 w-24 md:h-32 md:w-32 object-contain plav-spin-in" />
            <h2 className="lp-cta-title">T'attends <span className="t-accent text-jaune-300">quoi ?</span></h2>
            <p className="mt-6 t-corps-l text-blanc/80">Rejoins les assos qui font confiance à plav'.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/register">Créer un compte gratuitement <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outlineLight">
                <Link to="/login">Se connecter</Link>
              </Button>
            </div>
          </Reveal>
        </section>
      )}

      {/* ── Footer ── */}
      <footer id="contact" className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BrandName className="h-12" />
              </div>
              <p className="text-sm text-encre">La plateforme de billetterie étudiante pour les assos qui gèrent.</p>
            </div>
            <div>
              <h4 className="t-surtitre mb-3 text-bordeaux-800">Navigation</h4>
              <ul className="space-y-2 text-sm text-encre">
                <li><a href="#evenements" className="hover:text-bordeaux-800 transition-colors">Événements</a></li>
                <li><a href="#fonctionnalites" className="hover:text-bordeaux-800 transition-colors">Fonctionnalités</a></li>
                <li><Link to="/login" className="hover:text-bordeaux-800 transition-colors">Connexion</Link></li>
                <li><Link to="/register" className="hover:text-bordeaux-800 transition-colors">Inscription</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="t-surtitre mb-3 text-bordeaux-800">À propos</h4>
              <ul className="space-y-2 text-sm text-encre">
                <li><Link to="/about" hash="organisateur" className="hover:text-bordeaux-800 transition-colors">Organisateur</Link></li>
                <li><Link to="/about" hash="participant" className="hover:text-bordeaux-800 transition-colors">Participant</Link></li>
                <li><Link to="/about" hash="benevole" className="hover:text-bordeaux-800 transition-colors">Bénévole</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="t-surtitre mb-3 text-bordeaux-800">Contact</h4>
              <div className="flex items-center gap-2 text-sm text-encre mb-4">
                <Mail className="h-4 w-4" /><span>support@plav.app</span>
              </div>
              <div className="flex items-center gap-3">
                <a href="https://instagram.com/plav_app" target="_blank" rel="noopener noreferrer" className="text-encre hover:text-bordeaux-800 transition-colors" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="https://facebook.com/plav.app" target="_blank" rel="noopener noreferrer" className="text-encre hover:text-bordeaux-800 transition-colors" aria-label="Facebook">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="https://youtube.com/@plav_app" target="_blank" rel="noopener noreferrer" className="text-encre hover:text-bordeaux-800 transition-colors" aria-label="YouTube">
                  <Youtube className="h-5 w-5" />
                </a>
                <a href="https://tiktok.com/@plav_app" target="_blank" rel="noopener noreferrer" className="text-encre hover:text-bordeaux-800 transition-colors" aria-label="TikTok">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-bordure pt-6 text-center text-xs text-encre">
            © {new Date().getFullYear()} <BrandName className="h-5 align-middle" />. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}

const HOW_CARDS = [
  { step: "01", title: "Tu crées l'event",         desc: "Titre, date, lieu, capa, image. C'est publié en moins d'une minute.",                                    cta: "Créer un event",        to: "/register", bg: "var(--bordeaux-600)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: Calendar },
  { step: "02", title: "Les gens s'inscrivent",    desc: "Un clic pour réserver. La place est bloquée 15 min — premiers arrivés, premiers servis.",                 cta: "Voir les events",       to: "/events/",  bg: "var(--jaune-300)", fg: "var(--bordeaux-600)", accent: "var(--bordeaux-600)", icon: Timer       },
  { step: "03", title: "Tu suis tout",             desc: "Inscriptions, remplissage, présences. Tout est dans ton dashboard, en direct.",                            cta: "Mon espace",            to: "/register", bg: "var(--bordeaux-500)", fg: "var(--neutre-blanc)", accent: "var(--jaune-100)", icon: TrendingUp  },
  { step: "04", title: "T'accueilles le jour J",   desc: "QR code unique par inscrit. Tu scannes à l'entrée, c'est validé. Rien à imprimer, rien à gérer.",         cta: "Commencer",             to: "/register", bg: "var(--bordeaux-800)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: QrCode      },
];

function StackedHowItWorks() {
  return (
    <section style={{ background: "transparent", paddingTop: "4rem" }}>
      <div style={{
        position:   "sticky",
        top:        110,
        zIndex:     0, /* sous les cartes : elles le recouvrent en remontant (pas de bande de fond) */
        width:      "100%",
        textAlign:  "center",
        padding:    "1rem 0 1.5rem",
        background: "transparent",
      }}>
        <h2 style={{ color: "var(--text-title)" }}>
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
              borderRadius:    "var(--radius-carte)",
              overflow:        "hidden",
              backgroundColor: card.bg,
              boxShadow:       "var(--ombre-menu)",
              ["--how-accent" as string]: card.accent,
            } as CSSProperties}
          >
            <span className="lp-how-number">{card.step}</span>
            <div className="relative grid grid-cols-1 sm:grid-cols-2 h-full">
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "clamp(1.5rem, 5vw, 2.5rem)" }}>
                <div>
                  <h3 className="t-titre-2" style={{ marginTop: "0.5rem", color: card.fg }}>
                    {card.title}
                  </h3>
                  <p className="t-corps" style={{ marginTop: "1rem", color: card.fg }}>
                    {card.desc}
                  </p>
                </div>
                <div style={{ marginTop: "1.5rem" }}>
                  <Link to={card.to}>
                    <button
                      className="t-bouton"
                      style={{ height: "var(--hauteur-controle)", borderRadius: "var(--radius-moyen)", border: `2px solid ${card.accent}`, color: card.accent, padding: "0 24px", background: "transparent", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                    >
                      {card.cta}
                    </button>
                  </Link>
                </div>
              </div>
              <div className="hidden sm:flex" style={{ alignItems: "flex-start", justifyContent: "flex-end", padding: "clamp(1.5rem, 5vw, 2.5rem)", opacity: 0.16 }}>
                <card.icon style={{ width: 110, height: 110, color: card.accent }} strokeWidth={2} />
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

function EventGrid({ events }: { events: any[]; muted?: boolean; user: any }) {
  const likes = useLikes(useMemo(() => events.map((e) => e.id), [events]));
  return (
    <EventMosaic
      events={events}
      likes={likes}
      showUnlimited
      placeOf={(e) => e.location || "En ligne"}
      renderBadges={(e) => {
        const taken = takenOf(e);
        const isFull = e.capacity > 0 && taken >= e.capacity;
        const remaining = e.capacity - taken;
        return (
          <>
            {e.status === "private" && <Badge className="bg-bordeaux-600 hover:bg-bordeaux-600"><Lock className="mr-1 h-3 w-3" />Privé</Badge>}
            {isFull ? <Badge variant="destructive">Complet</Badge>
              : remaining > 0 && remaining < 10 ? <Badge variant="warning">{remaining} place{remaining > 1 ? "s" : ""}</Badge>
              : null}
          </>
        );
      }}
    />
  );
}
