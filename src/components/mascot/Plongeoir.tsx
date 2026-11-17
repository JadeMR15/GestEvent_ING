import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import "./plongeoir.css";

/**
 * Plongeoir (ESSAI design-tests), posé sur le bord haut du cadre « À ton tour ! » : une
 * planche arrondie (bordeaux 600) sur un petit support avec deux barreaux (bordeaux 800).
 * - Il apparaît quand le bas de la section du téléphone (= haut de la section du cadre) arrive à
 *   ~75 % de l'écran (le support monte, puis la planche sort vers la droite avec un petit rebond)
 *   et rentre quand on remonte au-dessus.
 * - CocotteCompanion le lit (#lp-board, .is-out, #lp-board-plank) et fait plier la planche (.pl-bend).
 * - Animations réduites : pas de plongeoir.
 */
export function Plongeoir() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const section = el?.closest("section");
    if (!el || !section || reduced) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      // Haut de la section du cadre = bas de la section du téléphone
      const bottom = section.getBoundingClientRect().top;
      const vh = window.innerHeight;
      // Hystérésis : sort à 75 %, ne rentre qu'au-dessus de 85 %
      setOut((o) => (o ? bottom < 0.85 * vh : bottom < 0.75 * vh));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  if (reduced) return null;
  return (
    <div ref={ref} id="lp-board" className={`pl ${out ? "is-out" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 220 96" className="pl-svg" focusable="false">
        {/* Support avec deux barreaux d'échelle */}
        <g className="pl-support">
          <rect x="10" y="42" width="7" height="54" rx="3" fill="var(--bordeaux-800)" />
          <rect x="32" y="42" width="7" height="54" rx="3" fill="var(--bordeaux-800)" />
          <rect x="10" y="60" width="29" height="5" rx="2.5" fill="var(--bordeaux-800)" />
          <rect x="10" y="78" width="29" height="5" rx="2.5" fill="var(--bordeaux-800)" />
        </g>
        {/* Planche : plie sous Cocotte (.pl-bend), sort vers la droite (.pl-plank) */}
        <g className="pl-bend">
          <g className="pl-plank">
            <rect id="lp-board-plank" x="6" y="32" width="184" height="10" rx="5" fill="var(--bordeaux-600)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
