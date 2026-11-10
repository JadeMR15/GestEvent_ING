import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, User, Mail, KeyRound, AlertTriangle, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AVATAR_ACCEPTED, AVATAR_BUCKET, AVATAR_MAX_INPUT_BYTES, avatarUrl, initials, prepareAvatar,
} from "@/lib/avatar";
import { SchoolEmailForm } from "@/components/SchoolEmailForm";
import { MySchoolBadge } from "@/components/SchoolBadge";

export const Route = createFileRoute("/settings")({
  component: () => (
    <ProtectedLayout>
      <SettingsPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Paramètres — Plav'" }] }),
});

const GENDERS = ["homme", "femme", "autre", "non_renseigne"] as const;

const infoSchema = z.object({
  fullName: z.string().trim().min(2, "Nom requis").max(160),
  school: z.string().trim().max(120),
  association: z.string().trim().max(120),
  birthDate: z.string().refine((v) => {
    if (!v) return true;
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.getFullYear() >= 1900 && d <= new Date();
  }, "Date de naissance invalide"),
  gender: z.union([z.enum(GENDERS), z.literal("")]),
});

const passwordSchema = z.object({
  password: z.string()
    .min(8, "Mot de passe : 8 caractères minimum")
    .max(72, "Mot de passe : 72 caractères maximum")
    .regex(/[a-zA-Z]/, "Mot de passe : au moins une lettre")
    .regex(/[0-9]/, "Mot de passe : au moins un chiffre"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Les mots de passe ne correspondent pas" });

type Info = z.infer<typeof infoSchema>;
const EMPTY_INFO: Info = { fullName: "", school: "", association: "", birthDate: "", gender: "" };

function SettingsPage() {
  const { user, role, verificationStatus, verificationMethod, isVerified, schoolEmail, avatarPath, refreshProfile } = useAuth();
  // Vérifié par email d'école : l'école vient du domaine et ne se modifie pas ici.
  const schoolLocked = isVerified && verificationMethod === "school_email";

  // ── Infos ──
  const [info, setInfo] = useState<Info>(EMPTY_INFO);
  const [saved, setSaved] = useState<Info>(EMPTY_INFO);
  const [savingInfo, setSavingInfo] = useState(false);

  // ── Photo ──
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Email / mot de passe ──
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [pwd, setPwd] = useState({ current: "", password: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let { data, error } = await supabase
        .from("profiles")
        .select("full_name, school, association, birth_date, gender")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        // Colonnes birth_date / gender pas encore créées : on charge le reste.
        ({ data } = await supabase.from("profiles").select("full_name, school, association").eq("id", user.id).maybeSingle() as any);
      }
      const loaded: Info = {
        fullName: data?.full_name ?? "",
        school: data?.school ?? "",
        association: data?.association ?? "",
        birthDate: (data as any)?.birth_date ?? "",
        gender: ((data as any)?.gender ?? "") as Info["gender"],
      };
      setInfo(loaded);
      setSaved(loaded);
    })();
  }, [user]);

  const isOrganizer = role === "organizer" || role === "admin";
  const infoChanged = JSON.stringify(info) !== JSON.stringify(saved);
  // Seule une vérification par justificatif dépend du nom et de l'école saisis.
  const identityChanged = verificationMethod !== "school_email"
    && (info.fullName.trim() !== saved.fullName || info.school.trim() !== saved.school);

  async function saveInfo() {
    if (!user) return;
    const parsed = infoSchema.safeParse(info);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!parsed.data.school && role !== "admin") { toast.error("École requise."); return; }
    if (identityChanged && verificationStatus === "verified" && role !== "admin") {
      const ok = confirm(
        "Ton nom ou ton école change : ton compte devra être vérifié à nouveau avec un justificatif. Continuer ?",
      );
      if (!ok) return;
    }
    setSavingInfo(true);
    const d = parsed.data;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: d.fullName,
        school: d.school,
        association: d.association,
        birth_date: d.birthDate || null,
        gender: d.gender || null,
      })
      .eq("id", user.id);
    setSavingInfo(false);
    if (error) { toast.error("Impossible d'enregistrer tes informations."); return; }
    const clean = { ...d, gender: d.gender };
    setInfo(clean);
    setSaved(clean);
    toast.success("Informations mises à jour.");
    refreshProfile();
  }

  async function uploadAvatar(file: File | undefined) {
    if (!user || !file) return;
    if (!AVATAR_ACCEPTED.includes(file.type)) { toast.error("Format accepté : JPG, PNG ou WebP."); return; }
    if (file.size > AVATAR_MAX_INPUT_BYTES) { toast.error("Image trop lourde (10 Mo maximum)."); return; }
    setUploading(true);
    try {
      const blob = await prepareAvatar(file);
      const path = `${user.id}/${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (upErr) throw new Error("Envoi de la photo impossible. Réessaie.");
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
      if (dbErr) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
        throw new Error("Enregistrement de la photo impossible.");
      }
      if (avatarPath) await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      await refreshProfile();
      toast.success("Photo de profil mise à jour.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!user || !avatarPath) return;
    setUploading(true);
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
    if (!error) await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    setUploading(false);
    if (error) { toast.error("Suppression impossible."); return; }
    await refreshProfile();
    toast.success("Photo supprimée.");
  }

  async function changeEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!z.string().email().max(255).safeParse(email).success) { toast.error("Email invalide."); return; }
    if (email === user?.email) { toast.error("C'est déjà ton email."); return; }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
    setSavingEmail(false);
    if (error) { toast.error("Changement d'email impossible pour le moment."); return; }
    setNewEmail("");
    toast.success("Un email de confirmation a été envoyé. Clique sur le lien pour valider le changement.");
  }

  async function changePassword() {
    if (!user?.email) return;
    if (!pwd.current) { toast.error("Entre ton mot de passe actuel."); return; }
    const parsed = passwordSchema.safeParse({ password: pwd.password, confirm: pwd.confirm });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSavingPwd(true);
    // On vérifie le mot de passe actuel avant d'autoriser le changement.
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwd.current });
    if (authErr) { setSavingPwd(false); toast.error("Mot de passe actuel incorrect."); return; }
    const { error } = await supabase.auth.updateUser({ password: pwd.password });
    setSavingPwd(false);
    if (error) {
      toast.error(error.message.toLowerCase().includes("different")
        ? "Le nouveau mot de passe doit être différent de l'ancien."
        : "Changement de mot de passe impossible.");
      return;
    }
    setPwd({ current: "", password: "", confirm: "" });
    toast.success("Mot de passe modifié.");
  }

  const photo = avatarUrl(avatarPath);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">Ta photo, tes informations et ton compte.</p>
      </div>

      {/* Photo de profil */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" />Photo de profil</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-5">
          <Avatar className="h-24 w-24 border-2 border-accent">
            {photo && <AvatarImage src={photo} alt="Ta photo de profil" className="object-cover" />}
            <AvatarFallback className="bg-secondary text-2xl font-semibold text-secondary-foreground">
              {initials(saved.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            {saved.fullName && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{saved.fullName}</p>
                <MySchoolBadge />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                {photo ? "Changer la photo" : "Ajouter une photo"}
              </Button>
              {photo && (
                <Button variant="ghost" onClick={removeAvatar} disabled={uploading} className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />Supprimer
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. La photo est recadrée en carré.</p>
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => uploadAvatar(e.target.files?.[0])}
            />
          </div>
        </CardContent>
      </Card>

      {/* Informations */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Mes informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">Prénom et nom</Label>
              <Input id="fullName" value={info.fullName} maxLength={160}
                onChange={(e) => setInfo({ ...info, fullName: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="school">École</Label>
              <Input id="school" value={info.school} maxLength={120} disabled={schoolLocked}
                onChange={(e) => setInfo({ ...info, school: e.target.value })} />
              {schoolLocked && (
                <p className="text-xs text-muted-foreground">Déduite de ton adresse d'école {schoolEmail}.</p>
              )}
            </div>
            {isOrganizer && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="association">Association</Label>
                <Input id="association" value={info.association} maxLength={120}
                  onChange={(e) => setInfo({ ...info, association: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="birthDate">Date de naissance</Label>
              <Input id="birthDate" type="date" value={info.birthDate} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setInfo({ ...info, birthDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Genre</Label>
              <Select value={info.gender} onValueChange={(v) => setInfo({ ...info, gender: v as Info["gender"] })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homme">Homme</SelectItem>
                  <SelectItem value="femme">Femme</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                  <SelectItem value="non_renseigne">Préfère ne pas dire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {identityChanged && verificationStatus === "verified" && role !== "admin" && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Modifier ton nom ou ton école annule la vérification de ton compte : il faudra renvoyer un justificatif.
            </div>
          )}

          <Button onClick={saveInfo} disabled={!infoChanged || savingInfo}>
            {savingInfo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
          </Button>
        </CardContent>
      </Card>

      {/* Email */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Adresse email</CardTitle>
          <CardDescription>Actuelle : <strong>{user?.email}</strong></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newEmail">Nouvelle adresse</Label>
            <Input id="newEmail" type="email" autoComplete="email" value={newEmail} maxLength={255}
              onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Le changement n'est pris en compte qu'après avoir cliqué sur le lien reçu par email.</p>
          <Button variant="outline" onClick={changeEmail} disabled={!newEmail.trim() || savingEmail}>
            {savingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Changer d'email
          </Button>
        </CardContent>
      </Card>

      {/* Adresse d'école (en plus de l'adresse perso) */}
      {role !== "admin" && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" />Adresse d'école</CardTitle>
            <CardDescription>
              Confirme ton adresse d'école pour vérifier ton compte et afficher « Fait partie de [ton école] ».
              Tu continues à te connecter avec ton adresse perso.
            </CardDescription>
          </CardHeader>
          <CardContent><SchoolEmailForm /></CardContent>
        </Card>
      )}

      {/* Mot de passe */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Mot de passe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="currentPwd">Mot de passe actuel</Label>
            <Input id="currentPwd" type="password" autoComplete="current-password" value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPwd">Nouveau mot de passe</Label>
              <Input id="newPwd" type="password" autoComplete="new-password" value={pwd.password}
                onChange={(e) => setPwd({ ...pwd, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPwd">Confirmation</Label>
              <Input id="confirmPwd" type="password" autoComplete="new-password" value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
          <Button variant="outline" onClick={changePassword} disabled={savingPwd || !pwd.password}>
            {savingPwd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Changer le mot de passe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
