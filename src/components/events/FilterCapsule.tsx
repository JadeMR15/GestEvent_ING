import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import "./capsule.css";

/**
 * Barre de recherche « capsule » (ESSAI design-tests) — présentation seulement.
 * Elle pilote exactement les mêmes états que l'ancienne barre (recherche, dates, statut).
 */

type DateFilter = "all" | "week" | "month";
type StatusFilter = "all" | "open" | "full";

const DATES: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Toutes dates" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

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
  q, setQ, dateFilter, setDateFilter, statusFilter, setStatusFilter, count, stuck,
}: {
  q: string;
  setQ: (v: string) => void;
  dateFilter: DateFilter;
  setDateFilter: (v: DateFilter) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  count: number | null;
  stuck: boolean;
}) {
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
            placeholder="Rechercher par titre ou lieu…"
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

          {/* Plus : Tous statuts / Complet */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={`cap-pill cap-more ${statusFilter === "full" ? "is-on" : ""}`}>
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                Plus
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={statusFilter === "open" ? "" : statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <DropdownMenuRadioItem value="all">Tous statuts</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="full">Complet</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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

