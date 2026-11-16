import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Charte Plav' § 6 : pilule, padding 4/12 px (10 px à gauche), Inter Tight 600 13 px,
// pastille ronde 7 px (statuts) avec un écart de 6 px.
const DOT = "before:inline-block before:size-[7px] before:shrink-0 before:rounded-full before:content-['']";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-pilule)] py-1 pl-2.5 pr-3 font-body text-[13px] font-semibold leading-tight transition-colors focus:outline-none focus-visible:shadow-[var(--focus-halo)]",
  {
    variants: {
      variant: {
        /* Marque (catégorie) — jaune 100, texte bordeaux 600, sans pastille */
        default: "bg-jaune-100 text-bordeaux-600",
        secondary: "bg-jaune-100 text-bordeaux-600",
        /* Annulé / Complet — rouge */
        destructive: `bg-statut-rouge-100 text-statut-rouge-700 ${DOT} before:bg-statut-rouge-500`,
        /* Contour (hors charte : forme conservée) */
        outline: "border border-bordeaux-600 bg-transparent text-bordeaux-600",
        /* Confirmé / payé / présent */
        success: `bg-statut-vert-100 text-statut-vert-700 ${DOT} before:bg-statut-vert-500`,
        /* En attente / presque complet */
        warning: `bg-statut-orange-100 text-statut-orange-700 ${DOT} before:bg-statut-orange-500`,
        /* Information */
        info: `bg-statut-bleu-100 text-statut-bleu-700 ${DOT} before:bg-statut-bleu-500`,
        /* Neutre (terminé, brouillon) */
        neutral: `bg-bordure text-encre ${DOT} before:bg-gris-chaud`,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// Badges de statut déjà colorés par leur className (bg-emerald-100…) : on ajoute la pastille
// de la couleur du statut, comme le veut la charte.
const STATUS_DOTS: [RegExp, string][] = [
  [/\bbg-(emerald|green|violet|statut-vert)-/, "before:bg-statut-vert-500"],
  [/\bbg-(amber|orange|yellow|statut-orange)-/, "before:bg-statut-orange-500"],
  [/\bbg-(red|rose|statut-rouge)-/, "before:bg-statut-rouge-500"],
  [/\bbg-(blue|sky|statut-bleu)-/, "before:bg-statut-bleu-500"],
];

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  const dot = typeof className === "string" ? STATUS_DOTS.find(([re]) => re.test(className))?.[1] : undefined;
  return <div className={cn(badgeVariants({ variant }), dot && `${DOT} ${dot}`, className)} {...props} />;
}

export { Badge, badgeVariants };
