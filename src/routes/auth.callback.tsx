import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postLoginTarget } from "@/lib/oauth";

// Retour de Google / Apple sur le site : Supabase lit les jetons dans l'URL tout seul.
export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
  head: () => ({ meta: [{ title: "Connexion — Plav'" }] }),
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorText = hash.get("error_description") ?? new URLSearchParams(window.location.search).get("error_description");

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        toast.error(errorText ?? "Connexion annulée.");
        navigate({ to: "/login" });
        return;
      }
      toast.success("Bienvenue !");
      navigate({ to: (await postLoginTarget(data.session.user.id)) as any });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
