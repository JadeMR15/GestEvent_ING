import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/site";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/mot-de-passe-oublie")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Mot de passe oublié — Plav'" }] }),
});

const emailSchema = z.string().trim().email("Email invalide").max(255);

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(), {
      redirectTo: `${SITE_URL}/nouveau-mot-de-passe`,
    });
    setLoading(false);
    // Supabase répond pareil que le compte existe ou non : une erreur ici vient de l'envoi
    // (limite atteinte, adresse refusée par le service d'email…), on peut donc l'afficher.
    if (error) {
      console.error("resetPasswordForEmail", error.status, error.message);
      toast.error(/rate|limit|seconds/i.test(error.message)
        ? "Trop de demandes. Réessaie dans quelques minutes."
        : `L'email n'a pas pu être envoyé : ${error.message}`);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
      <Card className="w-full max-w-md shadow-elegant border-[0.5px]">
        <CardHeader className="text-center">
          <img src="/plav-cocotte.svg" alt="Plav'" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <CardTitle className="text-2xl">Mot de passe oublié</CardTitle>
          <CardDescription>
            {sent ? "Regarde ta boîte mail." : "Indique l'email de ton compte : on t'envoie un lien pour en choisir un nouveau."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-[#E3CC9C] bg-[#FBF5EA] p-4 text-sm">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#6B1A2F]" />
                <p>
                  Si un compte existe avec <strong>{email.trim()}</strong>, tu vas recevoir un email avec un lien
                  pour choisir un nouveau mot de passe. Pense à regarder dans les indésirables.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Renvoyer ou changer d'adresse
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Recevoir le lien
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">Retour à la connexion</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
