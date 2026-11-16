import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/site";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { OAuthButtons } from "@/components/OAuthButtons";
import { postLoginTarget } from "@/lib/oauth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Connexion — Plav'" }] }),
});

const schema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "Minimum 6 caractères").max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Compte créé mais email pas encore confirmé : on propose de renvoyer le lien.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);

  async function resendConfirmation() {
    const parsed = schema.shape.email.safeParse(email);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: `${SITE_URL}/verification` },
    });
    setResending(false);
    if (error) {
      toast.error(/rate|limit|seconds/i.test(error.message)
        ? "Un email vient déjà d'être envoyé. Réessaie dans une minute."
        : "Envoi impossible : " + error.message);
      return;
    }
    toast.success("Email de confirmation renvoyé. Regarde aussi les indésirables.");
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      if (/not confirmed/i.test(error.message)) {
        setUnconfirmed(true);
        toast.error("Ton adresse email n'est pas encore confirmée.");
      } else if (/invalid login credentials/i.test(error.message)) {
        toast.error("Email ou mot de passe incorrect.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    setUnconfirmed(false);
    const target = await postLoginTarget(data.user.id);
    setLoading(false);
    toast.success("Bienvenue !");
    navigate({ to: target as any });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-mesh p-4 pt-safe pb-safe">
      <Link to="/" aria-label="Retour" className="tap absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-full border bg-card/80 text-primary backdrop-blur md:hidden">
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <Card className="w-full max-w-md rounded-3xl shadow-elegant border-[0.5px] max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardHeader className="text-center">
          <img src="/plav-cocotte.svg" alt="Plav'" className="mx-auto mb-3 h-28 w-28 object-contain plav-spin-in" />
          <CardTitle className="text-2xl">Bon retour !</CardTitle>
          <CardDescription>Connecte-toi à ton compte Plav'</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link to="/mot-de-passe-oublie" className="text-xs font-medium text-primary hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {unconfirmed && (
              <div className="space-y-2 rounded-xl border border-bordure bg-fond p-3 text-sm">
                <p>
                  Clique sur le lien reçu par email après ton inscription (regarde aussi les indésirables
                  et, pour une adresse d'école, la quarantaine).
                </p>
                <Button type="button" variant="outline" size="sm" onClick={resendConfirmation} disabled={resending}>
                  {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Renvoyer l'email de confirmation
                </Button>
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Se connecter
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">S'inscrire</Link>
            </p>
          </form>
          <div className="mt-4"><OAuthButtons /></div>
        </CardContent>
      </Card>
    </div>
  );
}
