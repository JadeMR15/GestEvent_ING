import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, MapPin, Users } from "lucide-react";
import { takenOf } from "@/lib/event-taken";
import { LikeButton } from "@/components/LikeButton";
import { useInView, usePrefersReducedMotion } from "@/components/landing/hooks";
import "./mosaic.css";

/**
 * Présentation des événements en mosaïque « magazine » (ESSAI design-tests).
 * Composant d'affichage uniquement : il reçoit la liste déjà filtrée / triée et les likes
 * de la page, sans rien changer aux données ni aux filtres.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = any;
type Likes = { counts: Record<string, number>; mine: Set<string>; toggle: (id: string) => void };
type Size = "feature" | "big" | "wide" | "tall" | "small" | "solo" | "pair" | "full" | "carousel";

export type EventMosaicProps = {
  events: Ev[];
  likes: Likes;
  /** Badges existants de la page (Privé, Complet, X places…), en haut à droite. */
  renderBadges?: (e: Ev) => ReactNode;
  /** Étiquettes existantes de la page (école, association…), au-dessus du titre. */
  renderTags?: (e: Ev) => ReactNode;
  /** Lieu, tel que la page l'affichait. */
  placeOf?: (e: Ev) => string;
  /** Affiche « X / ∞ » pour les événements sans capacité (page d'accueil). */
  showUnlimited?: boolean;
};

const DAY = 24 * 60 * 60 * 1000;
const RHYTHM: Size[] = ["wide", "small", "small", "tall", "small", "wide", "small", "small"];

const priceLabel = (e: Ev) =>
  e.price > 0 ? `${Number(e.price).toFixed(2).replace(".", ",").replace(",00", "")} €` : "Gratuit";

/** Score d'importance (affichage seulement) : date proche, remplissage, likes. */
function scoreOf(e: Ev, likes: number, maxLikes: number, now: number) {
  const days = (new Date(e.starts_at).getTime() - now) / DAY;
  const soon = days >= 0 && days <= 14 ? 1 - days / 14 : 0;
  const fill = e.capacity > 0 ? Math.min(1, takenOf(e) / e.capacity) : 0;
  const liked = maxLikes > 0 ? likes / maxLikes : 0;
  return soon * 0.5 + fill * 0.3 + liked * 0.2;
}

/** Les likes arrivent après les événements : on attend qu'ils soient là (ou 900 ms) avant de figer les tailles. */
function useLikesSettled(counts: Record<string, number>, hasEvents: boolean) {
  const [settled, setSettled] = useState(false);
  const hasCounts = Object.keys(counts).length > 0;
  useEffect(() => {
    if (!hasEvents || settled) return;
    if (hasCounts) { setSettled(true); return; }
    const t = window.setTimeout(() => setSettled(true), 900);
    return () => window.clearTimeout(t);
  }, [hasEvents, hasCounts, settled]);
  return settled;
}

export function EventMosaic({ events, likes, renderBadges, renderTags, placeOf, showUnlimited = false }: EventMosaicProps) {
  const reduced = usePrefersReducedMotion();
  const settled = useLikesSettled(likes.counts, events.length > 0);
  const countsRef = useRef(likes.counts);
  countsRef.current = likes.counts;
  const idsKey = events.map((e) => e.id).join(",");

  // Mise en page figée par liste (filtres) : un like ne fait pas sauter les cartes.
  const layout = useMemo(() => {
    if (!settled) return null;
    const counts = countsRef.current;
    const now = Date.now();
    const maxLikes = Math.max(0, ...events.map((e) => counts[e.id] ?? 0));
    const ranked = [...events].sort(
      (a, b) => scoreOf(b, counts[b.id] ?? 0, maxLikes, now) - scoreOf(a, counts[a.id] ?? 0, maxLikes, now),
    );
    const featured = ranked[0];
    const bigs = ranked.slice(1, 3).map((e) => e.id);
    const rest = events.filter((e) => e.id !== featured?.id && !bigs.includes(e.id));
    const n = events.length;

    const sizes: Record<string, Size> = {};
    if (n === 1) sizes[featured.id] = "solo";
    else if (n === 2) { sizes[featured.id] = "pair"; sizes[bigs[0]] = "pair"; }
    else {
      sizes[featured.id] = "feature";
      bigs.forEach((id) => { sizes[id] = "tall"; });
      rest.forEach((e, i) => { sizes[e.id] = RHYTHM[i % RHYTHM.length]; });
    }
    const desktop = featured ? [featured, ...events.filter((e) => bigs.includes(e.id)).sort((a, b) => bigs.indexOf(a.id) - bigs.indexOf(b.id)), ...rest] : [];

    // Mobile : À la une, puis « Cette semaine » (7 prochains jours), puis les autres
    const week = events.filter((e) => {
      if (e.id === featured?.id) return false;
      const d = new Date(e.starts_at).getTime() - now;
      return d >= -12 * 60 * 60 * 1000 && d <= 7 * DAY;
    });
    const others = events.filter((e) => e.id !== featured?.id && !week.some((w) => w.id === e.id));
    return { featured, sizes, desktop, week, others };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, settled]);

  // ── FLIP : quand la liste change, les cartes glissent vers leur nouvelle place ──
  const gridRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      next.set(id, { x: r.left - g.left, y: r.top - g.top });
    });
    if (!reduced && prevRects.current.size > 0) {
      next.forEach((p, id) => {
        const before = prevRects.current.get(id);
        const el = nodes.current.get(id);
        if (!before || !el) return;
        const dx = before.x - p.x;
        const dy = before.y - p.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      });
    }
    prevRects.current = next;
  }, [layout, reduced]);

  if (!layout) return <EventMosaicSkeleton />;

  const card = (e: Ev, size: Size, i: number, register = false) => (
    <PosterCard
      key={e.id}
      e={e}
      size={size}
      index={i}
      featured={e.id === layout.featured?.id}
      likes={likes}
      renderBadges={renderBadges}
      renderTags={renderTags}
      placeOf={placeOf}
      showUnlimited={showUnlimited}
      nodeRef={register ? (el) => { if (el) nodes.current.set(e.id, el); else nodes.current.delete(e.id); } : undefined}
    />
  );

  return (
    <>
      {/* Ordinateur et tablette : mosaïque */}
      <div ref={gridRef} className="mz-grid">
        {layout.desktop.map((e, i) => card(e, layout.sizes[e.id], i, true))}
      </div>

      {/* Mobile : À la une, Cette semaine, puis tous les autres */}
      <div className="mz-mobile">
        {layout.featured && card(layout.featured, "full", 0)}
        {layout.week.length > 0 && (
          <section className="mz-week" aria-label="Cette semaine">
            <h3 className="mz-week-title">Cette semaine</h3>
            <div className="mz-rail no-scrollbar">
              {layout.week.map((e, i) => card(e, "carousel", i))}
            </div>
          </section>
        )}
        {layout.others.map((e, i) => card(e, "full", i))}
      </div>
    </>
  );
}

