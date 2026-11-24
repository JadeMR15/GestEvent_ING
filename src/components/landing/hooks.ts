import { useEffect, useRef, useState } from "react";

/**
 * Apparition au défilement (IntersectionObserver) — même principe que le hook
 * d'origine de la page d'accueil.
 * - once = true (défaut) : passe à `true` une seule fois, à la première apparition.
 * - once = false : suit la visibilité en continu (pour mettre en pause les
 *   animations en boucle quand elles sont hors de l'écran).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.15, once = true) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (once) {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) { setVisible(true); return; }
    }
    const obs = new IntersectionObserver(([e]) => {
      if (once) {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
      } else {
        setVisible(e.isIntersecting);
      }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);
  return { ref, visible };
}

/** `true` si l'utilisateur a demandé à réduire les animations. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
