import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CalendarDays, QrCode, Users, TrendingUp } from "lucide-react";
import "./CocotteFeatures.css";

/*
 * Section « fonctionnalités » de la landing : une vraie cocotte en papier en 3D,
 * manipulée comme avec les doigts au fil du scroll :
 *   1. elle arrive fermée et tourne un peu sur elle-même,
 *      les titres sont écrits sur les pointes ;
 *   2. elle s'ouvre dans un sens, puis dans l'autre, comme quand on joue :
 *      chaque ouverture dévoile une fonctionnalité écrite à l'intérieur, pendant
 *      qu'elle tourne d'un quart de tour pour la présenter face au lecteur ;
 *   3. à la fin, elle se referme.
 *
 * Tout est calculé à la main (pas de lib 3D) : chaque face est un <div> placé
 * avec une matrix3d. Le navigateur gère la profondeur (preserve-3d), on recalcule
 * seulement les sommets, les matrices et l'ombrage à chaque frame.
 */

type Feature = {
  label: string; // titre écrit sur la cocotte (court !)
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
};

const FEATURES: Feature[] = [
  {
    label: "Crée",
    icon: CalendarDays,
    title: "Ton event en ligne en une minute",
    desc: "Titre, date, lieu, capacité : c'est publié, avec la carte. Tu modifies quand tu veux, tout le monde voit la mise à jour.",
  },
  {
    label: "Billets",
    icon: QrCode,
    title: "Une billetterie qui se scanne",
    desc: "La place est bloquée 15 min le temps de confirmer, la liste d'attente prend le relais quand c'est complet. Chaque billet a son QR code, retrouvé dans « Mes billets ».",
  },
  {
    label: "Équipe",
    icon: Users,
    title: "Tes bénévoles à l'entrée",
    desc: "Un lien suffit pour que tes bénévoles scannent les billets depuis leur téléphone, sans compte. Les emails de confirmation partent tout seuls.",
  },
  {
    label: "Stats",
    icon: TrendingUp,
    title: "Tes chiffres en direct",
    desc: "Inscriptions, remplissage, présences, recettes : le dashboard se met à jour en temps réel. Et tout s'exporte en CSV en un clic.",
  },
];

/* ───────────── petite algèbre 3D ───────────── */

type V3 = [number, number, number];
type V2 = [number, number];
type M3 = number[]; // 3×3, rangé par lignes

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

const apply = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const mul = (a: M3, b: M3): M3 => {
  const r: M3 = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};

// Repère CSS : x à droite, y vers le BAS, z vers le spectateur
const rotX = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

const DEG = Math.PI / 180;

/* ───────────── géométrie ─────────────
 * Comme une vraie cocotte : 4 pointes (pyramides creuses), une par quart du
 * carré de base [-S, S]², fermées dessous par le dos. Chaque pointe a 2 faces
 * extérieures (titres) et 2 faces intérieures, qui ne se voient que quand la
 * cocotte s'ouvre.
 *
 * Ouverture « en x » : les pointes x > 0 s'écartent des pointes x < 0 en pivotant
 * autour de l'axe z (comme deux doigts qui s'écartent) → un sillon s'ouvre, bordé
 * de deux « murs » faits chacun de deux faces intérieures. Ouverture « en z » :
 * pareil dans l'autre sens. 4 murs en tout = 4 fonctionnalités.
 */

type Name = "O" | "E1" | "C" | "E2" | "A";
type FaceKind = "outer" | "wall" | "back";
type Role = "icon" | "label" | "plain";

type FaceDef = {
  kind: FaceKind;
  role: Role;
  petal: number;
  names: [Name, Name, Name];
  feature: number;
  local: [V2, V2, V2];
  w: number;
  h: number;
  points: string;
  centroid: V2;
};

