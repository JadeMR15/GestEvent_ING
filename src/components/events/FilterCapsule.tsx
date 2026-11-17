import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Euro, Flame, Gift, GraduationCap, MapPin, Search, SlidersHorizontal, Ticket, Users, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./capsule.css";

/**
 * Barre de recherche « capsule » (ESSAI design-tests) — présentation seulement.
 * Elle pilote exactement les mêmes états que l'ancienne barre (recherche, dates, statut).
 */

export type DateFilter = "all" | "today" | "weekend" | "week" | "month";
/** open = places disponibles · last = dernières places (moins de 10) · full = complet */
export type StatusFilter = "all" | "open" | "last" | "full";
export type PriceFilter = "all" | "free" | "under10";

const DATES: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Toutes dates" },
  { value: "today", label: "Ce soir" },
  { value: "weekend", label: "Ce week-end" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

/** Filtres du panneau « Plus » (budget, ville, école, association). */
export interface MoreFilters {
  price: PriceFilter;
  setPrice: (v: PriceFilter) => void;
  city: string;
  setCity: (v: string) => void;
  school: string;
  setSchool: (v: string) => void;
  asso: string;
  setAsso: (v: string) => void;
  cities: string[];
  schools: string[];
  assos: string[];
}

/** Accroche : `stuck` passe à true quand la capsule est collée sous l'en-tête
 *  (même hauteur que `top` dans capsule.css : 80 px sur mobile, 96 px sur ordinateur). */
export function useStuck<T extends HTMLElement>() {
  const sentinel = useRef<T>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const top = window.matchMedia("(min-width: 768px)").matches ? 96 : 80;
    const obs = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top),
      { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { sentinel, stuck };
}

/** Conteneur capsule réutilisable (aussi pour la page des événements). */
export function Capsule({ children, stuck, className = "" }: { children: ReactNode; stuck?: boolean; className?: string }) {
  return <div className={`cap ${stuck ? "is-stuck" : ""} ${className}`}>{children}</div>;
}

export function FilterCapsule({
  q, setQ, dateFilter, setDateFilter, statusFilter, setStatusFilter, count, stuck, more,
}: {
  q: string;
  setQ: (v: string) => void;
  dateFilter: DateFilter;
  setDateFilter: (v: DateFilter) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  count: number | null;
  stuck: boolean;
  more: MoreFilters;
}) {
  // Nombre de filtres actifs dans le panneau « Plus » (Places disponibles a sa propre pastille)
  const moreCount = [
    more.price !== "all", statusFilter === "last" || statusFilter === "full",
    more.city !== "all", more.school !== "all", more.asso !== "all",
  ].filter(Boolean).length;
  const resetMore = () => {
    more.setPrice("all"); more.setCity("all"); more.setSchool("all"); more.setAsso("all");
    if (statusFilter !== "open") setStatusFilter("all");
  };

  // Curseur jaune qui glisse sous l'onglet de date actif (transform uniquement)
  const tabsRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const wrap = tabsRef.current;
    if (!wrap) return;
    const update = () => {
      const btn = wrap.querySelector<HTMLButtonElement>(`[data-value="${dateFilter}"]`);
      if (btn) setCursor({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [dateFilter]);

  return (
    <div className="cap-wrap">
      <Capsule stuck={stuck} className="cap-home">
        {/* Recherche */}
        <label className="cap-search">
          <span className="cap-search-icon" aria-hidden="true"><Search className="h-4 w-4" strokeWidth={2.25} /></span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Soirée, asso, école, ville…"
            className="cap-input"
          />
        </label>

        <div className="cap-row no-scrollbar">
          {/* Dates : onglets */}
          <div ref={tabsRef} className="cap-tabs" role="radiogroup">
            {cursor && (
              <span
                aria-hidden="true"
                className="cap-cursor"
                style={{ transform: `translateX(${cursor.x}px) scaleX(${cursor.w / 100})` }}
              />
            )}
            {DATES.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={dateFilter === d.value}
                data-value={d.value}
                className={`cap-tab ${dateFilter === d.value ? "is-active" : ""}`}
                onClick={() => setDateFilter(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Statut : « Places disponibles » (open ↔ all) */}
          <button
            type="button"
            aria-pressed={statusFilter === "open"}
            className={`cap-pill ${statusFilter === "open" ? "is-on" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "open" ? "all" : "open")}
          >
            Places disponibles
          </button>

          {/* Plus : budget, places, ville, école, association */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={`cap-pill cap-more ${moreCount > 0 ? "is-on" : ""}`}>
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                Plus
                {moreCount > 0 && <span className="cap-badge">{moreCount}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} className="cap-panel w-[min(92vw,360px)] p-0">
              <div className="space-y-5 p-5">
                <PanelGroup title="Budget">
                  <PanelChip on={more.price === "free"} onClick={() => more.setPrice(more.price === "free" ? "all" : "free")}>
                    <Gift className="h-3.5 w-3.5" />Gratuit
                  </PanelChip>
                  <PanelChip on={more.price === "under10"} onClick={() => more.setPrice(more.price === "under10" ? "all" : "under10")}>
                    <Euro className="h-3.5 w-3.5" />Moins de 10 €
                  </PanelChip>
                </PanelGroup>

                <PanelGroup title="Places">
                  <PanelChip on={statusFilter === "open"} onClick={() => setStatusFilter(statusFilter === "open" ? "all" : "open")}>
                    <Ticket className="h-3.5 w-3.5" />Places disponibles
                  </PanelChip>
                  <PanelChip on={statusFilter === "last"} onClick={() => setStatusFilter(statusFilter === "last" ? "all" : "last")}>
                    <Flame className="h-3.5 w-3.5" />Dernières places
                  </PanelChip>
                  <PanelChip on={statusFilter === "full"} onClick={() => setStatusFilter(statusFilter === "full" ? "all" : "full")}>
                    Complet
                  </PanelChip>
                </PanelGroup>

                {(more.cities.length > 1 || more.schools.length > 1 || more.assos.length > 1) && (
                  <div>
                    <p className="cap-panel-title">Où et avec qui</p>
                    <div className="space-y-2">
                      {more.cities.length > 1 && (
                        <PanelSelect icon={<MapPin className="h-4 w-4" />} value={more.city} onChange={more.setCity} all="Toutes les villes" options={more.cities} />
                      )}
                      {more.schools.length > 1 && (
                        <PanelSelect icon={<GraduationCap className="h-4 w-4" />} value={more.school} onChange={more.setSchool} all="Toutes les écoles" options={more.schools} />
                      )}
                      {more.assos.length > 1 && (
                        <PanelSelect icon={<Users className="h-4 w-4" />} value={more.asso} onChange={more.setAsso} all="Toutes les assos" options={more.assos} />
                      )}
                    </div>
                  </div>
                )}
              </div>
              {moreCount > 0 && (
                <div className="border-t border-bordure px-5 py-3">
                  <button type="button" onClick={resetMore} className="inline-flex min-h-[36px] items-center gap-1.5 text-sm font-semibold text-bordeaux-600 hover:underline">
                    <X className="h-3.5 w-3.5" />Effacer ces filtres
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </Capsule>

      {/* Compteur */}
      {count !== null && (
        <p className={`cap-count ${stuck ? "is-hidden" : ""}`} aria-live="polite">
          <span key={count} className="cap-count-n">{count}</span> événement{count > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function PanelGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="cap-panel-title">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PanelChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`cap-pill cap-pill-sm ${on ? "is-on" : ""}`}>
      {children}
    </button>
  );
}

function PanelSelect({ icon, value, onChange, all, options }: {
  icon: ReactNode; value: string; onChange: (v: string) => void; all: string; options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 rounded-full bg-blanc text-sm">{icon}<SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
