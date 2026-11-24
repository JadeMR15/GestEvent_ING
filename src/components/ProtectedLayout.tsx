import { type ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MobileHeader, MobileTabBar } from "./MobileNav";
import { AppTopBar } from "./nav/AppTopBar";
import { AppFooter } from "./AppFooter";
import "./nav/app-shell.css";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2, ShieldAlert } from "lucide-react";

interface Props {
  children: ReactNode;
  allow?: AppRole[];
}

/** Fond de l'espace connecté : le dégradé de l'accueil (fixe), sous un voile clair. */
function AppSky() {
  return (
    <>
      <div aria-hidden="true" className="app-sky" />
      <div aria-hidden="true" className="app-veil" />
    </>
  );
}

export function ProtectedLayout({ children, allow }: Props) {
  const { user, role, loading, isVerified, verificationStatus, isStudent } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showVerifyBanner =
    ((role === "participant" && isStudent) || role === "organizer") && verificationStatus !== null && !isVerified && pathname !== "/verification";

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  if (loading || !user || !role) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <AppSky />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (allow && !allow.includes(role)) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-6">
        <AppSky />
        <div className="text-center">
          <h1>Accès refusé</h1>
          <p className="mt-2 text-muted-foreground">Votre rôle ne permet pas d'accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen w-full flex-col">
      <AppSky />
      <AppTopBar />
      <MobileHeader />
      {showVerifyBanner && (
        <div className="px-4 pt-3 md:px-4 lg:px-8 md:pt-4">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 backdrop-blur md:text-sm">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              {verificationStatus === "review" || verificationStatus === "pending"
                ? "Ton justificatif est en cours de vérification. Tu pourras t'inscrire aux événements dès qu'il sera validé."
                : "Compte non vérifié : envoie ton justificatif étudiant pour t'inscrire aux événements."}
            </span>
            {verificationStatus !== "review" && verificationStatus !== "pending" && (
              <Link to="/verification" className="font-semibold underline">Vérifier mon compte</Link>
            )}
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-8 md:px-4 md:pt-8 md:pb-8 lg:px-8">{children}</main>
      {/* Pied de page aussi une fois connecté ; sur mobile, il reste au-dessus de la barre d'onglets. */}
      <AppFooter className="pb-28 md:pb-6" />
      <MobileTabBar />
    </div>
  );
}
