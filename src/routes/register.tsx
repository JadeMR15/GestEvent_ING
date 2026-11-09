import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CalendarDays, Ticket } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({ meta: [{ title: "Créer un compte — Plav'" }] }),
});

const GENDERS = ["homme", "femme", "autre", "non_renseigne"] as const;

const schema = z.object({
  nom:         z.string().trim().min(1, "Nom requis").max(80),
  prenom:      z.string().trim().min(1, "Prénom requis").max(80),
  email:       z.string().trim().toLowerCase().email("Email invalide").max(255),
  birthDate:   z.string().min(1, "Date de naissance requise").refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.getFullYear() >= 1900 && d <= new Date();
  }, "Date de naissance invalide"),
  gender:      z.enum(GENDERS, { message: "Genre requis" }),
  school:      z.string().trim().min(1, "École requise").max(120),
  association: z.string().trim().max(120).optional(),
  password:    z.string()
    .min(8, "Mot de passe : 8 caractères minimum")
    .max(72, "Mot de passe : 72 caractères maximum")
    .regex(/[a-zA-Z]/, "Mot de passe : au moins une lettre")
    .regex(/[0-9]/, "Mot de passe : au moins un chiffre"),
  passwordConfirm: z.string(),
  role:        z.enum(["participant", "organizer"]),
})
  .refine((d) => d.password === d.passwordConfirm, { message: "Les mots de passe ne correspondent pas" })
  .refine((d) => {
    const local = d.email.split("@")[0];
    return local.length < 4 || !d.password.toLowerCase().includes(local);
  }, {
    message: "Le mot de passe ne doit pas contenir ton email",
  })
  .refine((d) => d.role !== "organizer" || !!d.association, { message: "Nom de l'association requis" });

// Traduit les erreurs Supabase sans en dire trop (pas de confirmation qu'un email existe déjà).
function signUpErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (m.includes("password")) return "Mot de passe trop faible ou déjà exposé dans une fuite de données. Choisis-en un autre.";
  if (m.includes("captcha")) return "Vérification anti-robot échouée. Recharge la page.";
  return "Impossible de créer le compte. Vérifie tes informations et réessaie.";
}

function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole]               = useState<"participant" | "organizer">("participant");
  const [nom, setNom]                 = useState("");
  const [prenom, setPrenom]           = useState("");
  const [email, setEmail]             = useState("");
  const [birthDate, setBirthDate]     = useState("");
  const [gender, setGender]           = useState("");
  const [school, setSchool]           = useState("");
  const [association, setAssociation] = useState("");
  const [password, setPassword]       = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [website, setWebsite]         = useState(""); // piège à robots, invisible pour les humains
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (loading) return;
    // Un humain ne voit pas ce champ : s'il est rempli, c'est un robot. On fait semblant que tout va bien.
    if (website) { toast.success("Compte créé ! Vérifie ta boîte mail."); return; }
    const parsed = schema.safeParse({
      nom, prenom, email, birthDate, gender, school,
      association: role === "organizer" ? association || undefined : undefined,
      password, passwordConfirm, role,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const fullName = `${parsed.data.prenom} ${parsed.data.nom}`;
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/verification`,
        data: {
          full_name:   fullName,
          role:        parsed.data.role,
          birth_date:  parsed.data.birthDate,
          gender:      parsed.data.gender,
          school:      parsed.data.school,
          association: parsed.data.association ?? "",
        },
      },
    });
    setLoading(false);
    if (error) { toast.error(signUpErrorMessage(error.message)); return; }
    setPassword("");
    setPasswordConfirm("");
    // Si la confirmation d'email est activée dans Supabase, il n'y a pas encore de session.
    if (!data.session) {
      toast.success("Compte créé ! Clique sur le lien reçu par email pour l'activer.");
      navigate({ to: "/login" });
      return;
    }
    toast.success("Compte créé ! Dernière étape : vérifie ton statut étudiant.");
    navigate({ to: "/verification" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
      <Card className="w-full max-w-md shadow-elegant border-[0.5px]">
        <CardHeader className="text-center">
          <img src="/plav-cocotte.svg" alt="Plav'" className="mx-auto mb-3 h-20 w-20 sm:h-28 sm:w-28 object-contain plav-spin-in" />
          <CardTitle className="text-2xl">Créer un compte</CardTitle>
          <CardDescription>Rejoins Plav' en quelques secondes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Choix du rôle */}
            <div className="space-y-2">
              <Label>Je suis</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: "participant", label: "Participant",  desc: "Je m'inscris aux événements", icon: Ticket,      bg: "#F8E7B5", border: "#6B1A2F", text: "#6B1A2F" },
                  { value: "organizer",  label: "Organisateur", desc: "Je crée des événements",      icon: CalendarDays, bg: "#F3D27A", border: "#C9931A", text: "#4A0F20" },
                ] as const).map((opt) => {
                  const selected = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      style={{
                        border: `2px solid ${selected ? opt.border : "#E5E7EB"}`,
                        borderRadius: 12,
                        background: selected ? opt.bg : "#FFFFFF",
                        padding: "1rem",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                        outline: "none",
                      }}
                    >
                      <opt.icon style={{ width: 22, height: 22, color: selected ? opt.text : "#9CA3AF", marginBottom: "0.5rem" }} strokeWidth={1.5} />
                      <p style={{ fontWeight: 600, fontSize: "0.875rem", color: selected ? opt.text : "#374151" }}>{opt.label}</p>
                      <p style={{ fontSize: "0.75rem", color: selected ? opt.text + "aa" : "#9CA3AF", marginTop: "0.2rem", lineHeight: 1.4 }}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nom / Prénom */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom *</Label>
                <Input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" autoComplete="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {/* Date de naissance + Genre */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Date de naissance *</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="birthDate" type="date" className="pl-9" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthDate(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Genre *</Label>
                <Select value={gender} onValueChange={setGender} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homme">Homme</SelectItem>
                    <SelectItem value="femme">Femme</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                    <SelectItem value="non_renseigne">Préfère ne pas dire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="school">École *</Label>
              <Input id="school" value={school} onChange={(e) => setSchool(e.target.value)} required />
            </div>

            {role === "organizer" && (
              <div className="space-y-2">
                <Label htmlFor="association">Nom de l'association *</Label>
                <Input id="association" value={association} onChange={(e) => setAssociation(e.target.value)} required />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe *</Label>
              <Input id="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirmer le mot de passe *</Label>
              <Input id="passwordConfirm" type="password" autoComplete="new-password" maxLength={72} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
            </div>

            {/* Champ piège anti-robot : caché aux humains et aux lecteurs d'écran */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor="website">Site web</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer mon compte
            </Button>
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
