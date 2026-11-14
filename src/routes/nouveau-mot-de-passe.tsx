import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Page ouverte depuis le lien "mot de passe oublié" : Supabase lit le jeton dans l'adresse
// et ouvre une session de récupération, qui permet seulement de choisir un nouveau mot de passe.
export const Route = createFileRoute("/nouveau-mot-de-passe")({
  component: NewPasswordPage,
  head: () => ({ meta: [{ title: "Nouveau mot de passe — Plav'" }] }),
});

// Mêmes règles qu'à l'inscription et dans Paramètres.
const passwordSchema = z.object({
  password: z.string()
    .min(8, "Mot de passe : 8 caractères minimum")
    .max(72, "Mot de passe : 72 caractères maximum")
    .regex(/[a-zA-Z]/, "Mot de passe : au moins une lettre")
    .regex(/[0-9]/, "Mot de passe : au moins un chiffre"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Les mots de passe ne correspondent pas" });

function readLinkState() {
  if (typeof window === "undefined") return { recovery: false, error: null as string | null };
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  return {
    recovery: params.get("type") === "recovery",
    error: params.get("error_description") || params.get("error"),
  };
}

function NewPasswordPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  // Lu avant que Supabase n'efface le jeton de l'adresse.
  const [link] = useState(readLinkState);
  const [recovery, setRecovery] = useState(link.recovery);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSaving(false);
    if (error) {
      toast.error(/different|same/i.test(error.message)
        ? "Choisis un mot de passe différent de l'ancien."
        : "Impossible de changer le mot de passe : " + error.message);
      return;
    }
    toast.success("Mot de passe modifié. Tu es connecté(e).");
    navigate({ to: "/events" });
  }

  const invalid = !!link.error || (!authLoading && (!user || !recovery));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
      <Card className="w-full max-w-md shadow-elegant border-[0.5px]">
        <CardHeader className="text-center">
          <img src="/plav-cocotte.svg" alt="Plav'" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
          {!invalid && <CardDescription>Choisis ton nouveau mot de passe.</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {authLoading && !link.error ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : invalid ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien.</p>
              </div>
              <Button asChild className="w-full bg-gradient-primary shadow-glow">
                <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
              </Button>
            </>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input id="password" type="password" autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
                <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirme le mot de passe</Label>
                <Input id="confirm" type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" disabled={saving} className="w-full bg-gradient-primary shadow-glow">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
