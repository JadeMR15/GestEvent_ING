import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Cocotte, COCOTTE_BODY, COCOTTE_BOX, type CocotteState } from "./Cocotte";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import { COCOTTE_ON_STAGE } from "./DanceScene";
import "./companion.css";

/**
 * Cocotte compagnon (ESSAI design-tests) — page d'accueil uniquement.
 * - Présentation : quand la grande cocotte s'est posée à côté du titre « Les prochains events »,
 *   la mascotte prend sa place (apparition → coucou), puis va à sa place.
 * - Sa place : debout dans la marge vide à gauche du contenu, en bas de l'écran. Elle ne passe
 *   jamais sur le contenu : si la marge est trop étroite (ou qu'un cadre passe à cet endroit),
 *   elle est cachée en dehors de ses animations.
 * - Au repos, elle fait coucou régulièrement (toutes les ~4 à 6 s), avec une légère respiration
 *   entre deux coucous. Pendant le défilement, elle reste simplement debout.
 * - Elle ne se lève que pour ses animations : la danse sur le cadre et la révélation du titre
 *   « Comment ça marche ? ». Ensuite elle revient à sa place (ou disparaît en douceur s'il n'y a
 *   pas de place, par exemple sur mobile).
 * Une seule boucle requestAnimationFrame (défilement passif), transform / opacity uniquement.
 */

type Phase =
  | "off" | "emerge" | "wave" | "jumpOut" | "seat" | "jumpIn" | "retract" | "vanish"
  // Scène de danse
  | "toStage" | "stageWave" | "stage" | "stageAppear" | "fromStage" | "away"
  // Révélation du titre « Comment ça marche ? »
  | "runIn" | "reveal" | "titleWave" | "toCorner";

type Pos = { x: number; y: number; s: number };

