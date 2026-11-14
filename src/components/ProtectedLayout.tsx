import { type ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileHeader, MobileTabBar } from "./MobileNav";
import { AppSidebar } from "./AppSidebar";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2, ShieldAlert } from "lucide-react";

interface Props {
  children: ReactNode;
  allow?: AppRole[];
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (allow && !allow.includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Accès refusé</h1>
          <p className="mt-2 text-muted-foreground">Votre rôle ne permet pas d'accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <MobileHeader />
          {showVerifyBanner && (
            <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs md:text-sm text-amber-900">
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
          )}
          <main className="flex-1 px-4 pt-4 pb-28 md:p-6 lg:p-8">{children}</main>
          <MobileTabBar />
        </div>
      </div>
    </SidebarProvider>
  );
}
