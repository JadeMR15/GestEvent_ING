import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { emailMatchesDomains, parseDomains } from "@/lib/schools";

export const Route = createFileRoute("/register-school")({
  component: RegisterSchoolPage,
  head: () => ({ meta: [{ title: "Inscrire mon école — Plav'" }] }),
});

const schema = z.object({
  schoolName: z.string().trim().min(2, "Nom de l'école requis").max(120),
  fullName:   z.string().trim().min(2, "Ton nom est requis").max(160),
  email:      z.string().trim().toLowerCase().email("Email invalide").max(255),
  password:   z.string()
    .min(8, "Mot de passe : 8 caractères minimum")
    .max(72, "Mot de passe : 72 caractères maximum")
    .regex(/[a-zA-Z]/, "Mot de passe : au moins une lettre")
    .regex(/[0-9]/, "Mot de passe : au moins un chiffre"),
  passwordConfirm: z.string(),
}).refine((d) => d.password === d.passwordConfirm, { message: "Les mots de passe ne correspondent pas" });

function RegisterSchoolPage() {
  const navigate = useNavigate();
  const [schoolName, setSchoolName] = useState("");
  const [domainsInput, setDomainsInput] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [website, setWebsite] = useState(""); // piège à robots
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (loading) return;
    if (website) { toast.success("Demande envoyée !"); return; }
    const parsed = schema.safeParse({ schoolName, fullName, email, password, passwordConfirm });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const { domains, error: domainError } = parseDomains(domainsInput);
    if (domainError) { toast.error(domainError); return; }
    if (!emailMatchesDomains(parsed.data.email, domains)) {
      toast.error("Utilise ton email professionnel de l'école (sur un des domaines indiqués).");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/school-admin`,
        data: {
          account_type:   "school",
          full_name:      parsed.data.fullName,
          school_name:    parsed.data.schoolName,
          school_domains: domains.join(","),
        },
      },
    });
    setLoading(false);
    if (error) {
      // Erreur côté base : nom déjà pris ou domaine refusé (on ne dit pas lequel).
      toast.error("Inscription impossible : cette école est peut-être déjà inscrite, ou un domaine est refusé.");
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    toast.success("Demande envoyée ! Confirme ton email, puis l'équipe Plav' validera ton école.");
    navigate({ to: "/login" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-mesh p-4 pt-safe pb-safe">
      <Link to="/register" aria-label="Retour" className="tap absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-full border bg-card/80 text-primary backdrop-blur md:hidden">
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <Card className="w-full max-w-md rounded-3xl shadow-elegant border-[0.5px] max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Inscrire mon école</CardTitle>
          <CardDescription>
            Gérez les associations de votre école, suivez leurs statistiques et validez leurs événements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schoolName">Nom de l'école *</Label>
              <Input id="schoolName" value={schoolName} maxLength={120} onChange={(e) => setSchoolName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domains">Domaines email de l'école *</Label>
              <Input id="domains" placeholder="ecole.fr, etu.ecole.fr" value={domainsInput} onChange={(e) => setDomainsInput(e.target.value)} required />
              <p className="text-xs text-muted-foreground">
                Les étudiants et organisateurs dont l'email est sur ces domaines seront rattachés automatiquement.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Ton nom (administrateur) *</Label>
              <Input id="fullName" value={fullName} maxLength={160} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email professionnel *</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe *</Label>
              <Input id="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirmer le mot de passe *</Label>
              <Input id="passwordConfirm" type="password" autoComplete="new-password" maxLength={72} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
            </div>

            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor="website">Site web</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer la demande
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              L'équipe Plav' vérifie chaque école avant d'ouvrir son espace.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">Se connecter</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