const DUR = {
  emerge: 420, wave: 1000, jumpOut: 750, jumpIn: 650, retract: 300, hop: 750, vanish: 450,
  toStage: 1300, stageWave: 1000, fromStage: 750, runIn: 650, titleWave: 1000, toCorner: 750,
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPos = (a: Pos, b: Pos, k: number, arc = 0): Pos => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k) - Math.sin(Math.PI * k) * arc,
  s: lerp(a.s, b.s, k),
});

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
    const spot = document.getElementById("lp-dance-spot");
    const floor = spot?.parentElement ?? null;
    const features = document.getElementById("fonctionnalites");
    const howTitle = document.getElementById("lp-how-title");
    // Référence pour la marge de gauche : le conteneur de la section des événements
    const contentRef = document.querySelector<HTMLElement>("#evenements > .container");
    if (!wrap || !slot) return;

    let phase: Phase = "off";
    let phaseStart = 0;
    let hide = 0; // 0 → visible, 1 → descendue hors de l'écran (footer)
    let lastScrollY = window.scrollY;
    let lastScrollAt = 0;
    let scrollSpeed = 0; // px/ms, lissé
    let hopUntil = 0;
    let from: Pos = { x: 0, y: 0, s: 1 };
    let stageGreeted = false;
    let revealDur = 1200;
    let facingLeft = false;
    // Coucou régulier au repos
    let idleAction: { start: number } | null = null;
    let nextIdleAt = Infinity;
    let idleTimer = 0;
    let curPose: CocotteState = "repos";
    let curShown = false;
    let curFlip = false;
    let raf = 0;
    let last = 0;
    let active = false;

    const isMobile = () => window.innerWidth < 768;
    const size = () => (isMobile() ? 52 : 72); // hauteur de la mascotte (px)

    const setP = (p: CocotteState) => { if (p !== curPose) { curPose = p; setPose(p); } };
    const setS = (v: boolean) => { if (v !== curShown) { curShown = v; setShown(v); } };
    const setF = (v: boolean) => { if (v !== curFlip) { curFlip = v; setFlip(v); } };
    // La petite cocotte du titre est masquée pendant que la mascotte est posée à sa place
    const atSlot = (v: boolean) => page?.classList.toggle("ck-at-slot", v);
    const go = (p: Phase, now: number) => { phase = p; phaseStart = now; };

    /** Pose « dans le titre » : même taille et même centre que la cocotte du titre. */
    const slotPose = (base: { x: number; y: number }, H: number): Pos => {
      const r = slot.getBoundingClientRect();
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      const s = r.height / ((COCOTTE_BODY.size / COCOTTE_BOX.h) * H);
      const cx = ((COCOTTE_BODY.cx - COCOTTE_BOX.x) / COCOTTE_BOX.w) * W;
      const cy = ((COCOTTE_BODY.cy - COCOTTE_BOX.y) / COCOTTE_BOX.h) * H;
      return { x: r.left + r.width / 2 - base.x - cx * s, y: r.top + r.height / 2 - base.y - cy * s, s };
    };
    /** Pose « sur la scène » : debout sur le bord du cadre, à la place prévue. */
    const stagePose = (base: { x: number; y: number }, H: number): Pos => {
      if (!spot) return { x: 0, y: 0, s: 1 };
      const r = spot.getBoundingClientRect();
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      const s = r.height / H;
      return { x: r.left + r.width / 2 - base.x - (W * s) / 2, y: r.bottom - base.y - H * s, s };
    };
    /** Pose « sur la ligne du titre » : pieds au bas du titre, centre horizontal en `cx`. */
    const titlePose = (base: { x: number; y: number }, H: number, cx: number): Pos => {
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

    /**
     * Sa place : debout dans la marge vide à gauche du contenu, en bas de l'écran.
     * `ok` = la marge est assez large (Cocotte + 16 px) et rien (cadre…) n'y passe.
     */
    const seatOf = (base: { x: number; y: number }, H: number, vh: number) => {
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      let margin = 0;
      if (contentRef) {
        const r = contentRef.getBoundingClientRect();
        margin = r.left + parseFloat(getComputedStyle(contentRef).paddingLeft || "0");
      }
      const left = Math.max(8, (margin - W) / 2);
      const seat = { x: left, y: base.y, w: W, h: H };
      let ok = margin >= W + 16 && !isMobile();
      if (ok) {
        // Un cadre pleine largeur (fonctionnalités, appel final) ou la scène ne doit pas être à cet endroit
        for (const el of document.querySelectorAll<HTMLElement>(".lp-frame, .lp-dance")) {
          const r = el.getBoundingClientRect();
          // Marge de sécurité de 32 px : elle s'efface avant que le cadre n'arrive sur elle
          const m = 32;
          if (r.left < seat.x + seat.w + m && r.right > seat.x - m && r.top < seat.y + seat.h + m && r.bottom > seat.y - m) { ok = false; break; }
        }
      }
      void vh;
      return { pos: { x: left - base.x, y: 0, s: 1 } as Pos, ok };
    };

    const settleAfterAnimation = (now: number, seatOk: boolean) => {
      // Fin d'une animation : retour à sa place, ou disparition en douceur s'il n'y en a pas
      if (seatOk) { go("seat", now); setP("repos"); }
      else { go("vanish", now); setP("saut"); }
      void now;
      nextIdleAt = now + 4000;
      idleAction = null;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const vh = window.innerHeight;
      const H = size();
      const cs = getComputedStyle(wrap);
      const base = { x: parseFloat(cs.left), y: vh - parseFloat(cs.bottom) - H };
      const seat = seatOf(base, H, vh);

      // Déclencheur avec hystérésis : titre des événements au-dessus de 30 % de l'écran
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
      let pos: Pos = seat.pos;
      let opacity = 1;

      if (reduced) {
        // Pas de transformation ni de mouvement : debout à sa place (si elle a de la place), ou sur la scène
        phase = !active ? "off" : stageVisible ? "stage" : stagePassed && !featuresDone ? "away" : "seat";
        if (phase === "stage") pos = stagePose(base, H);
        if (titleArmed()) revealAll();
        setP("repos");
      } else {
        switch (phase) {
          case "off":
            if (active) {
              // Page rechargée plus bas : directement à sa place
              if (slotTop < -120) { from = seat.pos; settleAfterAnimation(now, seat.ok); }
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
            else if (t > DUR.wave) {
              atSlot(false);
              from = slotPose(base, H);
              // Elle va s'asseoir à sa place (ou s'efface s'il n'y en a pas)
              if (seat.ok) { go("jumpOut", now); setP("saut"); } else { go("vanish", now); setP("saut"); }
            }
            break;
          case "jumpOut": {
            const k = ease(clamp(t / DUR.jumpOut, 0, 1));
            pos = lerpPos(from, seat.pos, k, isMobile() ? 90 : 150);
            facingLeft = seat.pos.x < from.x;
            if (t > DUR.jumpOut) settleAfterAnimation(now, seat.ok);
            break;
          }
          case "vanish": {
            // Disparition en douceur : fondu + petit saut
            const k = clamp(t / DUR.vanish, 0, 1);
            pos = { x: from.x, y: from.y - Math.sin(Math.PI * Math.min(k, 0.5)) * 24, s: from.s };
            opacity = 1 - k;
            if (t > DUR.vanish) { go("seat", now); setP("repos"); }
            break;
          }
          case "seat": {
            if (!active) {
              if (seat.ok) { from = seat.pos; go("jumpIn", now); setP("saut"); }
              else { go("off", now); }
              idleAction = null;
              break;
            }
            // Ses animations : la révélation du titre, la danse sur le cadre
            if (titleArmed() && titleIn && howTitle) {
              const sp = titleSpan();
              revealDur = clamp((sp.end - sp.start) * 4.5, 1300, 2600);
              go("runIn", now); setP("marche"); idleAction = null;
              break;
            }
            if (stageVisible) {
              if (seat.ok) { from = seat.pos; go("toStage", now); setP("marche"); }
              else { go("stageAppear", now); setP("apparition"); }
              idleAction = null;
              break;
            }
            // À sa place : debout ; au repos, un coucou toutes les ~4 à 6 s
            pos = seat.pos;
            facingLeft = false;
            if (now < hopUntil) { setP("saut"); idleAction = null; nextIdleAt = now + 4000; }
            else if (scrolling) {
              // Pendant le défilement, elle reste simplement debout
              if (!idleAction) setP("repos");
              nextIdleAt = Math.max(nextIdleAt, now + 1500);
            } else {
              if (!idleAction && now >= nextIdleAt) idleAction = { start: now };
              if (idleAction) {
                setP("coucou");
                if (now - idleAction.start > 1050) {
                  idleAction = null;
                  setP("repos"); // légère respiration entre deux coucous
                  nextIdleAt = now + 4000 + Math.random() * 2000;
                }
              } else setP("repos");
            }
            break;
          }
          case "jumpIn": {
            const k = ease(clamp(t / DUR.jumpIn, 0, 1));
            pos = lerpPos(from, slotPose(base, H), k, isMobile() ? 90 : 150);
            facingLeft = false;
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
          case "toStage": {
            const k = ease(clamp(t / DUR.toStage, 0, 1));
            const b = stagePose(base, H);
            pos = lerpPos(from, b, k);
            facingLeft = b.x < from.x;
            setP("marche");
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { from = pos; go("fromStage", now); setP("saut"); break; }
            if (t > DUR.toStage) { go("stageWave", now); setP("coucou"); facingLeft = false; }
            break;
          }
          case "stageWave":
            pos = stagePose(base, H);
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { from = pos; go("fromStage", now); setP("saut"); break; }
            if (t > DUR.stageWave) {
              // Les danseuses peuvent arriver
              if (!stageGreeted) { stageGreeted = true; window.dispatchEvent(new CustomEvent(COCOTTE_ON_STAGE)); }
              go("stage", now); setP("danse");
            }
            break;
          case "stageAppear":
            pos = stagePose(base, H);
            if (stagePassed) { go("away", now); break; }
            if (stageBelow) { from = pos; go("fromStage", now); setP("saut"); break; }
            if (t > DUR.emerge) {
              if (!stageGreeted) { stageGreeted = true; window.dispatchEvent(new CustomEvent(COCOTTE_ON_STAGE)); }
              go("stage", now); setP("danse");
            }
            break;
          case "stage":
            pos = stagePose(base, H);
            setP(now < hopUntil ? "saut" : "danse");
            if (stagePassed) { go("away", now); break; }          // on continue vers le bas : elle s'efface
            if (stageBelow) { from = pos; go("fromStage", now); setP("saut"); } // on remonte : retour à sa place
            break;
          case "fromStage": {
            if (!seat.ok) { settleAfterAnimation(now, false); break; }
            const k = ease(clamp(t / DUR.fromStage, 0, 1));
            pos = lerpPos(from, seat.pos, k, isMobile() ? 90 : 150);
            facingLeft = true;
            if (t > DUR.fromStage) settleAfterAnimation(now, seat.ok);
            break;
          }
          case "away":
            // Pendant le cadre des fonctionnalités, Cocotte n'est pas visible
            if (stageVisible) { go("stageAppear", now); setP("apparition"); }
            else if (titleArmed() && titleIn && howTitle) {
              const sp = titleSpan();
              revealDur = clamp((sp.end - sp.start) * 4.5, 1300, 2600);
              go("runIn", now); setP("marche"); facingLeft = false;
            } else if (!titleArmed() && featuresDone) { go("seat", now); setP("repos"); nextIdleAt = now + 4000; }
            break;
          case "runIn": {
            // Elle arrive en courant par la gauche
            const sp = titleSpan();
            const k = clamp(t / DUR.runIn, 0, 1);
            const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
            pos = titlePose(base, H, lerp(-W, sp.start, 1 - Math.pow(1 - k, 2)));
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
            if (t > DUR.titleWave) {
              from = pos;
              if (seat.ok) { go("toCorner", now); setP("saut"); } else { go("vanish", now); setP("saut"); }
            }
            break;
          case "toCorner": {
            // Saut vers sa place
            const k = ease(clamp(t / DUR.toCorner, 0, 1));
            pos = lerpPos(from, seat.pos, k, isMobile() ? 90 : 150);
            facingLeft = seat.pos.x < from.x;
            if (t > DUR.toCorner) settleAfterAnimation(now, seat.ok);
            break;
          }
        }
      }

      setF(facingLeft);
      // Visible : en animation, ou à sa place si elle y a de la place
      const visible = phase !== "off" && phase !== "away" && !(phase === "seat" && !seat.ok);
      setS(visible);

      // Discrétion près du footer : seulement à sa place
      const drop = phase === "seat" ? hide * (H + 60) : 0;
      wrap.style.transform = `translate(${pos.x}px, ${pos.y + drop}px) scale(${pos.s})`;
      wrap.style.opacity = phase === "vanish" ? String(opacity) : "";
      wrap.classList.toggle("is-tucked", phase === "seat" && hide > 0.9);

      // La boucle continue tant que quelque chose bouge
      const animating = !["off", "seat", "away", "stage"].includes(phase);
      const busy =
        animating || scrolling || now < hopUntil || !!idleAction ||
        Math.abs(hide - (footerIn ? 1 : 0)) > 0.01 ||
        // Titre proche du seuil (il peut encore bouger sans défilement, ex. son animation d'apparition)
        Math.abs(slotTop - 0.3 * vh) < 160;
      if (busy && document.visibilityState === "visible") raf = requestAnimationFrame(tick);
      else if (phase === "seat" && seat.ok && nextIdleAt < Infinity) {
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
