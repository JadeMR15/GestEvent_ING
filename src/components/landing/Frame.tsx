import type { ReactNode } from "react";
import { useInView } from "./hooks";

/**
 * Grand cadre bordeaux 900 aux coins très arrondis, posé sur le dégradé (ESSAI design-tests).
 * Apparition une seule fois au défilement : léger agrandissement (0.96 → 1) + fondu.
 */
export function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useInView<HTMLDivElement>(0.08);
  return (
    <div ref={ref} className={`lp-frame ${visible ? "is-in" : ""} ${className}`}>
      {children}
    </div>
  );
}
