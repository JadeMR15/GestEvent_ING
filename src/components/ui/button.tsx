import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium font-body transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Primaire — bordeaux #6B1A2F, survol bordeaux profond */
        default: "bg-primary text-primary-foreground shadow hover:bg-[#4A0F20]",
        /* Destructive — rouge brique */
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        /* Outline — bordure bordeaux, survol moutarde pâle */
        outline:
          "border border-[#6B1A2F] bg-transparent text-[#6B1A2F] shadow-sm hover:bg-[#F8E7B5]",
        /* Secondaire — moutarde, le bouton « punch » */
        secondary: "bg-[#E8B22E] text-[#4A0F20] shadow-sm hover:bg-[#F3C24A]",
        ghost: "text-[#6B1A2F] hover:bg-[#F8E7B5] hover:text-[#6B1A2F]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
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
