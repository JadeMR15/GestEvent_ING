import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  /* DA: border-radius 20px, Inter labels, fond coloré */
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium font-body transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        /* Par défaut — moutarde · texte bordeaux profond */
        default: "border-transparent bg-jaune-200 text-bordeaux-800 shadow",
        /* Secondaire — moutarde pâle · texte bordeaux */
        secondary: "border-transparent bg-jaune-100 text-bordeaux-600",
        /* Complet / destructive — rouge brique · texte blanc */
        destructive: "border-transparent bg-statut-rouge-500 text-white shadow",
        /* Liste attente — outline bordeaux */
        outline: "border-bordeaux-600 text-bordeaux-600 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
