import { useEffect, useState } from "react";

/**
 * Fond commun de la page d'accueil (ESSAI design-tests) : un seul calque de dégradé
 * jaune 200 → bordeaux 100 → bordeaux 300, fixé derrière toute la page, qui dérive très
 * lentement (transform uniquement). En pause quand l'onglet n'est pas visible ;
 * fixe avec prefers-reduced-motion (voir landing.css).
 */
export function LandingSky() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return <div aria-hidden="true" className={`lp-sky ${hidden ? "is-paused" : ""}`} />;
}
