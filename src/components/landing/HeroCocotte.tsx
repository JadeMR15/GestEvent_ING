import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "./hooks";

const WORDS = ["SOIRÉES", "GALAS", "AFTERWORKS", "WEI", "CONCERTS", "AFTERS"];
const WORD_INTERVAL = 2500;

/**
 * Hero « profondeur » : mot géant animé en arrière-plan, cocotte au premier plan.
 * - Mot : change toutes les 2,5 s (sortie vers le haut, entrée par le bas), décoratif.
 * - Cocotte : rotation lente + flottement ; parallaxe souris sur ordinateur uniquement.
 * - `playing` = hero visible à l'écran : sinon tout est en pause.
 * - prefers-reduced-motion : mot fixe sur SOIRÉES, cocotte immobile.
 */
export function HeroCocotte({ playing }: { playing: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const idx = reduced ? 0 : tick % WORDS.length;
  const prev = reduced || tick === 0 ? null : (tick - 1) % WORDS.length;
  const parallaxRef = useRef<HTMLDivElement>(null);

  // Mot qui change en boucle
  useEffect(() => {
    if (!playing || reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), WORD_INTERVAL);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  // Parallaxe souris (ordinateur, pointeur précis uniquement)
  useEffect(() => {
    const el = parallaxRef.current;
    if (!el || reduced || !playing) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth - 0.5) * 16;
      y = (e.clientY / window.innerHeight - 0.5) * 12;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [reduced, playing]);

  const paused = !playing || reduced;

  return (
    <div className="lp-stage">
      {/* Mot géant (décoratif) */}
      <div className="lp-bigword" aria-hidden="true">
        {WORDS.map((w, i) => (
          <span
            key={w}
            style={{ "--len": w.length } as CSSProperties}
            className={`lp-bigword-item ${i === idx ? "is-current" : i === prev ? "is-prev" : ""}`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Cocotte au premier plan */}
      <div className="lp-cocotte-box" aria-hidden="true">
        <div className="lp-cocotte-shadow" />
        <div ref={parallaxRef} className="lp-cocotte-parallax">
          <div className={`lp-cocotte-float ${paused ? "is-paused" : ""}`}>
            <img src="/plav-cocotte.svg" alt="" className={`lp-cocotte-spin ${paused ? "is-paused" : ""}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
