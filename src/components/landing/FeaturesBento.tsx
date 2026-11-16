import { useEffect, useState, type ComponentType } from "react";
import { FakeQr, Reveal } from "./Motion";
import { useInView, usePrefersReducedMotion } from "./hooks";

export type BentoFeature = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
  /** Emplacement dans la grille bento (voir .lp-bento dans landing.css). */
  area: "qr" | "timer" | "dash" | "crea" | "insc" | "roles" | "sync" | "web";
};

/** Grille « bento » des fonctionnalités : mêmes titres et descriptions, tailles variées. */
export function FeaturesBento({ features }: { features: BentoFeature[] }) {
  return (
    <div className="lp-bento">
      {features.map((f, i) => {
        const big = f.area === "qr" || f.area === "timer" || f.area === "dash";
        return (
          <Reveal
            key={f.title}
            delay={i * 80}
            className={`lp-bento-cell lp-area-${f.area}`}
          >
            <article className={`lp-bento-card ${big ? "" : "lp-bento-small"} lp-card-${f.area}`}>
              <div className="lp-bento-text">
                <div className="lp-bento-icon"><f.icon className="h-5 w-5" strokeWidth={2} /></div>
                <div>
                  <h3 className="lp-bento-title">{f.title}</h3>
                  <p className="lp-bento-desc">{f.desc}</p>
                </div>
              </div>
              {f.area === "qr" && <QrVisual />}
              {f.area === "timer" && <TimerVisual />}
              {f.area === "dash" && <BarsVisual />}
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

/** QR stylisé avec une ligne de scan jaune qui le parcourt en boucle. */
function QrVisual() {
  const { ref, visible } = useInView(0, false);
  return (
    <div ref={ref} aria-hidden="true" className={`lp-qr ${visible ? "" : "is-paused"}`}>
      <FakeQr className="lp-qr-code" />
      <div className="lp-qr-scan"><span /></div>
      <span className="lp-qr-corner lp-qr-tl" />
      <span className="lp-qr-corner lp-qr-tr" />
      <span className="lp-qr-corner lp-qr-bl" />
      <span className="lp-qr-corner lp-qr-br" />
    </div>
  );
}

/** Compte à rebours décoratif 15:00 → 14:59… (tourne seulement quand il est visible). */
function TimerVisual() {
  const { ref, visible } = useInView(0, false);
  const reduced = usePrefersReducedMotion();
  const [left, setLeft] = useState(15 * 60);
  useEffect(() => {
    if (!visible || reduced) return;
    const id = window.setInterval(() => setLeft((s) => (s <= 0 ? 15 * 60 : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [visible, reduced]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div ref={ref} aria-hidden="true" className="lp-timer">
      <span>{mm}</span>
      <span className="lp-timer-colon">:</span>
      <span className="lp-timer-ss">
        <span key={ss} className={reduced ? "" : "lp-tick"}>{ss}</span>
      </span>
    </div>
  );
}

/** Mini graphique en barres qui montent quand la carte apparaît. */
function BarsVisual() {
  const { ref, visible } = useInView(0.3);
  const bars = [38, 55, 46, 68, 60, 82, 100];
  return (
    <div ref={ref} aria-hidden="true" className={`lp-bars ${visible ? "is-in" : ""}`}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={i === bars.length - 1 ? "is-live" : ""}
          style={{ height: `${h}%`, transitionDelay: `${150 + i * 70}ms` }}
        />
      ))}
    </div>
  );
}
