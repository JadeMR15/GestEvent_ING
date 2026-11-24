import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTACT_EMAIL, DISCOVER_LINKS, LEGAL_LINKS } from "@/lib/contact";

/**
 * Pied de page affiché aussi une fois connecté : contact, découverte, pages légales.
 * Encadré (carte blanche) pour bien le distinguer du contenu de la page.
 * Couleurs et typographies de la charte uniquement (plav-tokens.css).
 */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("relative px-4 pb-6 pt-2 lg:px-8", className)}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[var(--radius-carte)] border border-bordure bg-blanc/90 px-5 py-5 text-sm text-encre shadow-[var(--ombre-carte)] backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
        <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 font-semibold text-bordeaux-800 hover:text-bordeaux-600 transition-colors">
          <Mail className="h-4 w-4" />{CONTACT_EMAIL}
        </a>
        <nav aria-label="Découvrir Plav' et informations légales" className="flex flex-wrap gap-x-5 gap-y-2">
          {DISCOVER_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-bordeaux-600 transition-colors">{l.label}</a>
          ))}
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-bordeaux-600 transition-colors">{l.label}</Link>
          ))}
        </nav>
        <span className="text-xs text-gris-chaud">© {new Date().getFullYear()} Plav'</span>
      </div>
    </footer>
  );
}
