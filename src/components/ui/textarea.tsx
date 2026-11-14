import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-12 w-full py-3 rounded-[var(--radius-moyen)] border-[1.5px] border-sable bg-blanc px-4 text-base text-encre transition-colors placeholder:text-gris-chaud focus-visible:border-bordeaux-600 focus-visible:shadow-[var(--focus-halo)] focus-visible:outline-none aria-[invalid=true]:border-statut-rouge-500 disabled:cursor-not-allowed disabled:bg-sable disabled:text-gris-chaud",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
