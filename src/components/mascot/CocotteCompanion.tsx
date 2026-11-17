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
  | "toTitle" | "scrub" | "qHop" | "qWave" | "toCorner"
  // Plongeon dans « À ton tour ! »
  | "toBoard" | "board" | "dive" | "dived";

type Pos = { x: number; y: number; s: number };

const DUR = {
  emerge: 420, wave: 1000, jumpOut: 750, jumpIn: 650, retract: 300, hop: 750, vanish: 450,
  toStage: 1300, stageWave: 1000, fromStage: 750, toTitle: 500, qHop: 450, qWave: 1200, toCorner: 750, toBoard: 500, dive: 1900,
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
  const [scrub, setScrubState] = useState(false);
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
    // Plongeon : plongeoir (section du téléphone) et cadre « À ton tour ! ». Ces éléments
    // n'existent que pour les visiteurs non connectés, une fois la session vérifiée : on les
    // cherche donc à chaque image plutôt qu'une seule fois au démarrage.
    let board: HTMLElement | null = null;
    let plank: HTMLElement | null = null;
    let bend: SVGGElement | null = null;
    let ctaSection: HTMLElement | null = null; // section du cadre : son haut = bas de la section du téléphone
    let ctaFrame: HTMLElement | null = null;
    let landing: HTMLElement | null = null;
    let splash: HTMLElement | null = null;
    const findDiveParts = () => {
      if (board?.isConnected && ctaFrame?.isConnected) return;
      board = document.getElementById("lp-board");
      plank = document.getElementById("lp-board-plank");
      bend = board?.querySelector<SVGGElement>(".pl-bend") ?? null;
      ctaSection = board?.closest("section") ?? null;
      ctaFrame = document.querySelector<HTMLElement>(".lp-frame-cta");
      landing = document.getElementById("lp-cta-landing");
      splash = document.getElementById("lp-splash");
    };
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
    // Révélation au rythme du défilement
    let scrubDist = 0; // distance parcourue le long du titre (px) → cycle de marche
    let scrubLastX: number | null = null;
    let scrubMovedAt = 0;
    let splashed = false;
    // Plongeon « armé » : seulement si on est passé au-dessus de la section du téléphone. La cocotte
    // du titre est alors masquée (encore loin sous l'écran) et c'est Cocotte qui viendra prendre sa place.
    let diveArmed = false;
    let landTimer = 0;
    let facingLeft = false;
    // Coucou régulier au repos
    let idleAction: { start: number } | null = null;
    let nextIdleAt = Infinity;
    let idleTimer = 0;
    let curPose: CocotteState = "repos";
    let curShown = false;
    let curFlip = false;
    let curScrub = false;
    let raf = 0;
    let last = 0;
    let active = false;

    const isMobile = () => window.innerWidth < 768;
    const size = () => (isMobile() ? 52 : 72); // hauteur de la mascotte (px)

    const setP = (p: CocotteState) => { if (p !== curPose) { curPose = p; setPose(p); } };
    const setS = (v: boolean) => { if (v !== curShown) { curShown = v; setShown(v); } };
    const setF = (v: boolean) => { if (v !== curFlip) { curFlip = v; setFlip(v); } };
    const setScrub = (v: boolean) => { if (v !== curScrub) { curScrub = v; setScrubState(v); } };
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
    const letters = () => Array.from(howTitle?.querySelectorAll<HTMLElement>(".rv-ch") ?? []);
    /** Position d'une lettre sans son décalage d'animation (lettre cachée = descendue de 45 %). */
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform);
      return { left: r.left - m.e, right: r.right - m.e, top: r.top - m.f, bottom: r.bottom - m.f, width: r.width };
    };
    const revealAll = () => {
      letters().forEach((l) => l.classList.add("is-in"));
      howTitle?.querySelector<HTMLElement>(".rv-accent")?.style.setProperty("--hl", "1");
      if (howTitle) howTitle.dataset.armed = "done";
    };
    /** Taille de Cocotte le long du titre : ~1,15 fois la taille du texte. */
    const titleScale = (H: number) => {
      const font = parseFloat(getComputedStyle(howTitle!).fontSize) || 40;
      return { s: (font * 1.15) / H, font };
    };
    /**
     * Chemin le long du titre : une ligne par ligne de texte (pieds sur la ligne), du début du
     * premier mot jusqu'au point d'interrogation ; un petit saut d'une ligne à la suivante.
     */
    const titlePath = (H: number) => {
      const { s, font } = titleScale(H);
      const Wb = ((H * COCOTTE_BOX.w) / COCOTTE_BOX.h) * s;
      const ls = letters();
      const rows: { x0: number; x1: number; feet: number }[] = [];
      for (const l of ls) {
        const r = box(l);
        const row = rows.find((rw) => Math.abs(rw.feet - (r.bottom - font * 0.2)) < font * 0.5);
        if (row) { row.x0 = Math.min(row.x0, r.left); row.x1 = Math.max(row.x1, r.right); }
        else rows.push({ x0: r.left, x1: r.right, feet: r.bottom - font * 0.2 });
      }
      const q = ls.length ? box(ls[ls.length - 1]) : undefined;
      const vw = window.innerWidth;
      const keep = (x: number) => clamp(x, 8 + Wb / 2, vw - 8 - Wb / 2); // jamais coupée par l'écran
      const segs = rows.map((rw, i) => ({
        a: keep(rw.x0 + Wb / 2),
        b: keep(i === rows.length - 1 && q ? q.left + q.width / 2 : rw.x1 - Wb / 2),
        feet: rw.feet,
      }));
      const HOP = 60; // longueur « virtuelle » du saut entre deux lignes
      const total = segs.reduce((n, sg, i) => n + Math.max(1, sg.b - sg.a) + (i > 0 ? HOP : 0), 0);
      const at = (p: number) => {
        let d = p * total;
        for (let i = 0; i < segs.length; i++) {
          if (i > 0) {
            if (d < HOP) {
              const k = d / HOP;
              const a = segs[i - 1], b = segs[i];
              // Pendant le saut, elle compte encore sur la ligne qu'elle quitte
              return { x: lerp(a.b, b.a, k), feet: lerp(a.feet, b.feet, k) - Math.sin(Math.PI * k) * font * 0.6, row: k < 1 ? i - 1 : i, hop: true };
            }
            d -= HOP;
          }
          const len = Math.max(1, segs[i].b - segs[i].a);
          if (d <= len || i === segs.length - 1) return { x: segs[i].a + Math.min(d, len), feet: segs[i].feet, row: i, hop: false };
          d -= len;
        }
        return { x: segs[0]?.a ?? 0, feet: segs[0]?.feet ?? 0, row: 0, hop: false };
      };
      return { s, font, Wb, at, q, rows };
    };
    /** Pose à partir d'un point (centre x, pieds y) en coordonnées de l'écran. */
    const poseAt = (base: { x: number; y: number }, H: number, s: number, x: number, feet: number): Pos => {
      const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      return { x: x - base.x - (W * s) / 2, y: feet - base.y - H * s * 0.951, s };
    };
    /** Progression de la révélation : haut du titre à 85 % de l'écran → 0, à 45 % → 1. */
    const titleProgress = (vh: number) => {
      const top = howTitle!.getBoundingClientRect().top;
      return clamp((0.85 * vh - top) / (0.4 * vh), 0, 1);
    };
    /** Fait apparaître les lettres dépassées par Cocotte et dessine le surlignage derrière elle. */
    const revealBehind = (x: number, row: number, rows: { feet: number }[], font: number, hop = false) => {
      for (const l of letters()) {
        if (l.classList.contains("is-in")) continue;
        const r = box(l);
        const lrow = rows.findIndex((rw) => Math.abs(rw.feet - (r.bottom - font * 0.2)) < font * 0.5);
        // En sautant à la ligne suivante, toute la ligne quittée est révélée
        if (lrow < row || (hop && lrow === row) || (lrow === row && x >= r.left + r.width / 2)) l.classList.add("is-in");
      }
      const acc = howTitle?.querySelector<HTMLElement>(".rv-accent");
      const first = acc?.querySelector<HTMLElement>(".rv-ch");
      if (acc && first) {
        const r = acc.getBoundingClientRect();
        // Ligne du mot : celle de sa première lettre (même repère que les autres lettres)
        const fr = box(first);
        const accRow = rows.findIndex((rw) => Math.abs(rw.feet - (fr.bottom - font * 0.2)) < font * 0.5);
        const hl = accRow < 0 ? 0 : accRow < row || (hop && accRow === row) ? 1 : accRow > row ? 0 : clamp((x - r.left) / r.width, 0, 1);
        const prev = parseFloat(acc.style.getPropertyValue("--hl") || "0");
        if (hl > prev) acc.style.setProperty("--hl", hl.toFixed(3));
      }
    };
    /** Progression sur la planche : bas de la section du téléphone à 72 % de l'écran → 0, à 50 % → 1. */
    const boardProgress = (vh: number) => {
      const b = ctaSection!.getBoundingClientRect().top;
      return clamp((0.72 * vh - b) / (0.22 * vh), 0, 1);
    };
    /** Pose sur la planche (pieds sur le dessus), de son début jusqu'au bout. */
    const boardPose = (base: { x: number; y: number }, H: number, p: number) => {
      const r = plank!.getBoundingClientRect();
      const Wb = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
      const x = lerp(r.left + Wb / 2 + 4, r.right - Wb * 0.3, p);
      return { pos: poseAt(base, H, 1, x, r.top + 1), x };
    };
    const spinEl = () => wrap.querySelector<HTMLElement>(".ck-spin");
    const replay = (el: HTMLElement | null, cls: string) => {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth; // relance l'animation
      el.classList.add(cls);
    };

    /** Cycle de marche synchronisé avec la distance : un pas complet = 24 px. */
    const limbs = () => wrap.querySelectorAll<SVGGElement>(".ck-leg-l, .ck-leg-r, .ck-arm-l, .ck-arm-r, .ck-fig");
    const stepPose = (dist: number) => {
      const ph = Math.sin((2 * Math.PI * dist) / 24);
      const [legL, legR, armL, armR, fig] = [".ck-leg-l", ".ck-leg-r", ".ck-arm-l", ".ck-arm-r", ".ck-fig"].map((q) => wrap.querySelector<SVGGElement>(q));
      if (legL) legL.style.transform = `rotate(${20 * ph}deg)`;
      if (legR) legR.style.transform = `rotate(${-20 * ph}deg)`;
      if (armL) armL.style.transform = `rotate(${-14 * ph}deg)`;
      if (armR) armR.style.transform = `rotate(${12 * ph}deg)`;
      if (fig) fig.style.transform = `translateY(${-3.5 * Math.abs(ph)}%)`;
    };
    const clearStep = () => limbs().forEach((el) => { el.style.transform = ""; });
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

    /** On remonte au-dessus du titre pendant la révélation : retour à sa place (ou effacement). */
    const leaveTitle = (now: number, seat: { pos: Pos; ok: boolean }) => {
      if (seat.ok) { go("toCorner", now); setP("saut"); }
      else { go("vanish", now); setP("saut"); }
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
      // Titre suivant : la révélation commence quand son haut passe sous 85 % de l'écran
      const ht = howTitle?.getBoundingClientRect();
      const titleIn = !!ht && ht.top < 0.85 * vh && ht.bottom > 0;
      const titleBelow = !ht || ht.top > 0.85 * vh;

      // Plongeoir : sorti, et le cadre « À ton tour ! » pas encore dépassé
      findDiveParts();
      const boardReady = !!board && !!plank && !!ctaSection && !!ctaFrame && !reduced;
      const secBottom = ctaSection?.getBoundingClientRect().top ?? Infinity; // bas de la section du téléphone
      const boardActive = boardReady && diveArmed && board!.classList.contains("is-out") && secBottom < 0.72 * vh &&
        ctaFrame!.getBoundingClientRect().top > 0;
      const aboveBoard = secBottom > 0.85 * vh; // remonté au-dessus de la section du téléphone
      // Armé seulement quand la section du téléphone arrive réellement à l'écran par le dessus (pas sur
      // une page chargée ou restaurée directement plus bas : la cocotte du titre y reste visible)
      if (boardReady && aboveBoard && secBottom < 1.6 * vh) diveArmed = true;

      // Cocotte du titre masquée seulement si le plongeon va avoir lieu. Si elle arrive à l'écran sans
      // plongeon en cours (défilement très rapide, Cocotte occupée ailleurs…), on la réaffiche aussitôt.
      if (landing && boardReady && diveArmed) {
        const lr = landing.getBoundingClientRect();
        const onScreen = lr.top < vh && lr.bottom > 0;
        // Cocotte en route vers le plongeoir (ou qui termine une animation avant d'y aller) : place vide
        const headingToBoard = ["seat", "toBoard", "board", "dive", "toCorner", "vanish", "toTitle", "scrub", "qHop", "qWave"].includes(phase);
        const framePassed = ctaFrame ? ctaFrame.getBoundingClientRect().top < 0 : true;
        if ((onScreen && !headingToBoard) || (framePassed && phase !== "dive")) diveArmed = false;
      }
      landing?.classList.toggle("is-awaiting", boardReady && diveArmed && phase !== "dived");

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
              // Elle saute de sa place jusqu'au titre (ou apparaît s'il n'y a pas de place)
              from = seat.ok ? seat.pos : { x: 0, y: 0, s: 1 };
              go("toTitle", now); setP(seat.ok ? "saut" : "apparition"); idleAction = null;
              break;
            }
            // Plongeoir sorti : elle monte sur la planche
            if (boardReady && boardActive) {
              from = seat.ok ? seat.pos : { x: 0, y: 0, s: 1 };
              go("toBoard", now); setP(seat.ok ? "saut" : "apparition"); idleAction = null;
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
              from = { x: 0, y: 0, s: 1 };
              go("toTitle", now); setP("apparition"); facingLeft = false;
            } else if (!titleArmed() && featuresDone) { go("seat", now); setP("repos"); nextIdleAt = now + 4000; }
            break;
          case "toTitle": {
            // Arrivée au point du titre correspondant à la progression actuelle
            const tp = titlePath(H);
            const p = titleProgress(vh);
            const pt = tp.at(p);
            const target = poseAt(base, H, tp.s, pt.x, pt.feet);
            if (from.s === 1 && from.x === 0 && from.y === 0) pos = target; // apparition sur place
            else pos = lerpPos(from, target, ease(clamp(t / DUR.toTitle, 0, 1)), 80);
            facingLeft = false;
            if (titleBelow && t > 120) { from = pos; leaveTitle(now, seat); break; }
            if (t > DUR.toTitle) { scrubLastX = pt.x; scrubMovedAt = 0; go("scrub", now); setP("repos"); }
            break;
          }
          case "scrub": {
            // La position de Cocotte suit le défilement : elle avance, s'arrête, ou recule
            const tp = titlePath(H);
            const p = titleProgress(vh);
            const pt = tp.at(p);
            pos = poseAt(base, H, tp.s, pt.x, pt.feet);
            const dx = scrubLastX === null ? 0 : pt.x - scrubLastX;
            scrubLastX = pt.x;
            if (Math.abs(dx) > 0.2) {
              scrubDist += Math.abs(dx);
              scrubMovedAt = now;
              facingLeft = dx < 0;
            }
            const moving = now - scrubMovedAt < 140;
            setScrub(moving);
            setP("repos");
            if (moving) stepPose(scrubDist); else clearStep();
            revealBehind(pt.x, pt.row, tp.rows, tp.font, pt.hop);
            if (titleBelow && p <= 0) { setScrub(false); clearStep(); from = pos; leaveTitle(now, seat); break; }
            if (p >= 1) {
              // Fin : petit saut pour se poser sur le point d'interrogation
              setScrub(false); clearStep();
              from = pos; facingLeft = false;
              go("qHop", now); setP("saut");
            }
            break;
          }
          case "qHop": {
            const tp = titlePath(H);
            const q = tp.q!;
            const target = poseAt(base, H, tp.s, q.left + q.width / 2, q.top + tp.font * 0.2);
            pos = lerpPos(from, target, ease(clamp(t / DUR.qHop, 0, 1)), tp.font * 0.6);
            if (t > DUR.qHop) { revealAll(); go("qWave", now); setP("coucou"); }
            break;
          }
          case "qWave": {
            // Debout sur le « ? », elle fait coucou, puis retourne à sa place
            const tp = titlePath(H);
            const q = tp.q!;
            pos = poseAt(base, H, tp.s, q.left + q.width / 2, q.top + tp.font * 0.2);
            if (t > DUR.qWave) {
              from = pos;
              if (seat.ok) { go("toCorner", now); setP("saut"); } else { go("vanish", now); setP("saut"); }
            }
            break;
          }
          case "toBoard": {
            // Elle saute de sa place jusqu'à la planche (ou y apparaît s'il n'y a pas de place)
            const bp = boardPose(base, H, boardProgress(vh));
            if (from.s === 1 && from.x === 0 && from.y === 0) pos = bp.pos;
            else pos = lerpPos(from, bp.pos, ease(clamp(t / DUR.toBoard, 0, 1)), 60);
            facingLeft = false;
            if (aboveBoard) { from = pos; leaveTitle(now, seat); break; }
            if (t > DUR.toBoard) { scrubLastX = bp.x; scrubMovedAt = 0; go("board", now); setP("repos"); }
            break;
          }
          case "board": {
            // Sur la planche, sa position suit le défilement : elle avance, s'arrête, ou recule
            const p = boardProgress(vh);
            const bp = boardPose(base, H, p);
            pos = bp.pos;
            const dx = scrubLastX === null ? 0 : bp.x - scrubLastX;
            scrubLastX = bp.x;
            if (Math.abs(dx) > 0.2) { scrubDist += Math.abs(dx); scrubMovedAt = now; facingLeft = dx < 0; }
            const moving = now - scrubMovedAt < 140;
            setScrub(moving);
            setP("repos");
            if (moving) stepPose(scrubDist); else clearStep();
            if (aboveBoard || (p <= 0 && !board!.classList.contains("is-out"))) {
              setScrub(false); clearStep(); from = pos; leaveTitle(now, seat); break;
            }
            if (p >= 1) {
              // Bout de la planche : le plongeon se joue tout seul
              setScrub(false); clearStep();
              from = pos; facingLeft = false; splashed = false;
              go("dive", now); setP("repos");
            }
            break;
          }
          case "dive": {
            const tip = boardPose(base, H, 1);
            const img = (landing?.querySelector("img") ?? landing ?? ctaFrame!) as HTMLElement;
            if (t < 600) {
              // Deux petits rebonds sur le bout de la planche, qui plie à chaque réception
              const hop = Math.abs(Math.sin((2 * Math.PI * t) / 600));
              pos = { ...tip.pos, y: tip.pos.y - hop * 16 };
              if (bend) bend.style.transform = `rotate(${(1 - hop) * 5}deg)`;
              setP("repos");
            } else if (t < DUR.dive) {
              if (bend) bend.style.transform = "";
              // Vol en arc vers la place de la cocotte du titre : lent au départ, plus rapide à la chute
              const k = clamp((t - 600) / 1300, 0, 1);
              const tk = Math.pow(k, 1.35);
              const r = img.getBoundingClientRect();
              // À l'arrivée : même taille, même centre et même rotation que la cocotte du titre
              const W = (H * COCOTTE_BOX.w) / COCOTTE_BOX.h;
              const s1 = r.height / ((COCOTTE_BODY.size / COCOTTE_BOX.h) * H);
              const cx = ((COCOTTE_BODY.cx - COCOTTE_BOX.x) / COCOTTE_BOX.w) * W;
              const cy = ((COCOTTE_BODY.cy - COCOTTE_BOX.y) / COCOTTE_BOX.h) * H;
              const end = { x: r.left + r.width / 2 - base.x - cx * s1, y: r.top + r.height / 2 - base.y - cy * s1, s: s1 };
              const arc = isMobile() ? 24 : 90;
              pos = {
                x: lerp(tip.pos.x, end.x, tk),
                y: lerp(tip.pos.y, end.y, tk) - 4 * arc * tk * (1 - tk),
                s: lerp(tip.pos.s, end.s, Math.pow(tk, 1.2)), // elle grossit progressivement
              };
              // Pirouette complète (+ 10° pour compenser l'inclinaison de son corps), terminée
              // ~150 ms avant l'arrivée : la fin du vol se fait sans tourner, déjà droite
              const kSpin = clamp(k / (1150 / 1300), 0, 1);
              const sp = spinEl();
              if (sp) sp.style.transform = `rotate(${370 * ease(kSpin)}deg)`;
              // Bras levés, jambes serrées ; ensuite ses membres rentrent (terminé avec la pirouette)
              const sc = kSpin < 0.6 ? 1 : Math.max(0, 1 - (kSpin - 0.6) / 0.4);
              setScrub(true);
              setP("repos");
              const [legL, legR, armL, armR] = [".ck-leg-l", ".ck-leg-r", ".ck-arm-l", ".ck-arm-r"].map((q) => wrap.querySelector<SVGGElement>(q));
              if (armL) armL.style.transform = `rotate(78deg) scale(${sc})`;
              if (armR) armR.style.transform = `rotate(-30deg) scale(${sc})`;
              if (legL) legL.style.transform = `rotate(-10deg) scale(${sc})`;
              if (legR) legR.style.transform = `rotate(9deg) scale(${sc})`;
            } else {
              // Elle se pose : en une seule image, le compagnon disparaît et la cocotte du titre réapparaît
              // (même pose : on ne voit qu'une cocotte), puis elle rebondit et éclabousse.
              wrap.style.transition = "none";
              opacity = 0;
              diveArmed = false;
              landing?.classList.remove("is-awaiting");
              if (!splashed) {
                splashed = true;
                replay(landing, "is-landed");
                replay(splash, "is-on");
              }
              const sp = spinEl();
              if (sp) sp.style.transform = "";
              setScrub(false); clearStep();
              go("dived", now); setP("repos");
            }
            break;
          }
          case "dived":
            // Après le plongeon, elle reste cachée jusqu'en bas de la page… sauf si on remonte
            if (aboveBoard) { go("seat", now); setP("apparition"); nextIdleAt = now + 4000; }
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
      wrap.dataset.phase = phase; // étape courante (lecture / débogage)
      // Visible : en animation, ou à sa place si elle y a de la place
      const visible = phase !== "off" && phase !== "away" && phase !== "dived" && !(phase === "seat" && !seat.ok);
      setS(visible);

      // Discrétion près du footer : seulement à sa place
      const drop = phase === "seat" ? hide * (H + 60) : 0;
      wrap.style.transform = `translate(${pos.x}px, ${pos.y + drop}px) scale(${pos.s})`;
      wrap.style.opacity = phase === "vanish" ? String(opacity) : phase === "dived" ? "0" : "";
      if (phase !== "dived" && wrap.style.transition) wrap.style.transition = "";
      wrap.classList.toggle("is-tucked", phase === "seat" && hide > 0.9);

      // La boucle continue tant que quelque chose bouge
      const animating = !["off", "seat", "away", "stage", "scrub", "board", "dived"].includes(phase) ||
        ((phase === "scrub" || phase === "board") && now - scrubMovedAt < 160);
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
      clearTimeout(landTimer);
      landing?.classList.remove("is-awaiting");
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
        <span className="ck-spin">
          <Cocotte state={pose} flip={flip} scrub={scrub} className="ck-companion-figure" />
        </span>
        {sparks > 0 && (
          <span key={sparks} className="ck-sparks" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ "--a": `${i * 60 - 90}deg` } as CSSProperties} />)}
          </span>
        )}
      </button>
    </div>
  );
}
