import { useEffect, useRef, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import "./reveal.css";

/**
 * Titre révélé lettre par lettre par Cocotte, au rythme du défilement (ESSAI design-tests).
 * - Le titre garde sa balise et son texte complet pour les lecteurs d'écran (aria-label) ;
 *   les lettres découpées sont en aria-hidden.
 * - `accent` : mot en Fredoka avec le surlignage jaune, qui se dessine derrière Cocotte (--hl).
 * - Les lettres ne sont masquées (data-armed) que si le titre est encore sous ~85 % de l'écran
 *   au chargement ; c'est CocotteCompanion qui les fait apparaître en passant.
 * - Une fois affiché en entier, le titre ne se re-masque jamais. Animations réduites : affiché directement.
 */
export function RevealTitle({
  text,
  id,
  accent,
  className = "",
  style,
}: {
  text: string;
  id: string;
  accent?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { el.dataset.armed = "done"; return; }
    if (el.dataset.armed) return;
    const top = el.getBoundingClientRect().top;
    el.dataset.armed = top > 0.85 * window.innerHeight ? "true" : "done";
  }, [reduced]);

  const words = text.split(" ");
  return (
    <h2 ref={ref} id={id} aria-label={text} className={`rv-title ${className}`} style={style}>
      {words.map((w, wi) => {
        const letters = [...w].map((c, ci) => <span key={ci} className="rv-ch">{c}</span>);
        return (
          <span key={wi}>
            <span className={`rv-word ${w === accent ? "rv-accent t-accent" : ""}`} aria-hidden="true">
              {letters}
            </span>
            {wi < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </h2>
  );
}
