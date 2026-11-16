import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./hooks";

/**
 * Hero « studio » : la cocotte comme un grand objet 3D.
 * - Arrivée : glisse depuis la gauche en tournant, avec un fondu.
 * - Boucle : rotation lente (un tour en ~70 s) + légère inclinaison 3D qui oscille (~25 s).
 * - Parallaxe souris : ordinateur uniquement (pointeur précis).
 * - Voyage (ESSAI design-tests) : en défilant, la cocotte va se poser à côté du titre
 *   « Les prochains events » (#lp-cocotte-slot). Ordinateur : trajet + rétrécissement +
 *   un tour et demi + léger rebond. Mobile : rétrécissement en fondu vers l'icône du titre.
 *   Animation CSS liée au défilement si le navigateur la gère, sinon requestAnimationFrame.
 * - `playing` = hero visible : sinon les boucles sont en pause.
 * - prefers-reduced-motion : cocotte fixe, pas de voyage (l'icône du titre est déjà affichée).
 */

type Mode = "travel" | "fade";

/** Position dans le document, sans tenir compte des transform (offset*). */
function docBox(n: HTMLElement) {
  let x = 0;
  let y = 0;
  let c: HTMLElement | null = n;
  while (c) {
    x += c.offsetLeft;
    y += c.offsetTop;
    c = c.offsetParent as HTMLElement | null;
  }
  return { x, y, w: n.offsetWidth, h: n.offsetHeight };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function HeroCocotte({ playing }: { playing: boolean }) {
  const reduced = usePrefersReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);

  // Parallaxe souris
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

  // Voyage hero → titre des événements, piloté par le défilement
  useEffect(() => {
    const el = outerRef.current;
    const slot = document.getElementById("lp-cocotte-slot");
    const hero = el?.closest(".lp-hero") as HTMLElement | null;
    if (!el || !slot || !hero || reduced) return;

    const cssTimeline = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
    let mode: Mode = "travel";
    let p0 = 0;
    let p1 = 1;
    let q0 = 0;
    let q1 = 1;
    let tx = 0;
    let ty = 0;
    let ts = 1;

    let raf = 0;
    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      const p = clamp01((y - p0) / (p1 - p0));
      setLanded(mode === "travel" && p >= 1);
      if (cssTimeline) return;
      if (mode === "travel") {
        const t = easeInOut(Math.min(p / 0.85, 1));
        const bounce = p > 0.85 ? Math.sin((Math.PI * (p - 0.85)) / 0.15) * 0.18 : 0;
        const s = (1 + (ts - 1) * t) * (1 + bounce);
        el.style.transform = p <= 0 ? "" : `translate(${tx * t}px, ${ty * t}px) rotate(${540 * t}deg) scale(${s})`;
        el.style.opacity = "";
        slot.style.opacity = "";
      } else {
        el.style.transform = p <= 0 ? "" : `scale(${1 - 0.6 * p})`;
        el.style.opacity = String(1 - p);
        slot.style.opacity = String(clamp01((y - q0) / (q1 - q0)));
      }
    };

    const measure = () => {
      const vh = window.innerHeight;
      const c = docBox(el);
      const s = docBox(slot);
      const h = docBox(hero);
      mode = window.matchMedia("(min-width: 1024px)").matches ? "travel" : "fade";
      if (mode === "travel") {
        // Du moment où le bas du hero remonte jusqu'au titre à 30 % du haut de l'écran
        p0 = Math.max(0, h.y + h.h - vh);
        p1 = Math.max(p0 + 1, s.y - 0.3 * vh);
        tx = s.x + s.w / 2 - (c.x + c.w / 2);
        ty = s.y + s.h / 2 - (c.y + c.h / 2);
        ts = s.h / c.h;
      } else {
        // Mobile : la cocotte rétrécit en sortant de l'écran, l'icône du titre apparaît
        p0 = 0;
        p1 = Math.max(1, c.y + c.h * 0.7);
        q0 = Math.max(0, s.y - vh);
        q1 = Math.max(q0 + 1, s.y - 0.55 * vh);
      }
      el.style.setProperty("--p0", `${p0}px`);
      el.style.setProperty("--p1", `${p1}px`);
      el.style.setProperty("--tx", `${tx}px`);
      el.style.setProperty("--ty", `${ty}px`);
      el.style.setProperty("--ts", `${ts}`);
      slot.style.setProperty("--q0", `${q0}px`);
      slot.style.setProperty("--q1", `${q1}px`);
      el.classList.toggle("lp-travel-css", cssTimeline && mode === "travel");
      el.classList.toggle("lp-fade-css", cssTimeline && mode === "fade");
      slot.classList.toggle("lp-slot-css", cssTimeline && mode === "fade");
      slot.classList.toggle("lp-slot-travel", mode === "travel");
      if (cssTimeline) {
        el.style.transform = "";
        el.style.opacity = "";
        slot.style.opacity = "";
      }
      frame();
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    // Mesure après chaque changement de mise en page (polices, images, événements chargés…)
    let mraf = 0;
    const remeasure = () => {
      cancelAnimationFrame(mraf);
      mraf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", onScroll, { passive: true });
    remeasure();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(mraf);
      el.classList.remove("lp-travel-css", "lp-fade-css");
      slot.classList.remove("lp-slot-css", "lp-slot-travel");
      el.style.transform = "";
      el.style.opacity = "";
      slot.style.opacity = "";
    };
  }, [reduced]);

  // La rotation continue s'arrête une fois posée (un tour en 70 s : l'arrêt ne se voit pas)
  const paused = !playing || reduced || landed ? "is-paused" : "";

  return (
    <div ref={outerRef} className="lp-cocotte" aria-hidden="true">
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