// Triangles d'une pointe (pointe 0, sommets nommés). Le 3e sommet est toujours le sommet A.
// Vu de dehors, la face (C, E2) est à gauche de la pointe et (E1, C) à droite.
const PETAL_TRIS: [Name, Name, Name][] = [
  ["C", "E2", "A"],
  ["E1", "C", "A"],
  ["O", "E1", "A"],
  ["E2", "O", "A"],
];
const BACK_NAMES: [Name, Name, Name] = ["O", "E1", "E2"];

// signe des coordonnées du quart de chaque pointe (pointe q = pointe 0 tournée de q·90°)
const SX = [1, 1, -1, -1];
const SZ = [1, -1, -1, 1];

// Mur intérieur où est écrite chaque fonctionnalité, et orientation de la cocotte
// pour le présenter : on regarde le mur du fond à travers le sillon ouvert.
// Les ouvertures alternent x / z et la cocotte tourne d'un quart de tour à chaque fois.
const WALLS = ["-x", "-z", "+x", "+z"] as const;
const YAWS = [-90, 0, 90, 180];
const modeOf = (k: number) => (k % 2 === 0 ? "x" : "z");

function petalVerts(S: number, apexY: number): Record<Name, V3> {
  return {
    O: [0, 0, 0],
    E1: [S, 0, 0],
    C: [S, 0, S],
    E2: [0, 0, S],
    A: [S / 2, apexY, S / 2],
  };
}

function finishFace(f: Omit<FaceDef, "w" | "h" | "points" | "centroid">): FaceDef {
  const minX = Math.min(...f.local.map((p) => p[0]));
  const minY = Math.min(...f.local.map((p) => p[1]));
  const local = f.local.map(([x, y]) => [x - minX, y - minY] as V2) as [V2, V2, V2];
  return {
    ...f,
    local,
    w: Math.max(...local.map((p) => p[0])),
    h: Math.max(...local.map((p) => p[1])),
    points: local.map((p) => p.join(",")).join(" "),
    centroid: [(local[0][0] + local[1][0] + local[2][0]) / 3, (local[0][1] + local[1][1] + local[2][1]) / 3],
  };
}

function buildFaces(S: number, H: number): FaceDef[] {
  const faces: FaceDef[] = [];
  const V = petalVerts(S, -H);

  for (let petal = 0; petal < 4; petal++) {
    const r = rotY(petal * 90 * DEG);
    const inside = apply(r, [S / 2, -H * 0.3, S / 2]);
    PETAL_TRIS.forEach((names, tri) => {
      const [p, q, apex] = names.map((n) => apply(r, V[n]));
      // repère local = la face vue de l'extérieur de la pointe, le sommet en haut
      let n = norm(cross(sub(q, p), sub(apex, p)));
      const mid = scale(add(add(p, q), apex), 1 / 3);
      if (dot(n, sub(mid, inside)) < 0) n = scale(n, -1);
      const down = sub(scale(add(p, q), 0.5), apex);
      const ey = norm(sub(down, scale(n, dot(down, n))));
      const ex = cross(ey, n); // ex × ey = n : lisible à l'endroit vu de dehors
      const local = [p, q, apex].map((pt) => [dot(sub(pt, apex), ex), dot(sub(pt, apex), ey)] as V2) as [V2, V2, V2];

      if (tri < 2) {
        // extérieur : chaque pointe porte une fonctionnalité, icône à gauche, titre à droite
        faces.push(finishFace({ kind: "outer", role: tri === 0 ? "icon" : "label", petal, names, feature: petal, local }));
      } else {
        // intérieur : à quel mur appartient la face ? (bord de base le long de l'axe x → sillon z)
        const base = names[0] === "O" ? q : p;
        const alongX = Math.abs(base[0]) > Math.abs(base[2]);
        const wall = alongX ? (apex[2] < 0 ? "-z" : "+z") : apex[0] < 0 ? "-x" : "+x";
        const feature = WALLS.indexOf(wall);
        // vue de face pour cette fonctionnalité : icône sur la face de gauche, titre à droite
        const seen = apply(rotY(YAWS[feature] * DEG), apex);
        faces.push(finishFace({ kind: "wall", role: seen[0] < 0 ? "icon" : "label", petal, names, feature, local }));
      }
    });

    // Dos : un quart de carré par pointe, repère = coordonnées (x, z) du carré pour que
    // le logo posé au centre se recompose d'un quart à l'autre. local[0] = O, le centre.
    const local = BACK_NAMES.map((nm) => {
      const pt = apply(r, V[nm]);
      return [pt[0], -pt[2]] as V2;
    }) as [V2, V2, V2];
    faces.push(finishFace({ kind: "back", role: "plain", petal, names: BACK_NAMES, feature: 0, local }));
  }

  return faces;
}

