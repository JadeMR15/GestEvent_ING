import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolAdminShell } from "@/components/SchoolAdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db, parseDomains, schoolErrorMessage, type School } from "@/lib/schools";

export const Route = createFileRoute("/school-admin/settings")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell title="Réglages" subtitle="Identité de l'école et rattachement automatique des comptes.">
        {(school, refresh) => <SchoolSettings key={school.id} school={school} onSaved={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Réglages de l'école — Plav'" }] }),
});

function SchoolSettings({ school, onSaved }: { school: School; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(school.name);
  const [domains, setDomains] = useState(school.email_domains.join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseDomains(domains);
    if (parsed.error) { toast.error(parsed.error); return; }
    if (name.trim().length < 2) { toast.error("Nom trop court."); return; }
    setSaving(true);
    const { error } = await db.from("schools").update({ name: name.trim(), email_domains: parsed.domains }).eq("id", school.id);
    setSaving(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success("École mise à jour.");
    onSaved();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Informations de l'école</CardTitle>
        <CardDescription>Le nom apparaît sur les événements et les profils des membres.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="schoolName">Nom de l'école</Label>
          <Input id="schoolName" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schoolDomains">Domaines email</Label>
          <Input id="schoolDomains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="ecole.fr, etu.ecole.fr" />
          <p className="text-xs text-muted-foreground">
            Les comptes dont l'email est sur un de ces domaines sont rattachés automatiquement à l'école. Séparez-les par des virgules.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}
