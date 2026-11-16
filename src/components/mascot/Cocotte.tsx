import type { CSSProperties } from "react";
import { COCOTTE_SHAPES } from "./cocotte-paths";
import "./cocotte.css";

/**
 * Cocotte, la mascotte (ESSAI design-tests) : la cocotte du logo (tracés d'origine, couleurs
 * d'origine) avec de petits bras et de petites jambes. Chaque partie est un groupe distinct,
 * animé en CSS (transform uniquement), avec ses origines aux épaules et aux hanches.
 */

export type CocotteState = "apparition" | "repos" | "marche" | "coucou" | "saut" | "retrait";

/** Repère du dessin : celui du fichier plav-cocotte.svg, élargi pour les membres. */
export const COCOTTE_BOX = { x: 260, y: -110, w: 1300, h: 1430 };
/** Centre du corps (pour aligner la mascotte sur la cocotte du titre). */
export const COCOTTE_BODY = { cx: 960, cy: 540, size: 995 };

const TILT = -10; // inclinaison du corps dans les poses (degrés)
const LIMB = "#42111E"; // bordeaux 800
const STROKE = 70; // ~7 % de la largeur du corps
const HAND = 44;

/** Point du corps après l'inclinaison (rotation autour du centre). */
function tilt(x: number, y: number) {
  const a = (TILT * Math.PI) / 180;
  const dx = x - COCOTTE_BODY.cx;
  const dy = y - COCOTTE_BODY.cy;
  return {
    x: COCOTTE_BODY.cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: COCOTTE_BODY.cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// Hanches : sur le bord bas de la cocotte (entre ~(812, 808) et la pointe ~(1072, 1018)), après inclinaison
const HIP_L = tilt(862, 848);
const HIP_R = tilt(1040, 990);
const GROUND = 1215;
const FOOT = 82;

// Épaules (repère du corps, avant inclinaison : les bras suivent le corps)
const SHOULDER_L = { x: 520, y: 652 };
const SHOULDER_R = { x: 1395, y: 352 };

export function Cocotte({
  state = "repos",
  flip = false,
  className = "",
  style,
}: {
  state?: CocotteState;
  /** true : regarde vers la gauche (retournée horizontalement). */
  flip?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox={`${COCOTTE_BOX.x} ${COCOTTE_BOX.y} ${COCOTTE_BOX.w} ${COCOTTE_BOX.h}`}
      className={`ck ck--${state} ${flip ? "ck--flip" : ""} ${className}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <g className="ck-fig">
        {/* Jambes (derrière le corps), pieds en « L » tournés vers la droite */}
        <g className="ck-leg ck-leg-l">
          <path
            d={`M${HIP_L.x} ${HIP_L.y} L${HIP_L.x} ${GROUND} L${HIP_L.x + FOOT} ${GROUND}`}
            fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
          />
        </g>
        <g className="ck-leg ck-leg-r">
          <path
            d={`M${HIP_R.x} ${HIP_R.y} L${HIP_R.x} ${GROUND} L${HIP_R.x + FOOT} ${GROUND}`}
            fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
          />
        </g>

        {/* Corps + bras, inclinés ensemble */}
        <g transform={`rotate(${TILT} ${COCOTTE_BODY.cx} ${COCOTTE_BODY.cy})`}>
          <g className="ck-sway">
            {/* Bras gauche : depuis le pétale de gauche, à l'horizontale vers l'extérieur */}
            <g className="ck-arm ck-arm-l">
              <path d={`M${SHOULDER_L.x} ${SHOULDER_L.y} L${SHOULDER_L.x - 200} ${SHOULDER_L.y}`} fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" />
              <circle cx={SHOULDER_L.x - 215} cy={SHOULDER_L.y} r={HAND} fill={LIMB} />
            </g>
            {/* Bras droit : depuis le pétale en haut à droite, en courbe vers le haut */}
            <g className="ck-arm ck-arm-r">
              <path
                d={`M${SHOULDER_R.x} ${SHOULDER_R.y} Q${SHOULDER_R.x + 120} ${SHOULDER_R.y - 40} ${SHOULDER_R.x + 110} ${SHOULDER_R.y - 210}`}
                fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round"
              />
              <circle cx={SHOULDER_R.x + 110} cy={SHOULDER_R.y - 228} r={HAND} fill={LIMB} />
            </g>
            {/* Corps : tracés d'origine de plav-cocotte.svg */}
            <g className="ck-body">
              {COCOTTE_SHAPES.map((s, i) =>
                s.tag === "path" ? <path key={i} d={s.data} fill={s.fill} /> : <polygon key={i} points={s.data} fill={s.fill} />,
              )}
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