/* ───────────── animation pilotée par le scroll ───────────── */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const range01 = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const PITCH_CLOSED = -24 * DEG; // posée : vue un peu d'en haut, de trois quarts
const PITCH_PINCH = -8 * DEG; // pincée : vue presque de côté
const PITCH_OPEN = -58 * DEG; // ouverte : on plonge le regard dans le creux, presque par-dessus
const LIGHT = norm([-0.45, -0.8, 0.55]);

// Toute l'animation tourne dans le même sens, sans jamais s'arrêter tout à fait :
// elle ralentit seulement quand une fonctionnalité est bien face au lecteur.
// Les étapes d'une vraie cocotte : pincée (pointes réunies) → posée (pointes
// écartées, fente en X au milieu) → ouverte dans un sens → pincée → ouverte dans
// l'autre sens → … → refermée, puis reposée.
const INTRO = [0, 0.17] as const; // arrivée qui tourne, jusqu'à la première ouverture
const RELEASE = [0.02, 0.08] as const; // pincée → posée
const FIRST_OPEN = [0.09, 0.17] as const; // posée → ouverte (et la paire d'en face se pince)
const FEATURES_END = 0.85;
const CLOSE = [0.85, 0.91] as const; // elle se referme (pincée)…
const REST = [0.91, 0.98] as const; // … puis se repose, pointes écartées
const OUTRO = [0.85, 0.99] as const; // en continuant de tourner
const LINGER = 0.88; // 0 = vitesse constante, proche de 1 = longue pause sur chaque fonctionnalité

// Escalier adouci : vaut k pile sur la fonctionnalité k, avance vite entre deux,
// lentement autour (vitesse minimale 1 - LINGER), sans à-coup ni arrêt
const glide = (s: number) => s - (LINGER * Math.sin(2 * Math.PI * s)) / (2 * Math.PI);

function stateAt(p: number) {
  const last = FEATURES.length - 1;
  let openX = 0, openZ = 0, u: number, yaw: number;
  let pinch = 1; // 1 = pointes réunies (pincée), 0 = posée, pointes écartées

  if (p < INTRO[1]) {
    // arrivée : un tour et demi de quart, qui ralentit en arrivant sur la 1re fonctionnalité
    const t = clamp01((p - INTRO[0]) / (INTRO[1] - INTRO[0]));
    yaw = YAWS[0] - 150 * (1 - t) * (1 - t);
    openX = range01(p, ...FIRST_OPEN);
    pinch = p < FIRST_OPEN[0] ? 1 - range01(p, ...RELEASE) : openX;
    u = 0;
  } else if (p < FEATURES_END) {
    u = glide(((p - INTRO[1]) / (FEATURES_END - INTRO[1])) * last);
    const k = Math.min(last - 1, Math.floor(u));
    const t = u - k;
    // on referme le sens en cours, on passe par la cocotte fermée, on ouvre l'autre sens
    const closing = 1 - range01(t, 0.12, 0.5);
    const opening = range01(t, 0.5, 0.88);
    if (modeOf(k) === "x") {
      openX = closing;
      openZ = opening;
    } else {
      openZ = closing;
      openX = opening;
    }
    yaw = YAWS[0] + 90 * u;
  } else {
    // se referme en continuant de tourner, en accélérant doucement
    const c = range01(p, ...CLOSE);
    const t = clamp01((p - OUTRO[0]) / (OUTRO[1] - OUTRO[0]));
    if (modeOf(last) === "x") openX = 1 - c;
    else openZ = 1 - c;
    yaw = YAWS[last] + 135 * t * t;
    pinch = 1 - range01(p, ...REST);
    u = last;
  }

  const open = Math.max(openX, openZ);
  return {
    openX,
    openZ,
    pinch,
    yaw: yaw * DEG,
    pitch: lerp(lerp(PITCH_CLOSED, PITCH_PINCH, pinch * (1 - open)), PITCH_OPEN, open),
    active: Math.min(last, Math.max(0, Math.round(u))),
  };
}

