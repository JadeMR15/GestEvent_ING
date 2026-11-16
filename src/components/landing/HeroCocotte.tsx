import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./hooks";

/**
 * Hero « studio » : la cocotte comme un grand objet 3D.
 * - Arrivée : glisse depuis la gauche en tournant, avec un fondu (CSS, une seule fois).
 * - Boucle : rotation lente (un tour en ~70 s) + légère inclinaison 3D qui oscille (~25 s),
 *   pilotées en JS (requestAnimationFrame) pour connaître l'angle réel à tout moment.
 * - Parallaxe souris : ordinateur uniquement (pointeur précis).
 * - Voyage (ESSAI design-tests) : en défilant, la cocotte va se poser à côté du titre
 *   « Les prochains events » (#lp-cocotte-slot).
 *   · Ordinateur : trajet + rétrécissement (animation CSS liée au défilement si disponible,
 *     sinon JS) ; rotation = rotation lente + un tour et demi, ramenée en douceur vers le
 *     multiple de 360° le plus proche entre 65 % et 85 % du trajet, inclinaison ramenée à 0 :
 *     elle arrive toujours droite et à plat, puis fait un léger rebond (85 → 100 %).
 *   · Mobile : rétrécissement en fondu vers l'icône du titre (toujours droite).
 * - `playing` = hero visible : sinon la rotation lente est en pause.
 * - prefers-reduced-motion : cocotte fixe (0°), pas de voyage, icône du titre déjà affichée.
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
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

const SPIN_MS = 70_000; // un tour de rotation lente
const TILT_PERIOD_MS = 50_000; // aller-retour de l'inclinaison (25 s dans chaque sens)
const TRIP_TURN = 540; // un tour et demi pendant le trajet
const STRAIGHTEN_FROM = 0.65; // début du redressement (fraction du trajet)
const STRAIGHTEN_TO = 0.85; // droite et à plat ; ensuite le rebond

export function HeroCocotte({ playing }: { playing: boolean }) {
  const reduced = usePrefersReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLImageElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const wakeRef = useRef<() => void>(() => {});

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

  // Rotation lente, inclinaison et voyage hero → titre
  useEffect(() => {
    const el = outerRef.current;
    const tiltEl = tiltRef.current;
    const spinEl = spinRef.current;
    const slot = document.getElementById("lp-cocotte-slot");
    const hero = el?.closest(".lp-hero") as HTMLElement | null;
    if (!el || !tiltEl || !spinEl) return;
    if (reduced) {
      // Animations réduites : cocotte fixe, dans le sens du fichier, à plat
      spinEl.style.transform = "";
      tiltEl.style.transform = "";
      return;
    }

    const cssTimeline = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
    let mode: Mode = "travel";
    let p0 = 0;
    let p1 = 1;
    let q0 = 0;
    let q1 = 1;
    let tx = 0;
    let ty = 0;
    let ts = 1;

    let spin = 0; // angle de la rotation lente (degrés)
    let tiltTime = 0; // temps écoulé de l'oscillation 3D (ms)
    let last = 0;
    let raf = 0;
    let running = false;

    const progress = () => clamp01((window.scrollY - p0) / (p1 - p0));

    const render = (p: number) => {
      const travel = mode === "travel" && !!slot;
      const t = travel ? easeInOut(Math.min(p / STRAIGHTEN_TO, 1)) : 0;
      // Redressement : 0 → 1 entre 65 % et 85 % du trajet
      const w = travel ? smooth((p - STRAIGHTEN_FROM) / (STRAIGHTEN_TO - STRAIGHTEN_FROM)) : 0;

      // Rotation totale = rotation lente + tour et demi du trajet, corrigée vers 0° (mod 360)
      const end = spin + TRIP_TURN;
      const delta = Math.round(end / 360) * 360 - end; // entre -180° et 180°
      const angle = spin + TRIP_TURN * t + delta * w;
      spinEl.style.transform = `rotate(${angle}deg)`;

      // Inclinaison 3D, ramenée à plat pendant le redressement
      const u = (1 - Math.cos((2 * Math.PI * tiltTime) / TILT_PERIOD_MS)) / 2;
      const k = 1 - w;
      tiltEl.style.transform = `perspective(1400px) rotateX(${(10 - 16 * u) * k}deg) rotateY(${(-12 + 26 * u) * k}deg)`;

      // Trajet (version script, si le navigateur n'a pas l'animation CSS liée au défilement)
      if (cssTimeline || !slot) return;
      if (mode === "travel") {
        const bounce = p > STRAIGHTEN_TO ? Math.sin((Math.PI * (p - STRAIGHTEN_TO)) / (1 - STRAIGHTEN_TO)) * 0.18 : 0;
        const s = (1 + (ts - 1) * t) * (1 + bounce);
        el.style.transform = p <= 0 ? "" : `translate(${tx * t}px, ${ty * t}px) scale(${s})`;
        el.style.opacity = "";
        slot.style.opacity = "";
      } else {
        el.style.transform = p <= 0 ? "" : `scale(${1 - 0.6 * p})`;
        el.style.opacity = String(1 - p);
        slot.style.opacity = String(clamp01((window.scrollY - q0) / (q1 - q0)));
      }
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 0;
      last = now;
      const p = progress();
      // La rotation lente ralentit pendant le trajet et s'arrête avant le redressement
      const speed = mode === "travel" ? 1 - clamp01(p / STRAIGHTEN_FROM) : 1;
      if (playingRef.current) {
        spin = (spin + (dt * 360 * speed) / SPIN_MS) % 360;
        tiltTime += dt * speed;
      }
      render(p);
      // Rien ne bouge : hero hors de l'écran et cocotte au repos → la boucle s'arrête
      if (!playingRef.current && (p <= 0 || p >= 1)) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const measure = () => {
      if (!slot || !hero) return;
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
      render(progress());
    };

    let mraf = 0;
    const remeasure = () => {
      cancelAnimationFrame(mraf);
      mraf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", wake, { passive: true });
    remeasure();
    wake();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", wake);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(mraf);
      running = false;
      wakeRef.current = () => {};
      el.classList.remove("lp-travel-css", "lp-fade-css");
      slot?.classList.remove("lp-slot-css", "lp-slot-travel");
      el.style.transform = "";
      el.style.opacity = "";
      if (slot) slot.style.opacity = "";
      spinEl.style.transform = "";
      tiltEl.style.transform = "";
    };
  }, [reduced]);

  // Le hero revient à l'écran : la rotation lente reprend
  useEffect(() => {
    if (playing) wakeRef.current();
  }, [playing]);

  return (
    <div ref={outerRef} className="lp-cocotte" aria-hidden="true">
      <div className="lp-cocotte-enter">
        <div ref={parallaxRef} className="lp-cocotte-parallax">
          <div ref={tiltRef} className="lp-cocotte-tilt">
            <img ref={spinRef} src="/plav-cocotte.svg" alt="" className="lp-cocotte-spin" />
          </div>
        </div>
      </div>
    </div>
  );
}
