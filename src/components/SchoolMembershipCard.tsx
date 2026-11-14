import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { AssociationLogoEditor } from "@/components/AssociationLogo";
import { avatarUrl } from "@/lib/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  db, emailMatchesDomains, fetchActiveSchools, fetchSchoolAssociations, schoolErrorMessage,
  type Association, type School,
} from "@/lib/schools";

const NEW_ASSOCIATION = "__new__";

const MEMBERSHIP: Record<string, { label: string; className: string; hint: string }> = {
  approved: { label: "Rattaché", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100", hint: "" },
  pending:  { label: "En attente", className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
              hint: "Ton email n'est pas sur un domaine de l'école : son administration doit valider ton rattachement." },
  rejected: { label: "Refusé", className: "bg-red-100 text-red-800 hover:bg-red-100",
              hint: "L'école a refusé ton rattachement. Choisis une autre école ou contacte-la." },
};

/** Paramètres : rattachement à une école / association, et statut étudiant. */
export function SchoolMembershipCard() {
  const { user, role, isStudent, schoolId, associationId, membershipStatus, verificationStatus, refreshProfile, avatarPath } = useAuth();
  const isOrganizer = role === "organizer";
  const [current, setCurrent] = useState<{ school: string; association: string | null; logo: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [pickSchool, setPickSchool] = useState("");
  const [associations, setAssociations] = useState<Association[]>([]);
  const [pickAssociation, setPickAssociation] = useState("");
  const [newAssociation, setNewAssociation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) { setCurrent(null); return; }
    Promise.all([
      db.from("schools").select("name").eq("id", schoolId).maybeSingle(),
      associationId ? db.from("associations").select("name, logo_path").eq("id", associationId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([s, a]: { data: { name: string; logo_path?: string | null } | null }[]) => {
      setCurrent({ school: s.data?.name ?? "École", association: a.data?.name ?? null, logo: a.data?.logo_path ?? null });
    });
  }, [schoolId, associationId]);

  useEffect(() => {
    if (!editing) return;
    fetchActiveSchools().then((list) => {
      setSchools(list);
      const byEmail = list.find((s) => emailMatchesDomains(user?.email ?? "", s.email_domains));
      setPickSchool(schoolId ?? byEmail?.id ?? "");
    });
  }, [editing, schoolId, user?.email]);

  useEffect(() => {
    setPickAssociation("");
    if (!pickSchool || !isOrganizer) { setAssociations([]); return; }
    fetchSchoolAssociations(pickSchool).then(setAssociations);
  }, [pickSchool, isOrganizer]);

  if (role !== "organizer" && role !== "participant") return null;

  async function toggleStudent(value: boolean) {
    if (!user) return;
    const { error } = await db.from("profiles").update({ is_student: value }).eq("id", user.id);
    if (error) { toast.error("Impossible d'enregistrer."); return; }
    toast.success(value ? "Statut étudiant activé : envoie ton justificatif pour t'inscrire." : "Tu es indiqué(e) comme non étudiant(e).");
    refreshProfile();
  }

  async function join() {
    if (!pickSchool) { toast.error("Choisis ton école."); return; }
    if (isOrganizer && !pickAssociation) { toast.error("Choisis ton association."); return; }
    if (isOrganizer && pickAssociation === NEW_ASSOCIATION && newAssociation.trim().length < 2) {
      toast.error("Nom de l'association trop court."); return;
    }
    if (verificationStatus === "verified" && pickSchool !== schoolId) {
      if (!confirm("Changer d'école annule la vérification de ton compte : il faudra renvoyer un justificatif. Continuer ?")) return;
    }
    setSaving(true);
    const { error } = await db.rpc("join_school", {
      _school_id: pickSchool,
      _association_id: isOrganizer && pickAssociation !== NEW_ASSOCIATION ? pickAssociation : null,
      _new_association: isOrganizer && pickAssociation === NEW_ASSOCIATION ? newAssociation.trim() : null,
    });
    setSaving(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success("Rattachement enregistré.");
    setEditing(false);
    refreshProfile();
  }

  const showSchool = isOrganizer || isStudent;
  const selected = schools.find((s) => s.id === pickSchool);
  const status = MEMBERSHIP[membershipStatus];
  // Organisateur validé par l'école : association définitive (l'école peut retirer le rattachement).
  const locked = isOrganizer && !!associationId && membershipStatus === "approved";
  const hint = isOrganizer && membershipStatus === "pending"
    ? "Ton école doit valider ton association. Tu pourras ensuite créer des événements en son nom."
    : status?.hint;

  return (
    <Card className="border-2 shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Mon école</CardTitle>
        <CardDescription>
          {isOrganizer
            ? "Ton association et ton école. L'école peut valider tes événements avant leur publication."
            : "Ton école donne accès à ses événements réservés."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {role === "participant" && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Je suis étudiant(e)</p>
              <p className="text-xs text-muted-foreground">
                Non étudiant : pas de justificatif, mais pas d'accès aux événements réservés à une école.
              </p>
            </div>
            <Switch checked={isStudent} onCheckedChange={toggleStudent} />
          </label>
        )}

        {showSchool && !editing && (
          current ? (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3">
              {isOrganizer && associationId && current.association && membershipStatus === "approved" && (
                <AssociationLogoEditor associationId={associationId} name={current.association} path={current.logo} size="md"
                  fallbackSrc={avatarUrl(avatarPath)}
                  onChange={(logo) => setCurrent({ ...current, logo })} />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{current.school}</p>
                {isOrganizer && <p className="text-sm text-muted-foreground">{current.association ?? "Aucune association"}</p>}
                {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                {locked && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />Validée par ton école : tous tes événements sont publiés au nom de cette association. Pour en changer, <Link to="/messages" className="underline">écris à ton école</Link>.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {status && <Badge className={status.className}>{status.label}</Badge>}
                {!locked && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Changer</Button>}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
              <p className="text-sm text-muted-foreground">Ton compte n'est rattaché à aucune école inscrite sur Plav'.</p>
              <Button size="sm" onClick={() => setEditing(true)}>Choisir mon école</Button>
            </div>
          )
        )}

        {showSchool && editing && (
          <div className="space-y-3 rounded-xl border px-4 py-4">
            {schools.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune école n'est encore inscrite sur Plav'.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>École</Label>
                  <Select value={pickSchool} onValueChange={setPickSchool}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selected && (
                    <p className="text-xs text-muted-foreground">
                      {emailMatchesDomains(user?.email ?? "", selected.email_domains)
                        ? "Ton email est reconnu : rattachement immédiat."
                        : "Ton email n'est pas sur un domaine de l'école : elle validera ton rattachement."}
                    </p>
                  )}
                </div>
                {isOrganizer && pickSchool && (
                  <div className="space-y-2">
                    <Label>Association</Label>
                    <Select value={pickAssociation} onValueChange={setPickAssociation}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        {associations.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        <SelectItem value={NEW_ASSOCIATION}>+ Nouvelle association</SelectItem>
                      </SelectContent>
                    </Select>
                    {pickAssociation === NEW_ASSOCIATION && (
                      <Input placeholder="Nom de l'association" maxLength={120} value={newAssociation}
                        onChange={(e) => setNewAssociation(e.target.value)} />
                    )}
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button onClick={join} disabled={saving || schools.length === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
