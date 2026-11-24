import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Cocotte, type CocotteState } from "@/components/mascot/Cocotte";

/**
 * Page de test de la mascotte (ESSAI design-tests) — uniquement en développement,
 * non liée dans le menu. En production, la route renvoie « Page introuvable ».
 */
export const Route = createFileRoute("/dev/cocotte")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: CocotteLab,
});

const STATES: CocotteState[] = ["apparition", "repos", "marche", "coucou", "saut", "retrait", "danse"];

function CocotteLab() {
  const [flip, setFlip] = useState(false);
  const [replay, setReplay] = useState(0);
  return (
    <div className="min-h-screen bg-fond p-6 md:p-10">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="t-titre-1">Cocotte — états</h1>
        <button type="button" className="rounded-full border border-bordure bg-blanc px-4 py-2 text-sm" onClick={() => setFlip((f) => !f)}>
          Retourner ({flip ? "regarde à gauche" : "regarde à droite"})
        </button>
        <button type="button" className="rounded-full border border-bordure bg-blanc px-4 py-2 text-sm" onClick={() => setReplay((r) => r + 1)}>
          Rejouer
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
        {STATES.map((s) => (
          <figure key={`${s}-${replay}`} className="flex flex-col items-center gap-3 rounded-[var(--radius-carte)] border border-bordure bg-blanc p-6">
            <Cocotte state={s} flip={flip} style={{ height: 180 }} />
            <figcaption className="t-legende text-gris-chaud">{s}</figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-10 flex items-end gap-8">
        {[52, 72, 120].map((h) => (
          <div key={h} className="flex flex-col items-center gap-2">
            <Cocotte state="repos" flip={flip} style={{ height: h }} />
            <span className="t-legende text-gris-chaud">{h} px</span>
          </div>
        ))}
      </div>
    </div>
  );
}
