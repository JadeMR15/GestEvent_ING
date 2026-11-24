import { useState, type CSSProperties } from "react";
import "./cocotte.css";
import "./dance.css";

/**
 * Danseuse (ESSAI design-tests) : un corps rond avec la photo, et les mêmes bras et jambes
 * que Cocotte (traits bordeaux 800, mains rondes, pieds en « L »). Mêmes états que Cocotte
 * (repos, coucou, saut) plus « danse ». transform uniquement.
 */
export type DanseurState = "repos" | "coucou" | "saut" | "danse";

const LIMB = "#42111E"; // bordeaux 800
const STROKE = 10; // ~7 % de la largeur du corps (144)
const HAND = 7;

export function Danseur({
  prenom,
  photo,
  state = "repos",
  index = 0,
  load = true,
  style,
}: {
  prenom: string;
  photo: string;
  state?: DanseurState;
  /** Décalage de la danse (pour que les danseuses ne bougent pas toutes en même temps). */
  index?: number;
  /** false tant que la scène est loin : la photo n'est pas encore demandée. */
  load?: boolean;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`dz dz--${state}`} style={{ ...style, "--i": index } as CSSProperties}>
      <div className="dz-fig">
        {/* Membres (derrière le corps) — repère 240 × 300, corps : disque centré en (120, 110), rayon 72 */}
        <svg className="dz-limbs" viewBox="0 0 240 300" aria-hidden="true" focusable="false">
          <g className="ck-leg ck-leg-l dz-leg-l">
            <path d="M100 172 L100 268 L114 268" fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className="ck-leg ck-leg-r dz-leg-r">
            <path d="M140 172 L140 268 L154 268" fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className="ck-arm ck-arm-l dz-arm-l">
            <path d="M54 118 L18 118" fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" />
            <circle cx={12} cy={118} r={HAND} fill={LIMB} />
          </g>
          <g className="ck-arm ck-arm-r dz-arm-r">
            <path d="M184 92 Q206 86 204 58" fill="none" stroke={LIMB} strokeWidth={STROKE} strokeLinecap="round" />
            <circle cx={204} cy={51} r={HAND} fill={LIMB} />
          </g>
        </svg>
        {/* Corps : la photo, recadrée en cercle */}
        <div className="dz-body">
          {broken || !load ? (
            <span className={`dz-initial ${broken ? "is-fallback" : ""}`} aria-hidden={!broken}>
              {broken ? prenom.charAt(0) : ""}
            </span>
          ) : (
            <img src={photo} alt={prenom} loading="lazy" decoding="async" onError={() => setBroken(true)} />
          )}
          {broken && <span className="sr-only">{prenom}</span>}
        </div>
      </div>
      {/* Bulle avec le prénom (survol / toucher) */}
      <span className="dz-bubble" aria-hidden="true">{prenom}</span>
    </div>
  );
}
