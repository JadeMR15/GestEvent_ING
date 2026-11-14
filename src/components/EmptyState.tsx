import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * État vide — charte § 9 : centré, padding 40/24 px, écart 16 px ; pastille ronde 104 px
 * bordeaux 100 avec la cocotte (60 px) ; titre .t-titre-3 ; message .t-corps gris chaud ;
 * bouton Principal facultatif (passé en enfant).
 */
export function EmptyState({ title, message, children, className }: {
  title: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-10 text-center", className)}>
      <span className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-bordeaux-100">
        <img src="/plav-cocotte.svg" alt="" className="h-[60px] w-[60px] object-contain" />
      </span>
      <p className="t-titre-3 text-encre">{title}</p>
      {message && <p className="t-corps max-w-md text-gris-chaud">{message}</p>}
      {children}
    </div>
  );
}
