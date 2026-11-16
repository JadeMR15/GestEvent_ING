import { useEffect, useState, type ReactNode } from "react";
import { BrandName } from "@/components/BrandName";

/**
 * En-tête de la page d'accueil : transparent sur le hero sombre (logo doré, liens crème),
 * puis crème avec un léger flou dès qu'on défile (logo couleur, liens bordeaux).
 * Seules l'opacité du fond et des logos sont animées.
 */
export function LandingHeader({ actions }: { actions: (onDark: boolean) => ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const onDark = !scrolled;
  const link = onDark ? "text-blanc hover:text-jaune-300" : "text-bordeaux-600 hover:opacity-70";

  return (
    <header className="lp-header fixed inset-x-0 top-0 z-50 w-full">
      <div aria-hidden="true" className={`lp-header-bg ${scrolled ? "is-on" : ""}`} />
      <div className="relative container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="grid">
          <span aria-hidden={!onDark} className={`[grid-area:1/1] transition-opacity duration-300 ${onDark ? "opacity-100" : "opacity-0"}`}>
            <BrandName onDark className="h-10 md:h-14" />
          </span>
          <span aria-hidden={onDark} className={`[grid-area:1/1] transition-opacity duration-300 ${onDark ? "opacity-0" : "opacity-100"}`}>
            <BrandName className="h-10 md:h-14" />
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-16 text-sm font-medium">
          <a href="#evenements" className={`transition-opacity ${link}`}>Événements</a>
          <a href="#fonctionnalites" className={`transition-opacity ${link}`}>Fonctionnalités</a>
          <a href="#contact" className={`transition-opacity ${link}`}>Contact</a>
        </nav>
        <div className="flex gap-2">{actions(onDark)}</div>
      </div>
    </header>
  );
}
