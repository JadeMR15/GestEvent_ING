import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./hooks";

/**
 * Hero « studio » : la cocotte comme un grand objet 3D.
 * - Arrivée : glisse depuis la gauche en tournant, avec un fondu.
 * - Boucle : rotation lente (un tour en ~70 s) + légère inclinaison 3D qui oscille (~25 s).
 * - Parallaxe souris : ordinateur uniquement (pointeur précis).
 * - `playing` = hero visible : sinon les boucles sont en pause.
 * - prefers-reduced-motion : cocotte fixe.
 */
export function HeroCocotte({ playing }: { playing: boolean }) {
  const reduced = usePrefersReducedMotion();
  const parallaxRef = useRef<HTMLDivElement>(null);

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
      x = (e.clientX / window.innerWidth - 0.5) * 18;
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

  const paused = !playing || reduced ? "is-paused" : "";

  return (
    <div className="lp-cocotte" aria-hidden="true">
      <div className="lp-cocotte-enter">
        <div ref={parallaxRef} className="lp-cocotte-parallax">
          <div className={`lp-cocotte-tilt ${paused}`}>
            <img src="/plav-cocotte.svg" alt="" className={`lp-cocotte-spin ${paused}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
