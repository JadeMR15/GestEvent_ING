import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Charte § 7 : 48 px, arrondi moyen, bordure 1.5 px sable ; focus bordeaux + halo ; erreur rouge ; désactivé sable.
          "flex h-12 w-full rounded-[var(--radius-moyen)] border-[1.5px] border-bordure bg-blanc px-4 text-base text-encre transition-colors placeholder:text-gris-chaud focus-visible:border-bordeaux-600 focus-visible:shadow-[var(--focus-halo)] focus-visible:outline-none aria-[invalid=true]:border-statut-rouge-500 disabled:cursor-not-allowed disabled:bg-bordure disabled:text-gris-chaud file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-encre",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
