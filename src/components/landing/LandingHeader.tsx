import { useEffect, useState, type ReactNode } from "react";
import { BrandName } from "@/components/BrandName";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/components/nav/useNavItems";

/**
 * En-tête de la page d'accueil, version claire « studio » : transparent sur le hero
 * (le dégradé passe dessous), puis blanc à 85 % avec un léger flou dès qu'on défile
 * (seule l'opacité du calque de fond est animée). Logo couleur, liens en petites capitales.
 */
export function LandingHeader({ actions }: { actions: ReactNode }) {
  const { user, role } = useAuth();
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

  const link = "lp-caps text-encre transition-colors hover:text-bordeaux-600";

  return (
    <header className="lp-header fixed inset-x-0 top-0 z-50 w-full">
      <div aria-hidden="true" className={`lp-header-bg ${scrolled ? "is-on" : ""}`} />
      <div className="relative container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo : vers le Dashboard une fois connecté, sinon en haut de l'accueil. */}
        <Link to={user ? homeFor(role) : "/"} aria-label={user ? "Plav' — mon espace" : "Plav' — accueil"} className="flex items-center">
          <BrandName className="h-10 md:h-14" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 lg:gap-12">
          <a href="#evenements" className={link}>Événements</a>
          <a href="#fonctionnalites" className={link}>Fonctionnalités</a>
          <a href="#lp-how-title" className={link}>Comment ça marche</a>
          <a href="#contact" className={link}>Contact</a>
        </nav>
        <div className="flex items-center gap-4 sm:gap-6">{actions}</div>
      </div>
    </header>
  );
}
