import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Danseur, type DanseurState } from "./Danseur";
import { DANSEURS } from "./danseurs";
import { usePrefersReducedMotion } from "@/components/landing/hooks";
import "./dance.css";

/** Événement envoyé par Cocotte quand elle est arrivée au centre de la scène et a fait coucou. */
export const COCOTTE_ON_STAGE = "plav:cocotte-on-stage";

/**
 * Scène de danse (ESSAI design-tests) entre les événements et les fonctionnalités :
 * Cocotte vient au centre, puis les créatrices de Plav' arrivent une par une et toutes
 * dansent tant que la scène est visible. Au survol / toucher, une danseuse montre son
 * prénom et fait coucou (pas de lien, pas de clic).
 */
export function DanceScene() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [arrived, setArrived] = useState(false);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false); // photos demandées seulement quand la scène approche
  const [hovered, setHovered] = useState<number | null>(null);
  const [dancing, setDancing] = useState(false);

  // Visibilité de la scène (pause des animations hors écran) et chargement différé des photos
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    const ioNear = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: "600px 0px" });
    io.observe(el);
    ioNear.observe(el);
    return () => { io.disconnect(); ioNear.disconnect(); };
  }, []);

  // Les danseuses arrivent quand Cocotte a fait coucou au centre (ou directement si animations réduites)
  useEffect(() => {
    if (reduced) { setArrived(true); setDancing(false); return; }
    const onStage = () => setArrived(true);
    window.addEventListener(COCOTTE_ON_STAGE, onStage);
    return () => window.removeEventListener(COCOTTE_ON_STAGE, onStage);
  }, [reduced]);

  // Filet de sécurité : si Cocotte n'est pas venue (ex. page rechargée sur la scène), elles arrivent quand même
  useEffect(() => {
    if (arrived || !visible || reduced) return;
    const t = window.setTimeout(() => setArrived(true), 3500);
    return () => window.clearTimeout(t);
  }, [arrived, visible, reduced]);

  // Une fois arrivées (sauts terminés), elles dansent en boucle
  useEffect(() => {
    if (!arrived || reduced) return;
    const t = window.setTimeout(() => setDancing(true), 700 + DANSEURS.length * 150);
    return () => window.clearTimeout(t);
  }, [arrived, reduced]);

  const stateOf = (i: number): DanseurState => (hovered === i ? "coucou" : dancing ? "danse" : "repos");

  return (
    <section
      ref={ref}
      className={`lp-dance ${arrived ? "is-arrived" : ""} ${visible ? "" : "is-paused"}`}
      aria-labelledby="lp-dance-title"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <h2 id="lp-dance-title" className="lp-dance-title">
          Les <span className="t-accent plav-highlight">créatrices</span> de Plav'
        </h2>
        <div className="lp-dance-floor">
          {/* Place de Cocotte, au centre de la scène */}
          <div id="lp-dance-spot" className="lp-dance-spot" aria-hidden="true" />
          {DANSEURS.map((d, i) => (
            <div
              key={d.prenom}
              className={`lp-dancer-slot d${i} ${hovered === i ? "is-hovered" : ""}`}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(i); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered((h) => (h === i ? null : h)); }}
              onPointerDown={(e) => { if (e.pointerType !== "mouse") setHovered((h) => (h === i ? null : i)); }}
            >
              <div className="lp-dancer-hop" style={{ "--n": i } as CSSProperties}>
                <Danseur prenom={d.prenom} photo={d.photo} index={i} state={stateOf(i)} load={near} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