function PosterCard({
  e, size, index, featured, likes, renderBadges, renderTags, placeOf, showUnlimited, nodeRef,
}: {
  e: Ev; size: Size; index: number; featured: boolean; likes: Likes;
  renderBadges?: (e: Ev) => ReactNode; renderTags?: (e: Ev) => ReactNode; placeOf?: (e: Ev) => string;
  showUnlimited: boolean; nodeRef?: (el: HTMLElement | null) => void;
}) {
  const { ref, visible } = useInView<HTMLDivElement>(0.1);
  const taken = takenOf(e);
  const isFull = e.capacity > 0 && taken >= e.capacity;
  const remaining = e.capacity - taken;
  const pct = e.capacity > 0 ? Math.min(1, taken / e.capacity) : 0;
  const d = new Date(e.starts_at);
  const large = size === "feature" || size === "solo" || size === "pair" || (size === "full" && featured);
  const place = placeOf ? placeOf(e) : e.location || "En ligne";

  return (
    <div
      ref={(el) => { (ref as MutableRefObject<HTMLDivElement | null>).current = el; nodeRef?.(el); }}
      className={`mz-cell mz-${size} ${visible ? "is-in" : ""}`}
      style={{ "--d": `${(index % 8) * 60}ms` } as CSSProperties}
    >
      <Link to="/events/$eventId" params={{ eventId: e.id }} className={`mz-card ${large ? "is-large" : ""}`}>
        <div className="mz-media">
          {e.cover_image_url ? (
            <img src={e.cover_image_url} alt={e.title} loading="lazy" />
          ) : (
            <div className="mz-fallback"><img src="/plav-cocotte.svg" alt="" loading="lazy" /></div>
          )}
        </div>
        <div className="mz-shade" aria-hidden="true" />

        {/* Date façon calendrier */}
        <div className="mz-top-left">
          <div className="mz-date">
            <span className="mz-date-day">{format(d, "d")}</span>
            <span className="mz-date-month">{format(d, "MMM", { locale: fr }).replace(".", "")}</span>
          </div>
          {featured && <span className="mz-une">À la une</span>}
        </div>

        {/* Badges existants + prix */}
        <div className="mz-top-right">
          {renderBadges?.(e)}
          <span className="mz-price">{priceLabel(e)}</span>
        </div>

        <div className="mz-body">
          {renderTags && <div className="mz-tags">{renderTags(e)}</div>}
          <h3 className="mz-title">{e.title}</h3>
          {large && <p className="mz-desc">{e.description || "Aucune description."}</p>}
          <p className="mz-meta">
            <Clock className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{format(d, "EEE HH'h'mm", { locale: fr })}</span>
            <MapPin className="ml-2 h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="truncate">{place}</span>
          </p>
          <div className="mz-foot">
            {(e.capacity > 0 || showUnlimited) && (
              <div className="mz-fill">
                {e.capacity > 0 && (
                  <div className="mz-gauge">
                    <span
                      className={isFull ? "is-full" : remaining < 10 ? "is-low" : ""}
                      style={{ transform: `scaleX(${isFull ? 1 : pct})` }}
                    />
                  </div>
                )}
                <span className="mz-count">
                  <Users className="h-3.5 w-3.5" strokeWidth={2} />
                  {taken} / {e.capacity > 0 ? e.capacity : "∞"}
                </span>
              </div>
            )}
            <LikeButton className="mz-like" count={likes.counts[e.id] ?? 0} liked={likes.mine.has(e.id)} onToggle={() => likes.toggle(e.id)} />
          </div>
        </div>
      </Link>
    </div>
  );
}

/** Squelettes de chargement aux formes de la mosaïque. */
export function EventMosaicSkeleton() {
  const desk: Size[] = ["feature", "tall", "tall", "wide", "small", "small"];
  return (
    <div aria-hidden="true">
      <div className="mz-grid">
        {desk.map((s, i) => <div key={i} className={`mz-cell mz-${s}`}><div className="mz-skel" /></div>)}
      </div>
      <div className="mz-mobile">
        <div className="mz-cell mz-full"><div className="mz-skel" /></div>
        <div className="mz-rail no-scrollbar">
          {[0, 1].map((i) => <div key={i} className="mz-cell mz-carousel"><div className="mz-skel" /></div>)}
        </div>
      </div>
    </div>
  );
}
