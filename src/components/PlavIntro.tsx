import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import "./PlavIntro.css";
// Logotype dessiné, recadré depuis nouvellepolice.png
import logotypeUrl from "./plav-intro-logotype.png";

// Durées (ms) — garder en phase avec PlavIntro.css
const TOTAL_MS = 2900;
const REDUCED_TOTAL_MS = 900;
const STORAGE_KEY = "plav-intro-seen";

// Tracés relevés sur nouveaulogo.png. Origine (0,0) = centre de l'étoile,
// c'est aussi le point autour duquel chaque pétale tourne en s'ouvrant.
// Chaque pétale : centre → coin → pointe → coin.
const PETALS = [
  {
    shape: "M0,0 L-103,-27 Q-124,-127 -70,-220 Q40,-192 110,-125 Z",
    fold: "M-70,-220 L-60,-175",
    crease: "M-30,-88 L-5,-30",
  },
  {
    shape: "M0,0 L110,-125 Q212,-158 325,-88 Q319,13 217,122 Z",
    fold: "M325,-88 L247,-57",
    crease: "M45,-7 L158,-26",
  },
  {
    shape: "M0,0 L217,122 Q212,232 140,335 Q54,316 -47,193 Z",
    fold: "M140,335 L102,243",
    crease: "M25,35 Q40,100 67,148",
  },
  {
    shape: "M0,0 L-47,193 Q-152,191 -230,145 Q-194,41 -103,-27 Z",
    fold: "M-230,145 L-167,111",
    crease: "M-30,5 L-95,57",
  },
];

// Étoile à 4 branches posée sur les plis, comme sur le logo
const STAR_PATH = "M110,-125 L20,-4 L185,90 L8,18 L-45,185 L-17,10 L-100,-27 L-6,-19 Z";

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // stockage indisponible (navigation privée…) : l'intro sera simplement rejouée
  }
}

export function PlavIntro() {
  const [show, setShow] = useState(false);

  // Décidé avant le premier affichage pour éviter un flash de la page
  useLayoutEffect(() => {
    if (alreadySeen()) return;
    markSeen();
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // matchMedia absent : animation normale
    }
    const timer = window.setTimeout(() => setShow(false), reduced ? REDUCED_TOTAL_MS : TOTAL_MS);

    // Le nettoyage tourne au démontage, y compris après un clic : le scroll est toujours restauré
    return () => {
      window.clearTimeout(timer);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="plav-intro" aria-hidden="true" onClick={() => setShow(false)}>
      <div className="plav-intro__stage">
        <div className="plav-intro__zoom">
          <div className="plav-intro__drift">
            <svg className="plav-intro__cocotte" viewBox="-250 -240 600 600">
              {PETALS.map((p, i) => (
                <g key={i} className="plav-intro__petal" style={{ "--plav-i": i } as CSSProperties}>
                  <path className="plav-intro__petal-shape" d={p.shape} />
                  <path className="plav-intro__line" d={p.fold} />
                  <path className="plav-intro__line plav-intro__line--crease" d={p.crease} />
                </g>
              ))}
              <path className="plav-intro__star" d={STAR_PATH} />
              <circle className="plav-intro__ring" cx="0" cy="0" r="60" />
            </svg>
          </div>
        </div>
        <img className="plav-intro__word" src={logotypeUrl} alt="" draggable={false} />
      </div>
    </div>
  );
}
