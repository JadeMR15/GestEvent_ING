import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Charte Plav' § 4. Grand 48 px (défaut) / Petit 36 px ; Nunito Sans 600 ; icône 20 px, écart 8 px.
// Focus clavier : halo jaune (--focus-halo).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-halo)] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Secondaire — action importante : fond bordeaux 600, texte crème ; survol bordeaux 700 */
        default:
          "bg-bordeaux-600 text-blanc hover:bg-bordeaux-700 disabled:bg-bordure disabled:text-gris-chaud",
        /* Statut rouge (suppression, annulation) */
        destructive:
          "bg-statut-rouge-500 text-blanc hover:bg-statut-rouge-700 disabled:bg-bordure disabled:text-gris-chaud",
        /* Contour — actions annexes : bordure 2 px bordeaux, survol bordeaux 100 */
        outline:
          "border-2 border-bordeaux-600 bg-transparent text-bordeaux-600 hover:bg-bordeaux-100 disabled:border-bordure disabled:text-gris-chaud",
        /* Principal — l'action clé de l'écran : fond jaune 300, texte bordeaux (jamais blanc) */
        secondary:
          "bg-jaune-300 text-bordeaux-600 hover:bg-jaune-400 hover:text-bordeaux-700 disabled:bg-bordure disabled:text-gris-chaud",
        /* Contour clair — sur fond bordeaux : bordure 2 px crème, survol bordeaux 700 */
        outlineLight:
          "border-2 border-blanc bg-transparent text-blanc hover:bg-bordeaux-700 disabled:border-bordeaux-400 disabled:text-bordeaux-300",
        /* Discret (hors charte : forme conservée, couleurs de la charte) */
        ghost: "text-bordeaux-600 hover:bg-bordeaux-100 hover:text-bordeaux-600 disabled:text-gris-chaud",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /* Grand : 48 px, padding 24 px, arrondi moyen, texte 16 px */
        default: "h-12 rounded-[var(--radius-moyen)] px-6 text-base",
        /* Petit (tableaux, dashboard) : 36 px, padding 16 px, arrondi petit, texte 14 px */
        /* Zone tactile étendue à 44 px sur mobile (sans changer la taille visible) */
        sm: "relative h-9 rounded-[var(--radius-petit)] px-4 text-sm [&_svg]:size-4 max-md:after:absolute max-md:after:-inset-1 max-md:after:content-['']",
        lg: "h-12 rounded-[var(--radius-moyen)] px-6 text-base",
        /* Bouton icône (hors charte) : taille conservée, zone tactile étendue à 44 px sur mobile */
        icon: "relative h-9 w-9 rounded-[var(--radius-moyen)] max-md:after:absolute max-md:after:-inset-1 max-md:after:content-['']",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
