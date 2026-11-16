import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Cocotte, COCOTTE_BODY, COCOTTE_BOX, type CocotteState } from "./Cocotte";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import "./companion.css";

/**
 * Cocotte compagnon (ESSAI design-tests) — page d'accueil uniquement.
 * Quand la grande cocotte s'est posée à côté du titre « Les prochains events », la mascotte
 * prend sa place (apparition → coucou), saute en arc jusqu'en bas à gauche de l'écran, puis
 * marche au rythme du défilement. Elle revient dans le titre quand on remonte, et descend hors
 * de l'écran quand le footer arrive.
 * Une seule boucle requestAnimationFrame (défilement passif), transform / opacity uniquement.
 */

type Phase = "off" | "emerge" | "wave" | "jumpOut" | "companion" | "jumpIn" | "retract";

const DUR = { emerge: 420, wave: 1000, jumpOut: 750, jumpIn: 650, retract: 300, hop: 750 };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function CocotteCompanion() {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<CocotteState>("repos");
  const [flip, setFlip] = useState(false);
  const [shown, setShown] = useState(false);
  const [sparks, setSparks] = useState(0);
  const hopRef = useRef<() => void>(() => {});

  useEffect(() => {
    const wrap = wrapRef.current;
    const slot = document.getElementById("lp-cocotte-slot");
    const footer = document.getElementById("contact");
    const page = wrap?.closest(".lp-page") as HTMLElement | null;
    if (!wrap || !slot) return;

    let phase: Phase = "off";
    let phaseStart = 0;
    let walkX = 0; // position dans le couloir (px)
    let walkDir = 1; // 1 → vers la droite, -1 → vers la gauche (change aux bouts du couloir)
    let facingLeft = false;
    // Petites actions au repos (regarder à gauche puis à droite, ou coucou)
    let idleAction: { type: "look" | "wave"; start: number } | null = null;
    let nextIdleAt = Infinity;
    let idleTimer = 0;
    let hide = 0; // 0 → visible, 1 → descendue hors de l'écran (footer)
    let lastScrollY = window.scrollY;
    let lastScrollAt = 0;
    let scrollSpeed = 0; // px/ms, lissé
    let hopUntil = 0;
    let curPose: CocotteState = "repos";
    let curShown = false;
    let curFlip = false;
    let raf = 0;
    let last = 0;
    let active = false;

    const isMobile = () => window.innerWidth < 768;
    const size = () => (isMobile() ? 52 : 72); // hauteur de la mascotte (px)
    const corridor = () => (isMobile() ? 120 : 240);

    const setP = (p: CocotteState) => { if (p !== curPose) { curPose = p; setPose(p); } };
    const setS = (v: boolean) => { if (v !== curShown) { curShown = v; setShown(v); } };
    const setF = (v: boolean) => { if (v !== curFlip) { curFlip = v; setFlip(v); } };
    // La petite cocotte du titre est masquée pendant que la mascotte est posée à sa place
    const atSlot = (v: boolean) => page?.classList.toggle("ck-at-slot", v);

    /** Pose « dans le titre » : même taille et même centre que la cocotte du titre. */
    const slotPose = (base: { x: number; y: number }, H: number) => {
      const r = slot.getBoundingClientRect();
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      const s = r.height / ((COCOTTE_BODY.size / COCOTTE_BOX.h) * H);
      const cx = ((COCOTTE_BODY.cx - COCOTTE_BOX.x) / COCOTTE_BOX.w) * W;
      const cy = ((COCOTTE_BODY.cy - COCOTTE_BOX.y) / COCOTTE_BOX.h) * H;
      return { x: r.left + r.width / 2 - base.x - cx * s, y: r.top + r.height / 2 - base.y - cy * s, s };
    };

    const go = (p: Phase, now: number) => {
      phase = p;
      phaseStart = now;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const vh = window.innerHeight;
      const H = size();
      const cs = getComputedStyle(wrap);
      const base = { x: parseFloat(cs.left), y: vh - parseFloat(cs.bottom) - H };

      // Déclencheur avec hystérésis : titre au-dessus de 30 % de l'écran
      const slotTop = slot.getBoundingClientRect().top;
      if (!active && slotTop < 0.3 * vh - 2) active = true;
      else if (active && slotTop > 0.3 * vh + 48) active = false;

      // Défilement : vitesse et sens
      const y = window.scrollY;
      const dy = y - lastScrollY;
      lastScrollY = y;
      if (dy !== 0) lastScrollAt = now;
      scrollSpeed = lerp(scrollSpeed, Math.abs(dy) / dt, 0.25);
      const scrolling = now - lastScrollAt < 250;

      // Footer à l'écran : elle descend hors de l'écran
      const footerIn = footer ? footer.getBoundingClientRect().top < vh : false;
      hide = reduced ? (footerIn ? 1 : 0) : lerp(hide, footerIn ? 1 : 0, 1 - Math.exp(-dt / 140));

      const t = now - phaseStart;
      let pos = { x: walkX, y: 0, s: 1 };

      if (reduced) {
        // Pas de transformation ni de marche : directement en place, pose de repos
        phase = active ? "companion" : "off";
        setP("repos");
      } else {
        switch (phase) {
          case "off":
            if (active) {
              // Arrivée directe (page rechargée plus bas) : apparaît sur place
              if (slotTop < -120) { go("companion", now); setP("apparition"); }
              else { go("emerge", now); atSlot(true); setP("apparition"); }
            }
            break;
          case "emerge":
            pos = slotPose(base, H);
            if (!active) { go("retract", now); setP("retrait"); }
            else if (t > DUR.emerge) { go("wave", now); setP("coucou"); }
            break;
          case "wave":
            pos = slotPose(base, H);
            if (!active) { go("retract", now); setP("retrait"); }
            else if (t > DUR.wave) { go("jumpOut", now); atSlot(false); setP("saut"); facingLeft = false; walkDir = 1; }
            break;
          case "jumpOut": {
            const k = ease(clamp(t / DUR.jumpOut, 0, 1));
            const a = slotPose(base, H);
            const arc = isMobile() ? 90 : 150;
            pos = { x: lerp(a.x, walkX, k), y: lerp(a.y, 0, k) - Math.sin(Math.PI * k) * arc, s: lerp(a.s, 1, k) };
            if (t > DUR.jumpOut) { go("companion", now); setP("repos"); nextIdleAt = now + 4000; }
            break;
          }
          case "companion": {
            if (!active) { go("jumpIn", now); setP("saut"); idleAction = null; break; }
            facingLeft = walkDir < 0;
            if (now < hopUntil) { setP("saut"); idleAction = null; nextIdleAt = now + 4000; }
            else if (scrolling) {
              // Elle avance tant qu'on défile (dans un sens ou dans l'autre) et fait demi-tour
              // aux bouts du couloir ; sa vitesse suit celle du défilement, avec une limite.
              const v = clamp(scrollSpeed * 0.12, 0.03, 0.16); // px/ms
              walkX += walkDir * v * dt;
              if (walkX >= corridor()) { walkX = corridor(); walkDir = -1; }
              else if (walkX <= 0) { walkX = 0; walkDir = 1; }
              facingLeft = walkDir < 0;
              setP("marche");
              idleAction = null;
              nextIdleAt = now + 4000; // première petite action après ~4 s d'immobilité
            } else {
              if (!idleAction && now >= nextIdleAt) {
                idleAction = { type: Math.random() < 0.5 ? "look" : "wave", start: now };
              }
              if (idleAction) {
                const it = now - idleAction.start;
                if (idleAction.type === "look") {
                  // Regarde d'un côté puis de l'autre, puis revient dans son sens de marche
                  setP("repos");
                  if (it < 650) facingLeft = true; // regarde à gauche…
                  else if (it < 1300) facingLeft = false; // …puis à droite
                  else facingLeft = walkDir < 0;
                  if (it > 1500) { idleAction = null; nextIdleAt = now + 5000 + Math.random() * 3000; }
                } else {
                  setP("coucou");
                  if (it > 1050) { idleAction = null; setP("repos"); nextIdleAt = now + 5000 + Math.random() * 3000; }
                }
              } else setP("repos");
            }
            pos = { x: walkX, y: 0, s: 1 };
            break;
          }
          case "jumpIn": {
            const k = ease(clamp(t / DUR.jumpIn, 0, 1));
            const b = slotPose(base, H);
            const arc = isMobile() ? 90 : 150;
            pos = { x: lerp(walkX, b.x, k), y: lerp(0, b.y, k) - Math.sin(Math.PI * k) * arc, s: lerp(1, b.s, k) };
            if (t > DUR.jumpIn) { go("retract", now); atSlot(true); setP("retrait"); }
            break;
          }
          case "retract":
            pos = slotPose(base, H);
            if (t > DUR.retract) {
              go("off", now);
              atSlot(false);
              if (active) { go("emerge", now); atSlot(true); setP("apparition"); }
            }
            break;
        }
      }

      // Regarde dans son sens de marche (le saut d'arrivée part toujours vers la droite)
      setF(phase === "companion" || phase === "jumpIn" ? facingLeft : false);
      setS(phase !== "off");

      // Discrétion près du footer : seulement en mode compagnon
      const drop = phase === "companion" ? hide * (H + 60) : 0;
      wrap.style.transform = `translate(${pos.x}px, ${pos.y + drop}px) scale(${pos.s})`;
      wrap.classList.toggle("is-tucked", phase === "companion" && hide > 0.9);

      // La boucle continue tant que quelque chose bouge
      const busy =
        phase === "emerge" || phase === "wave" || phase === "jumpOut" || phase === "jumpIn" || phase === "retract" ||
        scrolling || now < hopUntil || !!idleAction || Math.abs(hide - (footerIn ? 1 : 0)) > 0.01 ||
        // Titre proche du seuil (il peut encore bouger sans défilement, ex. son animation d'apparition)
        Math.abs(slotTop - 0.3 * vh) < 160;
      if (busy && document.visibilityState === "visible") raf = requestAnimationFrame(tick);
      else if (phase === "companion" && nextIdleAt < Infinity) {
        // Au repos : la boucle s'arrête, un minuteur la relance pour la prochaine petite action
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(wake, Math.max(50, nextIdleAt - now + 20));
      }
    };

    const wake = () => { if (!raf && document.visibilityState === "visible") { last = 0; raf = requestAnimationFrame(tick); } };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { cancelAnimationFrame(raf); raf = 0; }
      else wake();
    };
    hopRef.current = () => { hopUntil = performance.now() + DUR.hop; setP("saut"); wake(); };

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    document.addEventListener("visibilitychange", onVisibility);
    wake();
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      atSlot(false);
    };
  }, [reduced]);

  const onHop = () => {
    hopRef.current();
    setSparks((n) => n + 1);
  };

  return (
    <div ref={wrapRef} className={`ck-companion ${shown ? "is-shown" : ""}`} aria-hidden={!shown}>
      <button
        type="button"
        className="ck-companion-btn"
        aria-label="Cocotte, la mascotte de plav'"
        tabIndex={shown ? 0 : -1}
        onClick={onHop}
      >
        <Cocotte state={pose} flip={flip} className="ck-companion-figure" />
        {sparks > 0 && (
          <span key={sparks} className="ck-sparks" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ "--a": `${i * 60 - 90}deg` } as CSSProperties} />)}
          </span>
        )}
      </button>
    </div>
  );
}
