import { useEffect, useRef, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import "./reveal.css";

/**
 * Titre révélé lettre par lettre par Cocotte (ESSAI design-tests).
 * - Le titre garde sa balise et son texte complet pour les lecteurs d'écran (aria-label) ;
 *   les lettres découpées sont en aria-hidden.
 * - Les lettres ne sont masquées (data-armed) que si le titre est encore sous ~70 % de
 *   l'écran au chargement ; c'est CocotteCompanion qui les fait apparaître en passant.
 * - Une fois affiché, le titre ne se re-masque jamais. Animations réduites : affiché directement.
 */
export function RevealTitle({ text, id, style }: { text: string; id: string; style?: CSSProperties }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { el.dataset.armed = "done"; return; }
    if (el.dataset.armed) return;
    const top = el.getBoundingClientRect().top;
    el.dataset.armed = top > 0.7 * window.innerHeight ? "true" : "done";
  }, [reduced]);

  const words = text.split(" ");
  return (
    <h2 ref={ref} id={id} aria-label={text} className="rv-title" style={style}>
      {words.map((w, wi) => (
        <span key={wi}>
          <span className="rv-word" aria-hidden="true">
            {[...w].map((c, ci) => <span key={ci} className="rv-ch">{c}</span>)}
          </span>
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h2>
  );
}
