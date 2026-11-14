import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CalendarDays, Ticket, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { OAuthButtons } from "@/components/OAuthButtons";
import { Switch } from "@/components/ui/switch";
import { emailMatchesDomains, fetchActiveSchools, fetchSchoolAssociations, type Association, type School } from "@/lib/schools";

const OTHER_SCHOOL = "__other__";
const NEW_ASSOCIATION = "__new__";

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
  school:      z.string().trim().max(120),
  isStudent:   z.boolean(),
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
  .refine((d) => !(d.role === "organizer" || d.isStudent) || !!d.school, { message: "École requise" })
  .refine((d) => d.role !== "organizer" || !!d.association, { message: "Association requise" });

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
  const [isStudent, setIsStudent]     = useState(true);
  const [schools, setSchools]         = useState<School[]>([]);
  const [schoolId, setSchoolId]       = useState("");
  const [associations, setAssociations] = useState<Association[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [password, setPassword]       = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [website, setWebsite]         = useState(""); // piège à robots, invisible pour les humains
  const [loading, setLoading]         = useState(false);

  // Écoles inscrites sur Plav' (vide tant qu'aucune n'est validée : on garde la saisie libre).
  useEffect(() => { fetchActiveSchools().then(setSchools); }, []);

  const selectedSchool = schools.find((s) => s.id === schoolId) ?? null;
  const needsSchool = role === "organizer" || isStudent;
  const domainMatch = !!selectedSchool && emailMatchesDomains(email, selectedSchool.email_domains);

  // Email sur le domaine d'une école : on la présélectionne.
  const schoolFromEmail = useMemo(
    () => schools.find((s) => emailMatchesDomains(email, s.email_domains)) ?? null,
    [schools, email],
  );
  useEffect(() => {
    if (schoolFromEmail && !schoolId) setSchoolId(schoolFromEmail.id);
  }, [schoolFromEmail, schoolId]);

  // Associations de l'école choisie (organisateurs).
  useEffect(() => {
    setAssociationId("");
    if (!selectedSchool || role !== "organizer") { setAssociations([]); return; }
    fetchSchoolAssociations(selectedSchool.id).then(setAssociations);
  }, [selectedSchool, role]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (loading) return;
    // Un humain ne voit pas ce champ : s'il est rempli, c'est un robot. On fait semblant que tout va bien.
    if (website) { toast.success("Compte créé ! Vérifie ta boîte mail."); return; }
    const listedSchool = needsSchool && selectedSchool ? selectedSchool : null;
    const listedAssociation = role === "organizer" && listedSchool
      ? associations.find((a) => a.id === associationId) ?? null
      : null;
    if (role === "organizer" && listedSchool && !associationId) { toast.error("Choisis ton association."); return; }
    const parsed = schema.safeParse({
      nom, prenom, email, birthDate, gender,
      isStudent: role === "organizer" ? true : isStudent,
      school: !needsSchool ? "" : listedSchool ? listedSchool.name : school,
      association: role !== "organizer" ? undefined : listedAssociation ? listedAssociation.name : association || undefined,
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
          account_type: parsed.data.role,
          is_student:  parsed.data.isStudent ? "true" : "false",
          school_id:   listedSchool?.id ?? "",
          association_id: listedAssociation?.id ?? "",
          new_association: role === "organizer" && listedSchool && !listedAssociation ? parsed.data.association ?? "" : "",
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
    if (!parsed.data.isStudent) {
      toast.success("Compte créé ! Bienvenue sur Plav'.");
      navigate({ to: "/events" });
      return;
    }
    toast.success("Compte créé ! Dernière étape : vérifie ton statut étudiant.");
    navigate({ to: "/verification" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-mesh p-4 pt-safe pb-safe">
      <Link to="/" aria-label="Retour" className="tap absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-full border bg-card/80 text-primary backdrop-blur md:hidden">
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <Card className="w-full max-w-md rounded-3xl shadow-elegant border-[0.5px] max-md:border-0 max-md:bg-transparent max-md:shadow-none">
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

            {role === "participant" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
                <div>
                  <Label htmlFor="isStudent" className="cursor-pointer">Je suis étudiant(e)</Label>
                  <p className="text-xs text-muted-foreground">
                    {isStudent
                      ? "Un justificatif te sera demandé : il donne accès aux événements réservés à ton école."
                      : "Pas de justificatif : tu peux t'inscrire aux événements ouverts à tous."}
                  </p>
                </div>
                <Switch id="isStudent" checked={isStudent} onCheckedChange={setIsStudent} />
              </div>
            )}

            {needsSchool && (
              <div className="space-y-2">
                <Label>École *</Label>
                {schools.length > 0 && (
                  <Select value={schoolId} onValueChange={setSchoolId}>
                    <SelectTrigger><SelectValue placeholder="Choisir mon école" /></SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      <SelectItem value={OTHER_SCHOOL}>Mon école n'est pas encore sur Plav'</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(schools.length === 0 || schoolId === OTHER_SCHOOL) && (
                  <Input id="school" placeholder="Nom de l'école" value={school} onChange={(e) => setSchool(e.target.value)} required />
                )}
                {selectedSchool && email.includes("@") && (
                  <p className={`text-xs ${domainMatch ? "text-success" : "text-muted-foreground"}`}>
                    {domainMatch
                      ? "Ton email est reconnu : tu seras rattaché(e) automatiquement à l'école."
                      : `Ton email n'est pas sur un domaine de l'école (${selectedSchool.email_domains.map((d) => "@" + d).join(", ")}) : l'école validera ton rattachement.`}
                  </p>
                )}
              </div>
            )}

            {role === "organizer" && (
              <div className="space-y-2">
                <Label htmlFor="association">Association *</Label>
                {selectedSchool && (
                  <Select value={associationId} onValueChange={setAssociationId}>
                    <SelectTrigger><SelectValue placeholder="Choisir mon association" /></SelectTrigger>
                    <SelectContent>
                      {associations.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      <SelectItem value={NEW_ASSOCIATION}>+ Nouvelle association</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(!selectedSchool || associationId === NEW_ASSOCIATION) && (
                  <Input id="association" placeholder="Nom de l'association" value={association} onChange={(e) => setAssociation(e.target.value)} required />
                )}
                {selectedSchool && associationId === NEW_ASSOCIATION && (
                  <p className="text-xs text-muted-foreground">L'école validera la nouvelle association avant ton premier événement.</p>
                )}
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
          <div className="mt-4"><OAuthButtons /></div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Tu représentes une école ?{" "}
            <Link to="/register-school" className="font-medium text-primary hover:underline">Inscrire mon école</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