// Matrice CSS qui envoie les 3 sommets locaux d'une face sur ses 3 sommets à l'écran
function affineMatrix(local: [V2, V2, V2], world: [V3, V3, V3]) {
  const [[u0, v0], [u1, v1], [u2, v2]] = local;
  const d1 = sub(world[1], world[0]);
  const d2 = sub(world[2], world[0]);
  const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
  const det = du1 * dv2 - du2 * dv1;
  const a = scale(sub(scale(d1, dv2), scale(d2, dv1)), 1 / det);
  const b = scale(sub(scale(d2, du1), scale(d1, du2)), 1 / det);
  const c = norm(cross(a, b));
  const o = sub(sub(world[0], scale(a, u0)), scale(b, v0));
  return {
    css: `matrix3d(${a[0]},${a[1]},${a[2]},0,${b[0]},${b[1]},${b[2]},0,${c[0]},${c[1]},${c[2]},0,${o[0]},${o[1]},${o[2]},1)`,
    normal: c,
  };
}

export function CocotteFeatures() {
  const sectionRef = useRef<HTMLElement>(null);
  const faceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState(150); // demi-côté S du carré de base, en px
  const [active, setActive] = useState(0);

  // Hauteur d'une pointe : avec S/√2, ses 4 faces sont des triangles équilatéraux,
  // comme sur une vraie cocotte (pointes trapues, faces extérieures en losange)
  const H = size * Math.SQRT1_2;
  const faces = useMemo(() => buildFaces(size, H), [size, H]);

  // Taille responsive : ouverte, la cocotte fait ~3,4 S de large et ~2,4 S de haut
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const s = w >= 1024
        ? Math.min((h - 160) / 2.3, (w - 440) / 3.2, 230) // texte sur le côté
        : Math.min((h - 360) / 2.2, (w - 24) / 3.1, 180); // texte en bas
      setSize(Math.round(Math.max(70, s)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const S = size;

    // Fermée, les pointes se rejoignent presque au centre ; ouverte, elles s'écartent de ça
    const CONV = Math.atan(S / 2 / H); // pointes jointives : elles se touchent pile, sans jour entre elles
    const OPEN = 34 * DEG;

    let current = -1;
    let target = 0;
    let raf = 0;
    let running = false;
    let lastActive = -1;
    const lastShade: string[] = [];
    const lastText: string[] = [];

    const readTarget = () => {
      const rect = section.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      target = span > 0 ? clamp01(-rect.top / span) : 0;
    };

    const V = petalVerts(S, -H);
    const petalRot = [0, 1, 2, 3].map((q) => rotY(q * 90 * DEG));

    const render = (p: number) => {
      const st = stateAt(p);

      // chaque pointe pivote autour de deux axes passant par le centre : vers le centre
      // (fermée) ou vers l'extérieur (ouverte), indépendamment en x et en z
      const phiX = lerp(-CONV * st.pinch, OPEN, st.openX);
      const phiZ = lerp(-CONV * st.pinch, OPEN, st.openZ);
      // L'ordre compte : on resserre d'abord les deux pointes d'une même paire (elles
      // restent collées, comme sous les doigts), puis on écarte les deux paires.
      // Ouverte en x → le resserrement en z passe en premier, et inversement ; entre
      // les deux, on mélange en douceur pour éviter tout à-coup.
      const w = smooth(clamp01(0.5 + (st.openZ - st.openX) * 2));
      const pts = petalRot.map((r, q) => {
        const ax = rotZ(SX[q] * phiX), az = rotX(-SZ[q] * phiZ);
        const mX = mul(mul(ax, az), r); // ouverture en x appliquée en dernier
        const mZ = mul(mul(az, ax), r); // ouverture en z appliquée en dernier
        const out = {} as Record<Name, V3>;
        (Object.keys(V) as Name[]).forEach((nm) => {
          const a = apply(mX, V[nm]), b = apply(mZ, V[nm]);
          out[nm] = add(scale(a, 1 - w), scale(b, w));
        });
        return out;
      });

      const cam = mul(rotX(st.pitch), rotY(st.yaw));
      const open = Math.max(st.openX, st.openZ);
      const pivot: V3 = [0, -H * lerp(0.42, 0.3, open), 0];
      const zoom = 1 + 0.1 * open; // on se penche un peu dedans quand elle s'ouvre

      faces.forEach((face, i) => {
        const el = faceRefs.current[i];
        if (!el) return;
        const world = face.names.map((nm) => scale(apply(cam, sub(pts[face.petal][nm], pivot)), zoom)) as [V3, V3, V3];
        const { css, normal } = affineMatrix(face.local, world);
        el.style.transform = css;

        // Ombrage : plus la face se détourne de la lumière, plus elle s'assombrit
        const towardViewer = normal[2] < 0 ? scale(normal, -1) : normal;
        const lit = Math.max(0, dot(towardViewer, LIGHT));
        const dark = face.kind === "wall" ? 0.34 : face.kind === "back" ? 0.1 : 0.26; // dos à peine ombré : le logo reste net
        const sh = (dark * (1 - lit)).toFixed(3);
        // le texte écrit à l'intérieur n'apparaît que sur un mur bien tourné vers nous
        // (vu de profil, il serait écrasé et illisible)
        if (face.kind === "wall") {
          const shown = face.feature === st.active ? 1 : 0;
          const op = (shown * range01(Math.abs(normal[2]), 0.3, 0.55)).toFixed(2);
          const contentEl = contentRefs.current[i];
          if (contentEl && lastText[i] !== op) {
            lastText[i] = op;
            contentEl.style.opacity = op;
          }
        }
        if (lastShade[i] !== sh) {
          lastShade[i] = sh;
          const shadeEl = shadeRefs.current[i];
          if (shadeEl) shadeEl.style.opacity = sh;
        }
      });

      if (shadowRef.current) {
        // l'ombre s'élargit quand la cocotte s'ouvre, et s'estompe quand elle est retournée
        const up = clamp01(Math.cos(st.pitch) * 1.4);
        shadowRef.current.style.opacity = String(0.25 + 0.4 * up);
        shadowRef.current.style.transform = `translateX(-50%) scaleX(${1 + 0.25 * open})`;
      }
      if (hintRef.current) hintRef.current.style.opacity = String(1 - clamp01(p / 0.03));
      if (st.active !== lastActive) {
        lastActive = st.active;
        setActive(st.active);
      }
    };

    const tick = () => {
      // petit lissage pour que l'animation reste fluide même avec une molette saccadée
      current = current < 0 ? target : current + (target - current) * 0.07;
      if (Math.abs(target - current) < 0.0002) current = target;
      render(current);
      if (current !== target) raf = requestAnimationFrame(tick);
      else running = false;
    };
    const kick = () => {
      readTarget();
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    readTarget();
    current = target;
    render(current);

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
    };
  }, [faces, size, H]);

  return (
    <section
      ref={sectionRef}
      id="fonctionnalites"
      className="cocotte-features"
      style={{ height: `${100 + FEATURES.length * 120}vh` }}
    >
      <div className="cocotte-features__sticky">
        <div className="cocotte-features__layout">
          <div className="cocotte-features__stage" aria-hidden="true">
            <div ref={shadowRef} className="cocotte-features__shadow" style={{ width: size * 2.8, height: size * 0.7, top: `calc(50% + ${H * 0.75}px)` }} />
            <div className="cocotte-features__float">
              <div className="cocotte-features__scene">
                {faces.map((f, i) => {
                  const own = FEATURES[f.feature];
                  const Icon = own.icon;
                  const alt = f.kind === "wall" ? f.feature % 2 : f.kind === "outer" ? f.petal % 2 : 0;
                  return (
                    <div
                      key={i}
                      ref={(el) => { faceRefs.current[i] = el; }}
                      className={`cocotte-face cocotte-face--${f.kind}${alt ? " cocotte-face--alt" : ""}`}
                      style={{ width: f.w, height: f.h }}
                    >
                      {f.kind === "back" ? (
                        <svg width={f.w} height={f.h} viewBox={`0 0 ${f.w} ${f.h}`}>
                          <rect className="cocotte-face__paper" width={f.w} height={f.h} />
                          <defs>
                            <pattern id={`cocotte-grid-${i}`} width={size / 7} height={size / 7} patternUnits="userSpaceOnUse">
                              <path d={`M ${size / 7} 0 L 0 0 0 ${size / 7}`} className="cocotte-face__grid" />
                            </pattern>
                          </defs>
                          <rect width={f.w} height={f.h} fill={`url(#cocotte-grid-${i})`} />
                        </svg>
                      ) : (
                        <svg width={f.w} height={f.h} viewBox={`0 0 ${f.w} ${f.h}`}>
                          <polygon className="cocotte-face__paper" points={f.points} />
                          {f.kind === "outer" && (
                            <>
                              <defs>
                                <pattern id={`cocotte-grid-${i}`} width={size / 7} height={size / 7} patternUnits="userSpaceOnUse">
                                  <path d={`M ${size / 7} 0 L 0 0 0 ${size / 7}`} className="cocotte-face__grid" />
                                </pattern>
                              </defs>
                              <polygon points={f.points} fill={`url(#cocotte-grid-${i})`} />
                            </>
                          )}
                          {/* pli du milieu, comme sur le vrai papier */}
                          <line className="cocotte-face__crease" x1={f.local[2][0]} y1={f.local[2][1]} x2={(f.local[0][0] + f.local[1][0]) / 2} y2={(f.local[0][1] + f.local[1][1]) / 2} />
                        </svg>
                      )}
                      <div
                        ref={(el) => { shadeRefs.current[i] = el; }}
                        className="cocotte-face__shade"
                        style={f.kind === "back" ? undefined : { clipPath: `polygon(${f.local.map(([x, y]) => `${x}px ${y}px`).join(", ")})` }}
                      />
                      {f.role === "icon" && (
                        <div
                          ref={(el) => { contentRefs.current[i] = el; }}
                          className="cocotte-face__content"
                          style={{ left: f.centroid[0], top: f.h * (f.kind === "wall" ? 0.66 : 0.64), fontSize: size * (f.kind === "wall" ? 0.2 : 0.17) }}
                        >
                          <Icon className="cocotte-face__icon" strokeWidth={1.6} />
                        </div>
                      )}
                      {f.role === "label" && (
                        <div
                          ref={(el) => { contentRefs.current[i] = el; }}
                          className="cocotte-face__content"
                          style={{ left: f.centroid[0], top: f.h * 0.68, fontSize: size * (f.kind === "wall" ? 0.15 : 0.14) }}
                        >
                          <span className="cocotte-face__label">{own.label}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div ref={hintRef} className="cocotte-features__hint">Fais défiler pour jouer</div>
          </div>

          <div className="cocotte-features__text">
            <h2 className="cocotte-features__heading">
              Tout plav', <span className="plav-highlight">en une cocotte.</span>
            </h2>
            <div className="cocotte-features__cards">
              {FEATURES.map((f, i) => (
                <div key={f.label} className={`cocotte-features__card ${i === active ? "is-active" : ""}`}>
                  <span className="cocotte-features__kicker">{f.label}</span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="cocotte-features__dots" aria-hidden="true">
              {FEATURES.map((f, i) => (
                <span key={f.label} className={i === active ? "is-active" : ""} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
