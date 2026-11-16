import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Cocotte, COCOTTE_BODY, COCOTTE_BOX, type CocotteState } from "./Cocotte";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import { COCOTTE_ON_STAGE } from "./DanceScene";
import "./companion.css";

/**
 * Cocotte compagnon (ESSAI design-tests) — page d'accueil uniquement.
 * Quand la grande cocotte s'est posée à côté du titre « Les prochains events », la mascotte
 * prend sa place (apparition → coucou), saute en arc jusqu'en bas à gauche de l'écran, puis
 * marche au rythme du défilement. Elle revient dans le titre quand on remonte, et descend hors
 * de l'écran quand le footer arrive.
 * Une seule boucle requestAnimationFrame (défilement passif), transform / opacity uniquement.
 */

type Phase =
  | "off" | "emerge" | "wave" | "jumpOut" | "companion" | "jumpIn" | "retract"
  // Scène de danse
  | "toStage" | "stageWave" | "stage" | "stageAppear" | "fromStage" | "away"
  // Révélation du titre « Comment ça marche ? »
  | "runIn" | "reveal" | "titleWave" | "toCorner";

const DUR = { emerge: 420, wave: 1000, jumpOut: 750, jumpIn: 650, retract: 300, hop: 750, toStage: 1300, stageWave: 1000, fromStage: 750, runIn: 650, titleWave: 1000, toCorner: 750 };
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
    const spot = document.getElementById("lp-dance-spot");
    const floor = spot?.parentElement ?? null;
    const features = document.getElementById("fonctionnalites");
    const howTitle = document.getElementById("lp-how-title");
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
    let from = { x: 0, y: 0, s: 1 }; // point de départ d'un trajet (coin → scène)
    let stageGreeted = false;
    let revealDur = 1200;
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

    /** Pose « sur la scène » : debout sur le sol invisible, à la place prévue au centre. */
    const stagePose = (base: { x: number; y: number }, H: number) => {
      if (!spot) return { x: walkX, y: 0, s: 1 };
      const r = spot.getBoundingClientRect();
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      const s = r.height / H;
      return { x: r.left + r.width / 2 - base.x - (W * s) / 2, y: r.bottom - base.y - H * s, s };
    };

    /** Pose « sur la ligne du titre » : pieds au bas du titre, centre horizontal en `cx`. */
    const titlePose = (base: { x: number; y: number }, H: number, cx: number) => {
      const r = howTitle!.getBoundingClientRect();
      const font = parseFloat(getComputedStyle(howTitle!).fontSize) || 28;
      const s = (font * 2.3) / H;
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      return { x: cx - base.x - (W * s) / 2, y: r.bottom + font * 0.15 - base.y - H * s, s };
    };
    const titleSpan = () => {
      const r = howTitle!.getBoundingClientRect();
      return { start: r.left - 6, end: r.right + 6 };
    };
    const letters = () => Array.from(howTitle?.querySelectorAll<HTMLElement>(".rv-ch") ?? []);
    const revealUpTo = (x: number) => {
      for (const l of letters()) {
        if (l.classList.contains("is-in")) continue;
        const r = l.getBoundingClientRect();
        if (x >= r.left + r.width / 2) l.classList.add("is-in");
      }
    };
    const revealAll = () => {
      letters().forEach((l) => l.classList.add("is-in"));
      if (howTitle) howTitle.dataset.armed = "done";
    };
    const titleArmed = () => howTitle?.dataset.armed === "true";

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

      // Scène de danse : visible au milieu de l'écran, dépassée (au-dessus), ou encore en dessous
      const fr = floor?.getBoundingClientRect();
      const stageVisible = !!fr && fr.top < 0.7 * vh && fr.bottom > 0.15 * vh;
      const stagePassed = !!fr && fr.bottom < 0.1 * vh;
      const stageBelow = !fr || fr.top > 0.85 * vh;
      const featuresDone = !!features && features.getBoundingClientRect().bottom < 0.5 * vh;
      // Titre suivant : entre à l'écran (~70 % de la hauteur) / repassé en dessous
      const ht = howTitle?.getBoundingClientRect();
      const titleIn = !!ht && ht.top < 0.7 * vh && ht.bottom > 0;
      const titleBelow = !ht || ht.top > 0.9 * vh;

      const t = now - phaseStart;
      let pos = { x: walkX, y: 0, s: 1 };

      if (reduced) {
        // Pas de transformation ni de marche : directement en place, pose de repos
        phase = !active ? "off" : stageVisible ? "stage" : stagePassed && !featuresDone ? "away" : "companion";
        if (phase === "stage") pos = stagePose(base, H);
        if (titleArmed()) revealAll();
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
            if (titleArmed() && titleIn && howTitle) {
              const sp = titleSpan();
              revealDur = clamp((sp.end - sp.start) * 4.5, 1300, 2600);
              go("runIn", now); setP("marche"); idleAction = null;
              break;
            }
            if (stageVisible) {
              // Elle quitte son coin et marche jusqu'au centre de la scène
              from = { x: walkX, y: 0, s: 1 };
              go("toStage", now); setP("marche"); idleAction = null;
              break;
            }
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
          case "toStage": {
            const k = ease(clamp(t / DUR.toStage, 0, 1));
            const b = stagePose(base, H);
            pos = { x: lerp(from.x, b.x, k), y: lerp(from.y, b.y, k), s: lerp(from.s, b.s, k) };
            facingLeft = b.x < from.x;
            setP("marche");
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { go("fromStage", now); setP("saut"); break; }
            if (t > DUR.toStage) { go("stageWave", now); setP("coucou"); facingLeft = false; }
            break;
          }
          case "stageWave":
            pos = stagePose(base, H);
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { go("fromStage", now); setP("saut"); break; }
            if (t > DUR.stageWave) {
              // Les danseuses peuvent arriver
              if (!stageGreeted) { stageGreeted = true; window.dispatchEvent(new CustomEvent(COCOTTE_ON_STAGE)); }
              go("stage", now); setP("danse");
            }
            break;
          case "stageAppear":
            pos = stagePose(base, H);
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { go("fromStage", now); setP("saut"); break; }
            if (t > DUR.emerge) { go("stage", now); setP("danse"); }
            break;
          case "stage":
            pos = stagePose(base, H);
            setP(now < hopUntil ? "saut" : "danse");
            if (stagePassed) { go("away", now); break; }   // on continue vers le bas : elle s'efface
            if (stageBelow) { go("fromStage", now); setP("saut"); } // on remonte : retour au coin
            break;
          case "fromStage": {
            const k = ease(clamp(t / DUR.fromStage, 0, 1));
            const a = stagePose(base, H);
            const arc = isMobile() ? 90 : 150;
            pos = { x: lerp(a.x, walkX, k), y: lerp(a.y, 0, k) - Math.sin(Math.PI * k) * arc, s: lerp(a.s, 1, k) };
            facingLeft = true;
            if (t > DUR.fromStage) { go("companion", now); setP("repos"); nextIdleAt = now + 4000; }
            break;
          }
          case "away":
            // Pendant le cadre des fonctionnalités, Cocotte n'est pas visible
            if (stageVisible) { go("stageAppear", now); setP("apparition"); }
            else if (titleArmed() && titleIn && howTitle) {
              // Elle arrive en courant par la gauche pour révéler le titre
              const sp = titleSpan();
              revealDur = clamp((sp.end - sp.start) * 4.5, 1300, 2600);
              go("runIn", now); setP("marche"); facingLeft = false;
            } else if (!titleArmed() && featuresDone) { go("companion", now); setP("apparition"); walkDir = 1; nextIdleAt = now + 4000; }
            break;
          case "runIn": {
            const sp = titleSpan();
            const k = clamp(t / DUR.runIn, 0, 1);
            const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
            const startCx = -W; // hors de l'écran, à gauche
            pos = titlePose(base, H, lerp(startCx, sp.start, 1 - Math.pow(1 - k, 2)));
            setP("marche"); facingLeft = false;
            if (titleBelow) { revealAll(); go("away", now); break; }
            if (t > DUR.runIn) go("reveal", now);
            break;
          }
          case "reveal": {
            // Elle marche le long du titre : chaque lettre apparaît quand elle passe
            const sp = titleSpan();
            const k = clamp(t / revealDur, 0, 1);
            const cx = lerp(sp.start, sp.end, k);
            pos = titlePose(base, H, cx);
            revealUpTo(cx);
            setP("marche"); facingLeft = false;
            if (titleBelow) { revealAll(); go("away", now); break; }
            if (k >= 1) { revealAll(); go("titleWave", now); setP("coucou"); }
            break;
          }
          case "titleWave":
            pos = titlePose(base, H, titleSpan().end);
            if (titleBelow) { go("away", now); break; }
            if (t > DUR.titleWave) { go("toCorner", now); setP("saut"); from = pos; walkDir = 1; }
            break;
          case "toCorner": {
            // Saut vers son coin en bas à gauche, puis elle reprend son rôle de compagnon
            const k = ease(clamp(t / DUR.toCorner, 0, 1));
            const arc = isMobile() ? 90 : 150;
            pos = { x: lerp(from.x, 0, k), y: lerp(from.y, 0, k) - Math.sin(Math.PI * k) * arc, s: lerp(from.s, 1, k) };
            facingLeft = from.x > 0;
            if (t > DUR.toCorner) { walkX = 0; go("companion", now); setP("repos"); nextIdleAt = now + 4000; }
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
      setF(["companion", "jumpIn", "toStage", "fromStage", "toCorner"].includes(phase) ? facingLeft : false);
      setS(phase !== "off" && phase !== "away");

      // Discrétion près du footer : seulement en mode compagnon
      const drop = phase === "companion" ? hide * (H + 60) : 0;
      wrap.style.transform = `translate(${pos.x}px, ${pos.y + drop}px) scale(${pos.s})`;
      wrap.classList.toggle("is-tucked", phase === "companion" && hide > 0.9);

      // La boucle continue tant que quelque chose bouge
      const busy =
        phase === "emerge" || phase === "wave" || phase === "jumpOut" || phase === "jumpIn" || phase === "retract" ||
        phase === "toStage" || phase === "stageWave" || phase === "stageAppear" || phase === "fromStage" ||
        phase === "runIn" || phase === "reveal" || phase === "titleWave" || phase === "toCorner" ||
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
