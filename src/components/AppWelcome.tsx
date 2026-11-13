import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useAuth } from "@/hooks/useAuth";

// Accueil de l'app iOS/Android : pas de page vitrine, on va droit au but.
export function AppWelcome() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  // Texte clair dans la barre d'état sur le fond bordeaux, sombre ailleurs.
  useEffect(() => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    return () => { StatusBar.setStyle({ style: Style.Light }).catch(() => {}); };
  }, []);

  useEffect(() => {
    if (loading || !user || !role) return;
    const home = role === "volunteer" ? "/scanner" : role === "participant" ? "/events" : "/dashboard";
    navigate({ to: home, replace: true });
  }, [loading, user, role, navigate]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-primary pt-safe pb-safe text-primary-foreground">
      <img src="/plav-cocotte.svg" alt="" className="plav-drift pointer-events-none absolute -right-24 -top-24 h-80 w-80 opacity-10" />
      <img src="/plav-cocotte.svg" alt="" className="plav-drift pointer-events-none absolute -bottom-32 -left-28 h-96 w-96 opacity-10" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
        <img src="/plav-cocotte.svg" alt="" className="plav-spin-in h-36 w-36 drop-shadow-xl" />
        <img src="/plav-logotype-dark.svg" alt="Plav'" className="mt-6 h-16 w-auto" />
        <p className="mt-4 max-w-xs text-lg opacity-90">
          Toutes les soirées étudiantes, ton billet dans la poche.
        </p>
      </div>

      <div className="relative space-y-3 px-6 pb-8">
        <Link to="/register" className="tap flex h-14 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground shadow-glow">
          Créer mon compte
        </Link>
        <Link to="/login" className="tap flex h-14 items-center justify-center rounded-full border-2 border-primary-foreground/40 text-base font-semibold">
          J'ai déjà un compte
        </Link>
      </div>
    </div>
  );
}
