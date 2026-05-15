import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Users, ClipboardList, Heart, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "À propos — Plav'" }] }),
});

const roles = [
  {
    id: "organisateur",
    icon: ClipboardList,
    title: "Organisateur",
    color: "bg-[#EED4D8]",
    iconColor: "text-[#6B0F2C]",
    tagline: "Créez et gérez vos événements de A à Z",
    description:
      "L'organisateur est le pilote de l'événement. Il crée la page de l'événement, configure les billets, définit les créneaux d'inscription et suit en temps réel les inscriptions, les présences et les finances.",
    powers: [
      "Créer et publier des événements",
      "Gérer la liste des participants",
      "Scanner les QR codes à l'entrée",
      "Accéder aux statistiques et exports",
      "Assigner des bénévoles à l'événement",
      "Envoyer des communications aux inscrits",
    ],
  },
  {
    id: "participant",
    icon: Users,
    title: "Participant",
    color: "bg-[#D4E4EE]",
    iconColor: "text-[#1E4A6E]",
    tagline: "Inscrivez-vous et vivez l'expérience",
    description:
      "Le participant est au cœur de chaque événement. Il s'inscrit en quelques clics, reçoit un billet avec QR code par e-mail, et peut consulter ses réservations à tout moment depuis son espace personnel.",
    powers: [
      "S'inscrire à des événements en un clic",
      "Recevoir un billet QR code par e-mail",
      "Consulter ses billets dans « Mes billets »",
      "S'inscrire sur liste d'attente",
      "Annuler une inscription si besoin",
    ],
  },
  {
    id: "benevole",
    icon: Heart,
    title: "Bénévole",
    color: "bg-[#D4EED8]",
    iconColor: "text-[#1E6E30]",
    tagline: "Contribuez et faites la différence",
    description:
      "Le bénévole prête main-forte à l'organisateur le jour J. Il accède à l'espace bénévole via un lien sécurisé unique, peut scanner les billets des participants et visualiser le planning des tâches qui lui sont confiées.",
    powers: [
      "Accéder à l'espace bénévole sans compte",
      "Scanner les QR codes des participants",
      "Consulter les tâches assignées",
      "Signaler des problèmes en temps réel",
    ],
  },
];

function AboutPage() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF6F1] font-body text-[#2C2C2A]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#D5A0A8]/30 bg-white/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo2.png" alt="Plav'" className="h-8 w-auto" />
            <span className="font-display text-lg italic text-[#6B0F2C]">Plav'</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-16 text-center">
        <h1 className="font-display text-4xl italic text-[#6B0F2C] mb-4">À propos des rôles</h1>
        <p className="text-[#2C2C2A]/60 max-w-xl mx-auto text-lg">
          Plav' est pensée pour trois types d'utilisateurs. Découvrez ce que chaque rôle permet de faire.
        </p>
        <div className="flex justify-center gap-4 mt-8 flex-wrap">
          {roles.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              className="flex items-center gap-2 rounded-full border border-[#D5A0A8]/40 bg-white px-5 py-2 text-sm font-medium text-[#6B0F2C] hover:bg-[#EED4D8] transition-colors"
            >
              <r.icon className="h-4 w-4" />
              {r.title}
            </a>
          ))}
        </div>
      </section>

      {/* Role cards */}
      <section className="container mx-auto px-6 pb-20 space-y-16">
        {roles.map((role, i) => (
          <div
            key={role.id}
            id={role.id}
            className={`scroll-mt-24 rounded-3xl border border-[#D5A0A8]/20 bg-white p-8 md:p-12 shadow-sm flex flex-col ${
              i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
            } gap-10 items-start`}
          >
            {/* Icon block */}
            <div className={`flex-shrink-0 rounded-2xl ${role.color} p-8 flex items-center justify-center`}>
              <role.icon className={`h-16 w-16 ${role.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1">
              <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${role.iconColor}`}>
                Rôle
              </p>
              <h2 className="font-display text-3xl italic text-[#6B0F2C] mb-2">{role.title}</h2>
              <p className="text-[#2C2C2A]/50 text-sm mb-4 italic">{role.tagline}</p>
              <p className="text-[#2C2C2A]/70 mb-6 leading-relaxed">{role.description}</p>

              <h3 className="text-sm font-semibold text-[#2C2C2A] mb-3 uppercase tracking-wide">Ce qu'il peut faire</h3>
              <ul className="space-y-2">
                {role.powers.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-[#2C2C2A]/70">
                    <ChevronRight className={`h-4 w-4 mt-0.5 flex-shrink-0 ${role.iconColor}`} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D5A0A8]/30 bg-white/60 py-8">
        <div className="container mx-auto px-6 text-center text-xs text-[#2C2C2A]/40">
          © {new Date().getFullYear()} Plav'. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
