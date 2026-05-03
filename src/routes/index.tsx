import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, QrCode, Users, Sparkles, ArrowRight, Timer } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      {/* Mesh background overlay */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-mesh opacity-60" />

      <header className="relative container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-gradient-vibrant shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-xl italic text-[#72243E]">GestEvent</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Connexion</Link>
          </Button>
          <Button asChild className="bg-gradient-primary shadow-glow">
            <Link to="/register">Commencer</Link>
          </Button>
        </div>
      </header>

      <main className="relative container mx-auto px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#D5A0A8] bg-white/70 px-4 py-1.5 text-xs font-medium backdrop-blur text-[#72243E]">
            <Sparkles className="h-3.5 w-3.5 text-[#72986F]" />
            Organisez, gérez, scannez — en un seul endroit
          </div>

          <h1 className="text-5xl tracking-tight md:text-7xl" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--text-title)" }}>
            L'événementiel{" "}
            <span className="bg-gradient-vibrant bg-clip-text text-transparent">simplifié</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-[#2C2C2A]/70">
            Création d'événements, réservation avec timer, QR codes, liste d'attente intelligente —
            une expérience soignée pour les organisateurs comme les participants.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-primary shadow-glow">
              <Link to="/register">
                Créer un compte <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">J'ai déjà un compte</Link>
            </Button>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mx-auto mt-24 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: CalendarDays,
              title: "Événements beaux & rapides",
              desc: "Créez et publiez en quelques secondes, avec gestion de la capacité et brouillon.",
            },
            {
              icon: Timer,
              title: "Timer 15 min ⭐",
              desc: "Chaque clic bloque la place 15 min. Le premier confirmé gagne — fin des doublons.",
            },
            {
              icon: QrCode,
              title: "QR Check-in",
              desc: "Un QR unique par inscription. Scan caméra ou saisie manuelle le jour J.",
            },
            {
              icon: Users,
              title: "Liste d'attente",
              desc: "Promotion automatique quand une place se libère. Gestion sans effort.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-[12px] border-[0.5px] border-[#D5A0A8] bg-white/80 p-6 backdrop-blur shadow-elegant"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[8px] bg-gradient-primary shadow-glow">
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--text-title)", fontSize: "1.1rem" }}>
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-[#2C2C2A]/70">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
