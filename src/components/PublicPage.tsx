import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { AppFooter } from "@/components/AppFooter";

interface PublicPageProps {
  title: string;
  /** Date de dernière mise à jour affichée sous le titre (pages légales). */
  updated?: string;
  intro?: ReactNode;
  children: ReactNode;
}

/**
 * Gabarit des pages publiques de texte (aide, pages légales) : lisibles sans compte,
 * colonne de lecture étroite, typographie de la charte (classes .legal-* ci-dessous).
 */
export function PublicPage({ title, updated, intro, children }: PublicPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <header className="border-b border-bordure/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="Accueil de Plav'"><BrandName className="h-9" /></Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-encre hover:text-bordeaux-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />Retour au site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold text-bordeaux-800">{title}</h1>
        {updated && <p className="mt-2 text-sm text-encre/70">Dernière mise à jour : {updated}</p>}
        {intro && <div className="mt-4 text-encre">{intro}</div>}
        <div className="legal-content mt-8 space-y-8 text-[15px] leading-relaxed text-encre">{children}</div>
      </main>

      <AppFooter />
    </div>
  );
}

/** Une section titrée d'une page légale. */
export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-24">
      <h2 className="text-xl font-bold text-bordeaux-800">{title}</h2>
      {children}
    </section>
  );
}

/** Information à compléter par l'équipe (structure, adresse…), bien visible tant qu'elle manque. */
export function ToFill({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-jaune-200 px-1 text-encre">[{children}]</mark>;
}
