import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useInView, usePrefersReducedMotion } from "./hooks";

/** Bloc qui apparaît (fondu + légère montée) quand il entre dans l'écran. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, visible } = useInView(0.12);
  return (
    <div
      ref={ref}
      className={`lp-reveal ${visible ? "is-in" : ""} ${className}`}
      style={{ ...style, animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Titre qui apparaît mot à mot. Le texte reste identique (espaces conservés). */
export function WordReveal({ text, startIndex = 0 }: { text: string; startIndex?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="lp-word" style={{ "--i": startIndex + i } as CSSProperties}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** Chiffre qui compte de 0 jusqu'à `value` quand `active` passe à true. */
export function CountUp({ value, active, duration = 1400 }: { value: number; active: boolean; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced || value === 0) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value, duration, reduced]);
  return <>{shown}</>;
}

/** QR code stylisé (décoratif, ne contient aucune donnée). */
export function FakeQr({ className = "" }: { className?: string }) {
  const n = 21;
  let d = "";
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let on: boolean;
      if (finder(x, y)) {
        const fx = x < 7 ? x : x - (n - 7);
        const fy = y < 7 ? y : y - (n - 7);
        const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3));
        on = ring !== 2;
      } else if ((x === 7 || y === 7 || x === n - 8 || y === n - 8) && (x < 8 || y < 8 || x > n - 9 || y > n - 9)) {
        on = false;
      } else {
        on = ((x * 7 + y * 13 + x * y * 3) % 5) < 2;
      }
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} className={className} aria-hidden="true" shapeRendering="crispEdges">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
