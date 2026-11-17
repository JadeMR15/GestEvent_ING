import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { BrandName } from "@/components/BrandName";
import { useEffect, useLayoutEffect, useRef, useState, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchTakenCounts, takenOf } from "@/lib/event-taken";
import { useLikes } from "@/lib/likes";
import { Calendar, QrCode, Users, ArrowRight, ArrowUpRight, Timer, TrendingUp, Shield, Zap, Mail, Lock, Instagram, Facebook, Youtube, Search, MousePointerClick, Ticket, ScanLine } from "lucide-react";
import { isThisWeek, isThisMonth } from "date-fns";
import { isPastEvent } from "@/lib/event-dates";
import { Capacitor } from "@capacitor/core";
import { AppWelcome } from "@/components/AppWelcome";
import { useInView, usePrefersReducedMotion } from "@/components/landing/hooks";
import { CountUp } from "@/components/landing/Motion";
import { HeroCocotte } from "@/components/landing/HeroCocotte";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { FeaturesBento, type BentoFeature } from "@/components/landing/FeaturesBento";
import { AppShowcase } from "@/components/landing/AppShowcase";
import { Frame } from "@/components/landing/Frame";
import { CocotteCompanion } from "@/components/mascot/CocotteCompanion";
import { DanceScene } from "@/components/mascot/DanceScene";
import { RevealTitle } from "@/components/mascot/RevealTitle";
import { Plongeoir } from "@/components/mascot/Plongeoir";
import { EventMosaic, EventMosaicSkeleton } from "@/components/events/EventMosaic";
import { FilterCapsule, useStuck } from "@/components/events/FilterCapsule";
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
  const heroGridRef = useHeroRest();

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
  const capsule = useStuck<HTMLDivElement>();
  const featuresAnim = useInView(0.1);
  const ctaAnim    = useInView<HTMLElement>(0, false);

  const features: BentoFeature[] = [
    { icon: Calendar,     title: "Création rapide",    desc: "Titre, date, lieu, capacité. Ton event est en ligne en moins d'une minute.", area: "crea" },
    { icon: Timer,        title: "Timer 15 min",      desc: "La place est bloquée 15 min à la réservation. Le premier à confirmer l'obtient.", area: "timer" },
    { icon: QrCode,       title: "QR code à l'entrée", desc: "Un QR code par inscrit. Un scan à l'entrée, et c'est validé.", area: "qr" },
    { icon: Users,        title: "Inscription en un clic", desc: "Un clic pour réserver, la confirmation arrive par email.", area: "insc" },
    { icon: TrendingUp,   title: "Dashboard en direct", desc: "Inscrits, remplissage, présences : tes chiffres bougent en direct.", area: "dash" },
    { icon: Shield,       title: "Rôles clairs",      desc: "Orga, participant, bénévole, admin : chacun voit ce dont il a besoin.", area: "roles" },
    { icon: Zap,          title: "Synchro instantanée", desc: "Tout le monde voit les mêmes données, au même moment.", area: "sync" },
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

        <div ref={heroGridRef} className="lp-hero-grid container mx-auto px-4 sm:px-6">
          {/* Petit texte : badge (sans cadre) */}
          <p className="lp-hero-badge lp-caps-sm lp-fade-late">
            <img src="/plav-cocotte.svg" alt="" className="h-4 w-4 object-contain" />
            <span>plav' · la billetterie étudiante</span>
          </p>

          {/* Titre empilé */}
          <h1 className="lp-hero-title">
            <span className="lp-line" style={{ "--i": 0 } as CSSProperties}>Des soirées</span>{" "}
            <span className="lp-line" style={{ "--i": 1 } as CSSProperties}>pleines,</span>{" "}
            <span className="lp-line text-bordeaux-600" style={{ "--i": 2 } as CSSProperties}>des assos</span>{" "}
            <span className="lp-line text-bordeaux-600" style={{ "--i": 3 } as CSSProperties}><span className="t-accent plav-highlight">sereines.</span></span>
          </h1>

          {/* Phrase d'accroche */}
          <p className="lp-hero-sub lp-fade-later">
            Organise ou participe :{" "}<span className="lp-hero-sub-end text-bordeaux-800">Cocotte se plie en quatre pour le reste.</span>
          </p>

          {/* Chiffres, sous les boutons (séparés par un fin trait) */}
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

          {/* Actions : bouton Principal + lien vers les soirées */}
          <div className="lp-hero-actions lp-fade-later">
            {!loading && user ? (
              <>
                <Button asChild size="lg" variant="secondary"><Link to="/dashboard">Accéder à mon espace <ArrowRight /></Link></Button>
                <a href="#evenements" className="lp-arrow-link lp-caps">Voir les soirées <ArrowUpRight /></a>
              </>
            ) : (
              <>
                <Button asChild size="lg" variant="secondary"><Link to="/register">Créer un compte <ArrowRight /></Link></Button>
                <a href="#evenements" className="lp-arrow-link lp-caps">Découvrir les soirées <ArrowUpRight /></a>
              </>
            )}
          </div>
        </div>
      </section>


      {/* ── Events section (clair) ── */}
      <section id="evenements" className="lp-events relative py-20 md:py-28">
        <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div ref={eventsAnim.ref} className={`mb-10 md:mb-12 ${eventsAnim.visible ? "animate-fade-up" : "opacity-0"}`}>
          <h2 className="lp-section-title" style={{ color: "var(--text-title)" }}><span id="lp-cocotte-slot" className="lp-slot" aria-hidden="true"><img src="/plav-cocotte.svg" alt="" /></span>Les prochains <span className="t-accent plav-highlight">events</span></h2>
          <p className="mt-4 t-corps-l text-encre">Cocotte a mis les plus attendues en grand. À toi de choisir.</p>
        </div>

        {/* Recherche et filtres : capsule flottante, accrochée sous l'en-tête pendant la section */}
        <div ref={capsule.sentinel} aria-hidden="true" />
        {/* Pas d'animation d'apparition sur ce conteneur : elle empêcherait le flou d'arrière-plan
            de la capsule (backdrop-filter) une fois accrochée. */}
        <div className="cap-sticky mb-10">
          <FilterCapsule
            q={q}
            setQ={setQ}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            count={eventsLoading ? null : upcoming.length}
            stuck={capsule.stuck}
          />
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
      <section id="fonctionnalites" className="lp-frame-section relative">
        {/* Scène de danse posée sur le bord haut du cadre : Cocotte et les créatrices (essai) */}
        <DanceScene />
        <Frame>
        <div ref={featuresAnim.ref} className="mx-auto max-w-[1216px]">
          <div className={`mb-12 md:mb-16 ${featuresAnim.visible ? "animate-fade-up" : "opacity-0"}`}>
            <h2 className="lp-section-title text-blanc">Simple. <span className="t-accent text-jaune-300">Complet.</span></h2>
            <p className="mt-4 max-w-xl t-corps-l text-bordeaux-200">De la billetterie à l'entrée, Cocotte a tout plié.</p>
          </div>
          <FeaturesBento features={features} />
        </div>
        </Frame>
      </section>

      {/* ── How it works — scroll-driven stacked cards ── */}
      <StackedHowItWorks />

      {/* ── L'appli ── */}
      <AppShowcase />

      {/* ── CTA (sombre) ── */}
      {!loading && !user && (
        <section ref={ctaAnim.ref} className="lp-frame-section relative">
          {/* Plongeoir posé sur le bord haut du cadre (essai) */}
          <Plongeoir />
          <Frame className="lp-frame-cta">
          <img
            src="/plav-cocotte.svg"
            alt=""
            aria-hidden="true"
            className={`lp-cta-cocotte pointer-events-none plav-drift ${ctaAnim.visible ? "" : "lp-paused"}`}
          />
          <div className="relative z-10 mx-auto text-center">
            <span id="lp-cta-landing" className="lp-cta-landing">
              <img src="/plav-cocotte.svg" alt="" className="mx-auto mb-8 h-24 w-24 md:h-32 md:w-32 object-contain plav-spin-in" />
              {/* Éclaboussures depuis le centre de la cocotte, quand Cocotte s'y pose (essai) */}
              <span id="lp-splash" className="lp-splash" aria-hidden="true">
                {[0, 1, 2].map((n) => <span key={`r${n}`} className="lp-splash-ring" style={{ "--n": n } as CSSProperties} />)}
                {[-46, -30, -12, 10, 28, 44].map((dx, n) => (
                  <span key={`d${n}`} className="lp-splash-drop" style={{ "--n": n, "--dx": `${dx}px`, "--up": `${-30 - (n % 3) * 12}px` } as CSSProperties} />
                ))}
              </span>
            </span>
            <p className="t-corps-l text-blanc/80">Cocotte a déjà plongé.</p>
            <h2 className="lp-cta-title mt-4">À ton <span className="t-accent text-jaune-300">tour !</span></h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/register">Créer un compte gratuitement <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outlineLight">
                <Link to="/login">Se connecter</Link>
              </Button>
            </div>
          </div>
          </Frame>
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

      {/* Cocotte, la mascotte : prend le relais de la cocotte posée dans le titre (essai) */}
      <CocotteCompanion />
    </div>
  );
}

const HOW_CARDS = [
  { step: "01", title: "Tu crées l'event",         desc: "Titre, date, lieu, capa, image. C'est publié en moins d'une minute.",                                    cta: "Créer un event",        to: "/register", bg: "var(--bordeaux-600)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: Calendar },
  { step: "02", title: "Les gens s'inscrivent",    desc: "Un clic pour réserver. La place est bloquée 15 min : premiers arrivés, premiers servis.",                 cta: "Voir les events",       to: "/events/",  bg: "var(--jaune-300)", fg: "var(--bordeaux-600)", accent: "var(--bordeaux-600)", icon: Timer       },
  { step: "03", title: "Tu suis tout",             desc: "Inscriptions, remplissage, présences. Tout est dans ton dashboard, en direct.",                            cta: "Mon espace",            to: "/register", bg: "var(--bordeaux-500)", fg: "var(--neutre-blanc)", accent: "var(--jaune-100)", icon: TrendingUp  },
  { step: "04", title: "T'accueilles le jour J",   desc: "QR code unique par inscrit. Tu scannes à l'entrée, c'est validé. Rien à imprimer, rien à gérer.",         cta: "Commencer",             to: "/register", bg: "var(--bordeaux-800)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: QrCode      },
];

type HowCard = { step: string; title: string; desc: string; cta?: string; to?: string; bg: string; fg: string; accent: string; icon: typeof Calendar };

/** Parcours participant (ESSAI design-tests) : en miroir des cartes organisateur, fonds un cran différents. */
const HOW_CARDS_PART: HowCard[] = [
  { step: "01", title: "Tu trouves ta soirée",       desc: "Cocotte a mis les plus attendues en grand. Filtre par date ou par places dispo.", bg: "var(--bordeaux-500)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: Search },
  { step: "02", title: "Tu réserves en un clic",     desc: "Ta place est gardée 15 min, le temps de confirmer.",                              bg: "var(--jaune-200)", fg: "var(--bordeaux-600)", accent: "var(--bordeaux-600)", icon: MousePointerClick },
  { step: "03", title: "Tu reçois ton billet",       desc: "Confirmation par email, et ton QR code t'attend dans ton espace.",                bg: "var(--bordeaux-600)", fg: "var(--neutre-blanc)", accent: "var(--jaune-100)", icon: Ticket },
  { step: "04", title: "Tu entres en deux secondes", desc: "Tu montres ton QR, on le scanne, c'est parti.",                                  cta: "Voir les soirées", to: "/events/", bg: "var(--bordeaux-700)", fg: "var(--neutre-blanc)", accent: "var(--jaune-300)", icon: ScanLine },
];

/** Hauteur de la zone où le titre « Comment ça marche ? » reste collé (sous l'en-tête). */
const HOW_TITLE_TOP = 110;
const HOW_STEP = 16; // décalage entre deux cartes empilées

/**
 * Haut de page (ESSAI design-tests) : mesure la hauteur réelle du bloc hors titre (étiquette,
 * sous-titre, boutons, trait, chiffres, avec leurs espaces) et la donne au CSS (--hero-rest),
 * qui en déduit la taille du titre pour que tout tienne dans l'écran. Recalculée au redimensionnement.
 */
function useHeroRest() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const q = (c: string) => grid.querySelector<HTMLElement>(c);
    const calc = () => {
      const badge = q(".lp-hero-badge");
      const title = q(".lp-hero-title");
      const stats = q(".lp-hero-stats");
      if (!badge || !title || !stats) return;
      // offset* : positions sans les transform des animations d'apparition
      const rest = stats.offsetTop + stats.offsetHeight - badge.offsetTop - title.offsetHeight;
      grid.style.setProperty("--hero-rest", `${rest}px`);
    };
    calc();
    const ro = new ResizeObserver(calc);
    for (const c of [".lp-hero-badge", ".lp-hero-sub", ".lp-hero-actions", ".lp-hero-stats"]) {
      const el = q(c);
      if (el) ro.observe(el);
    }
    ro.observe(grid);
    window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);
  return ref;
}

/**
 * Géométrie de l'empilement (ESSAI design-tests), recalculée selon l'écran :
 * - les cartes se collent toujours sous le titre (jamais par-dessus ni dessous) ;
 * - le titre et chaque carte reçoivent une marge basse calculée pour qu'ils se décollent tous
 *   au même instant, quand la dernière carte se pose : ils remontent alors ensemble.
 */
function useHowStack() {
  const titleRef = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<{ top0: number; h: number; titleMb: number } | null>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const calc = () => {
      const vh = window.innerHeight;
      const titleBottom = HOW_TITLE_TOP + el.offsetHeight;
      const n = HOW_CARDS.length;
      // Ordinateur : la première rangée se colle ~10 px sous la ligne de base des étiquettes
      // « Tu organises / Tu participes » (interligne 1 : la ligne de base est ~0,155 em au-dessus du bas de la boîte)
      const labels = el.querySelector<HTMLElement>(".lp-how-labels");
      const labelFs = labels ? parseFloat(getComputedStyle(labels.querySelector(".lp-how-label") ?? labels).fontSize) : 0;
      const top0 = labels?.offsetParent
        ? HOW_TITLE_TOP + labels.offsetTop + labels.offsetHeight - 0.155 * labelFs + 10
        : Math.max(vh * 0.5 - 180, titleBottom + 16);
      const h = Math.max(240, Math.min(420, vh * 0.58, vh - top0 - (n - 1) * HOW_STEP - 16));
      const lastBottom = top0 + (n - 1) * HOW_STEP + h; // bas de la dernière carte une fois posée
      setG({ top0, h, titleMb: lastBottom - titleBottom });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);
  return { titleRef, g };
}

type HowSide = "orga" | "part";
const HOW_SIDES: { id: HowSide; label: string; tab: string }[] = [
  { id: "orga", label: "Tu organises", tab: "J'organise" },
  { id: "part", label: "Tu participes", tab: "Je participe" },
];

/** Une carte de la pile (même forme pour les deux parcours). */
function HowCardView({ card, side }: { card: HowCard; side: HowSide }) {
  return (
    <div
      className={`lp-how-card lp-how-card-${side}`}
      style={{ backgroundColor: card.bg, ["--how-accent" as string]: card.accent } as CSSProperties}
    >
      <span className="lp-how-number">{card.step}</span>
      <card.icon className="lp-how-icon" style={{ color: card.accent }} strokeWidth={2} aria-hidden="true" />
      <div className="lp-how-body">
        <div>
          <h3 className="t-titre-2 lp-how-title" style={{ color: card.fg }}>{card.title}</h3>
          <p className="t-corps" style={{ marginTop: "1rem", color: card.fg }}>{card.desc}</p>
        </div>
        {card.cta && card.to && (
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
        )}
      </div>
    </div>
  );
}

/** Interrupteur « J'organise / Je participe » (écrans étroits) : onglets accessibles au clavier. */
function HowTabs({ side, onChange }: { side: HowSide; onChange: (s: HowSide) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % HOW_SIDES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + HOW_SIDES.length) % HOW_SIDES.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = HOW_SIDES.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onChange(HOW_SIDES[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div role="tablist" aria-label="Parcours" className="lp-how-tabs">
      {HOW_SIDES.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`lp-how-tab-${s.id}`}
          aria-selected={side === s.id}
          aria-controls="lp-how-panel"
          tabIndex={side === s.id ? 0 : -1}
          className="lp-how-tab"
          onClick={() => onChange(s.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {s.tab}
        </button>
      ))}
    </div>
  );
}

function StackedHowItWorks() {
  const { titleRef, g } = useHowStack();
  const reduced = usePrefersReducedMotion();
  const [side, setSide] = useState<HowSide>("orga");
  const n = HOW_CARDS.length;
  // Avant la mesure (rendu serveur) : valeurs d'origine
  const cardTop = (i: number) => (g ? `${g.top0 + i * HOW_STEP}px` : `calc(50vh - 180px + ${i * HOW_STEP}px)`);
  const cardH = g ? `${g.h}px` : "min(420px, 58vh)";
  return (
    <section style={{ background: "transparent", paddingTop: "4rem" }} className={reduced ? "lp-how is-static" : "lp-how"}>
      {/* Titre et cartes dans le même conteneur : le titre se décolle avec les dernières cartes */}
      <div>
      <div ref={titleRef} style={{
        position:   reduced ? "relative" : "sticky",
        top:        reduced ? undefined : HOW_TITLE_TOP,
        zIndex:     0,
        width:      "100%",
        textAlign:  "left",
        padding:    "1rem 0 1.5rem",
        background: "transparent",
        // Marge basse = écart jusqu'au bas des dernières cartes posées : il se décolle en même temps qu'elles
        marginBottom: g && !reduced ? g.titleMb : 0,
      }}>
        {/* Même style et même alignement que les autres grands titres (« Simple. Complet. ») */}
        <div className="container mx-auto px-4 sm:px-6">
          <RevealTitle id="lp-how-title" text="Comment ça marche ?" accent="marche" className="lp-section-title" style={{ color: "var(--text-title)" }} />
          {/* Ordinateur : une étiquette au-dessus de chaque colonne */}
          <div className="lp-how-labels" aria-hidden="true">
            {HOW_SIDES.map((s) => <p key={s.id} className="lp-how-label">{s.label}</p>)}
          </div>
          {/* Écrans étroits : une seule pile, au choix */}
          <HowTabs side={side} onChange={setSide} />
        </div>
      </div>

        {/* La marge négative annule celle du titre dans la mise en page (les marges fusionnent) */}
        <div style={{ height: reduced ? 0 : "4vh", marginTop: g && !reduced ? -g.titleMb : 0 }} />

        {/* Les deux parcours avancent ensemble : chaque rangée (étape 01 orga + étape 01 participant…) est collée d'un bloc */}
        <div id="lp-how-panel" role="tabpanel" aria-labelledby={`lp-how-tab-${side}`} style={{ display: "contents" }}>
        {HOW_CARDS.flatMap((card, i) => [
          <div
            key={`card-${card.step}`}
            className="lp-how-row container mx-auto px-4 sm:px-6"
            data-side={side}
            style={{
              position:     reduced ? "relative" : "sticky",
              top:          reduced ? undefined : cardTop(i),
              zIndex:       i + 1,
              // Toutes les rangées se décollent au même instant que la dernière (marge = écart restant)
              marginBottom: reduced ? 16 : (n - 1 - i) * HOW_STEP,
              height:       reduced ? "auto" : cardH,
            } as CSSProperties}
          >
            <HowCardView card={card} side="orga" />
            <HowCardView card={HOW_CARDS_PART[i]} side="part" />
          </div>,

          // Espace de défilement entre deux rangées (la marge ajoutée est déduite) ; rien après la
          // dernière : la pile se termine quand elle se pose.
          <div
            key={`spacer-${i}`}
            style={{ height: i < n - 1 && !reduced ? `calc(50vh - ${(n - 1 - i) * HOW_STEP}px)` : 0 }}
          />,
        ])}
        </div>
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
