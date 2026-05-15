import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  /* DA: border-radius 20px, Inter labels, fond coloré */
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium font-body transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        /* Confirmé — vert clair · texte vert profond */
        default: "border-transparent bg-[#D5E8A0] text-[#073D25] shadow",
        /* En attente / secondaire — rose pâle · texte bordeaux */
        secondary: "border-transparent bg-[#EED4D8] text-[#6B0F2C]",
        /* Complet / destructive — rose vif · texte blanc */
        destructive: "border-transparent bg-[#C87488] text-white shadow",
        /* Liste attente — outline bordeaux */
        outline: "border-[#6B0F2C] text-[#6B0F2C] bg-transparent",
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
