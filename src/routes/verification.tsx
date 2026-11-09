import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type VerificationStatus } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BadgeCheck, Clock, FileUp, Loader2, ShieldAlert, XCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/verification")({
  component: () => (
    <ProtectedLayout allow={["participant", "organizer", "admin"]}>
      <VerificationPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Vérifier mon compte — Plav'" }] }),
});

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

const STATUS_UI: Record<VerificationStatus, { label: string; icon: typeof BadgeCheck; className: string }> = {
  unverified: { label: "Compte non vérifié",   icon: ShieldAlert, className: "bg-amber-50 text-amber-800 border-amber-200" },
  pending:    { label: "Vérification en cours", icon: Clock,       className: "bg-blue-50 text-blue-800 border-blue-200" },
  review:     { label: "En attente d'un admin", icon: Clock,       className: "bg-blue-50 text-blue-800 border-blue-200" },
  verified:   { label: "Compte vérifié",        icon: BadgeCheck,  className: "bg-green-50 text-green-800 border-green-200" },
  rejected:   { label: "Justificatif refusé",   icon: XCircle,     className: "bg-red-50 text-red-800 border-red-200" },
};

const CHECK_LABELS: Record<string, string> = {
  documentType: "Type de document",
  school: "École",
  name: "Nom et prénom",
  academicYear: "Année scolaire",
};

type Checks = Record<string, { ok: boolean; detail: string }>;

function VerificationPage() {
  const { user, session, verificationStatus, verificationNote, refreshVerification } = useAuth();
  const [fullName, setFullName] = useState("");
  const [school, setSchool]     = useState("");
  const [savedProfile, setSavedProfile] = useState({ fullName: "", school: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [consent, setConsent]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [checks, setChecks]     = useState<Checks | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, school, verification_checks")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFullName(data.full_name);
        setSchool(data.school ?? "");
        setSavedProfile({ fullName: data.full_name, school: data.school ?? "" });
        setChecks((data.verification_checks as Checks | null) ?? null);
      });
  }, [user]);

  const status = verificationStatus ?? "unverified";
  const ui = STATUS_UI[status];
  const profileChanged = fullName.trim() !== savedProfile.fullName || school.trim() !== savedProfile.school;
  const canSend = status !== "verified" && status !== "pending";

  async function saveProfile() {
    if (!user) return;
    if (!fullName.trim() || !school.trim()) { toast.error("Nom et école requis."); return; }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim().slice(0, 160), school: school.trim().slice(0, 120) })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) { toast.error("Impossible d'enregistrer le profil."); return; }
    setSavedProfile({ fullName: fullName.trim(), school: school.trim() });
    toast.success("Profil mis à jour.");
    refreshVerification();
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) { toast.error("Format accepté : PDF, JPG, PNG ou WebP."); return; }
    if (f.size > MAX_BYTES) { toast.error("Fichier trop lourd (10 Mo maximum)."); return; }
    setFile(f);
  }

  async function send() {
    if (!user || !session || !file) return;
    if (profileChanged) { toast.error("Enregistre d'abord ton nom et ton école."); return; }
    if (!consent) { toast.error("Coche la case de consentement."); return; }
    setSending(true);
    try {
      const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("student-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("Envoi du fichier impossible. Réessaie.");

      const res = await fetch("/api/verify-student", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ path }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "La vérification a échoué. Réessaie plus tard.");

      setChecks(body.checks ?? null);
      setFile(null);
      if (body.status === "verified") toast.success(body.message);
      else if (body.status === "review") toast.info(body.message);
      else toast.error(body.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSending(false);
      refreshVerification();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vérifier mon compte</h1>
        <p className="text-muted-foreground">
          Plav' est réservé aux étudiants. Envoie ton certificat de scolarité ou ta carte étudiante
          de cette année pour pouvoir t'inscrire aux événements et en créer.
        </p>
      </div>

      <div className={`flex items-start gap-3 rounded-xl border p-4 ${ui.className}`}>
        <ui.icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">{ui.label}</p>
          {verificationNote && status !== "unverified" && <p className="text-sm">{verificationNote}</p>}
          {status === "verified" && (
            <Link to="/events" className="text-sm font-medium underline">Voir les événements</Link>
          )}
        </div>
      </div>

      {checks && status !== "verified" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Détail de la dernière vérification</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(checks).map(([key, c]) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                {c.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                <span><strong>{CHECK_LABELS[key] ?? key} :</strong> {c.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canSend && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Tes informations</CardTitle>
              <CardDescription>Elles doivent être écrites comme sur ton justificatif.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="fullName">Prénom et nom</Label>
                <Input id="fullName" maxLength={160} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school">École</Label>
                <Input id="school" maxLength={120} value={school} onChange={(e) => setSchool(e.target.value)} />
              </div>
              {profileChanged && (
                <Button variant="outline" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Ton justificatif</CardTitle>
              <CardDescription>
                Certificat de scolarité (le PDF de ton école est l'idéal) ou photo nette de ta carte étudiante.
                PDF, JPG, PNG ou WebP, 10 Mo maximum.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40"
              >
                <FileUp className="h-8 w-8" />
                {file ? <span className="font-medium text-foreground">{file.name}</span> : "Clique ou dépose ton fichier ici"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              />

              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>
                  J'accepte que Plav' lise ce document uniquement pour vérifier mon statut étudiant.
                  Il est supprimé dès la fin de la vérification.
                </span>
              </label>

              <Button onClick={send} disabled={!file || !consent || sending} className="w-full bg-gradient-primary">
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {sending ? "Lecture du document…" : "Envoyer et vérifier"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
