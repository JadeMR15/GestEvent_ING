import { useEffect, useState } from "react";
import { Cocotte, type CocotteState } from "./Cocotte";
import "./login-cocotte.css";

/**
 * Page de connexion (ESSAI design-tests) : Cocotte invite à se connecter, puis à s'inscrire.
 * - Ordinateur (≥ 900 px) : une Cocotte à gauche de la carte (« Connecte-toi ! »), puis une à
 *   droite, tournée vers la carte (« Ou inscris-toi ! »). Chacune saute depuis le bas, fait coucou
 *   ~2,5 s avec sa bulle, puis repart (petit saut vers le bas + fondu).
 * - Écrans étroits : une seule petite Cocotte au-dessus de la carte, dans un espace réservé
 *   (la carte ne bouge pas), dont la bulle change de texte.
 * - Une seule fois par chargement ; rien avec prefers-reduced-motion.
 * - Purement décoratif : aria-hidden, pointer-events: none, jamais sur la carte.
 *   transform et opacity uniquement.
 */

type Phase = "hidden" | "in" | "wave" | "bubbleOut" | "out";
type Slot = { phase: Phase; pose: CocotteState; text: string; bubble: boolean };

const HIDDEN: Slot = { phase: "hidden", pose: "repos", text: "", bubble: false };
const SAY_IN = "Connecte-toi\u202F!";
const SAY_UP = "Ou inscris-toi\u202F!";

export function LoginCocotte() {
  const [mode, setMode] = useState<"side" | "top" | null>(null);
  const [left, setLeft] = useState<Slot>(HIDDEN);
  const [right, setRight] = useState<Slot>(HIDDEN);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const narrow = window.matchMedia("(max-width: 899px)").matches;
    setMode(narrow ? "top" : "side");

    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    /** Une apparition complète : saut depuis le bas, coucou + bulle(s), départ. */
    const play = (set: (s: Slot) => void, start: number, texts: string[]) => {
      let t = start;
      at(t, () => set({ phase: "in", pose: "apparition", text: texts[0], bubble: false }));
      t += 550;
      texts.forEach((text, i) => {
        const t0 = t;
        at(t0, () => set({ phase: "wave", pose: "coucou", text, bubble: true }));
        at(t0 + 1100, () => set({ phase: "wave", pose: "repos", text, bubble: true }));
        at(t0 + 1300, () => set({ phase: "wave", pose: "coucou", text, bubble: true }));
        // Changement de texte (écrans étroits) : la bulle se referme puis se rouvre avec le nouveau
        if (i < texts.length - 1) at(t0 + 2500, () => set({ phase: "wave", pose: "repos", text, bubble: false }));
        t += 2500 + (i < texts.length - 1 ? 250 : 0);
      });
      at(t, () => set({ phase: "bubbleOut", pose: "repos", text: texts[texts.length - 1], bubble: false }));
      at(t + 250, () => set({ phase: "out", pose: "repos", text: "", bubble: false }));
      at(t + 750, () => set(HIDDEN));
      return t + 750;
    };

    if (narrow) {
      play(setLeft, 500, [SAY_IN, SAY_UP]);
    } else {
      const end = play(setLeft, 500, [SAY_IN]);
      play(setRight, end, [SAY_UP]);
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  const one = (slot: Slot, side: "l" | "r" | "t") =>
    slot.phase === "hidden" ? null : (
      <div className={`lc-spot lc-${side} is-${slot.phase}`}>
        <div className={`lc-bubble ${slot.bubble ? "is-on" : ""}`}>{slot.text}</div>
        <div className="lc-jump">
          <Cocotte state={slot.pose} flip={side === "r"} className="lc-ck" />
        </div>
      </div>
    );

  return (
    <>
      {/* Écrans étroits : place réservée au-dessus de la carte (présente dès le rendu serveur) */}
      <div className="lc-top-space" aria-hidden="true">{mode === "top" && one(left, "t")}</div>
      {mode === "side" && (
        <div aria-hidden="true">
          {one(left, "l")}
          {one(right, "r")}
        </div>
      )}
    </>
  );
}
