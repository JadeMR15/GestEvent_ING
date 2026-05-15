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

const schema = z.object({
  nom:         z.string().trim().min(1, "Nom requis").max(80),
  prenom:      z.string().trim().min(1, "Prénom requis").max(80),
  email:       z.string().trim().email("Email invalide").max(255),
  birthDate:   z.string().min(1, "Date de naissance requise"),
  gender:      z.string().min(1, "Genre requis"),
  school:      z.string().trim().min(1, "École requise").max(120),
  association: z.string().trim().max(120).optional(),
  password:    z.string().min(6, "Minimum 6 caractères").max(72),
  role:        z.enum(["participant", "organizer"]),
});

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
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse({ nom, prenom, email, birthDate, gender, school, association: association || undefined, password, role });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const fullName = `${parsed.data.prenom} ${parsed.data.nom}`;
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
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
    if (error) { toast.error(error.message); return; }
    toast.success("Compte créé ! Bienvenue sur Plav' !");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
      <Card className="w-full max-w-md shadow-elegant border-[0.5px]">
        <CardHeader className="text-center">
          <img src="/logo2.png" alt="Plav'" className="mx-auto mb-3 h-44 w-auto object-contain" />
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
                  { value: "participant", label: "Participant",  desc: "Je m'inscris aux événements", icon: Ticket,      bg: "#EED4D8", border: "#C87488", text: "#6B0F2C" },
                  { value: "organizer",  label: "Organisateur", desc: "Je crée des événements",      icon: CalendarDays, bg: "#D5E8A0", border: "#0F7A4B", text: "#073D25" },
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
            <div className="grid grid-cols-2 gap-3">
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {/* Date de naissance + Genre */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Date de naissance *</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
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
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
