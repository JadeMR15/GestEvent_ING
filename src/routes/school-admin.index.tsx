import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolAdminShell } from "@/components/SchoolAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronRight, Loader2, Plus, ShieldCheck, Ticket, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { db, euro, parseDomains, pct, schoolErrorMessage, ASSOCIATION_STATUS_BADGE as STATUS_BADGE, type Association, type AssociationStats, type School } from "@/lib/schools";

export const Route = createFileRoute("/school-admin/")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell title="Espace école" subtitle="Vos associations, leurs chiffres et vos réglages.">
        {(school, refresh) => <Overview school={school} refresh={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Espace école — Plav'" }] }),
});

function Overview({ school, refresh }: { school: School; refresh: () => Promise<void> }) {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [stats, setStats] = useState<Record<string, AssociationStats>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [{ data: assos }, { data: st, error: stErr }] = await Promise.all([
      db.from("associations").select("*").eq("school_id", school.id).order("name"),
      db.rpc("school_association_stats", { _school_id: school.id }),
    ]);
    if (stErr) toast.error(schoolErrorMessage(stErr.message));
    setAssociations((assos as Association[] | null) ?? []);
    const byId: Record<string, AssociationStats> = {};
    for (const row of (st as AssociationStats[] | null) ?? []) byId[row.association_id] = { ...row, revenue: Number(row.revenue) };
    setStats(byId);
    setLoading(false);
  }, [school.id]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const all = Object.values(stats);
    const sum = (k: keyof AssociationStats) => all.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    return {
      active: associations.filter((a) => a.status === "active").length,
      events: sum("events_total"),
      upcoming: sum("events_upcoming"),
      registrations: sum("registrations"),
      attended: sum("attended"),
      members: sum("members"),
      revenue: sum("revenue"),
    };
  }, [stats, associations]);

  async function update(a: Association, patch: Partial<Association>, ok: string) {
    setBusyId(a.id);
    const { error } = await db.from("associations").update(patch).eq("id", a.id);
    setBusyId(null);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    setAssociations((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    toast.success(ok);
    refresh();
  }

  async function create() {
    const name = newName.trim();
    if (name.length < 2) { toast.error("Nom trop court."); return; }
    setCreating(true);
    const { error } = await db.from("associations").insert({ school_id: school.id, name, status: "active" });
    setCreating(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    setNewName("");
    toast.success(`${name} ajoutée.`);
    load();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  // Les associations à valider d'abord.
  const sorted = [...associations].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={UsersRound} label="Associations actives" value={String(totals.active)} />
        <Kpi icon={CalendarDays} label="Événements à venir" value={String(totals.upcoming)} hint={`${totals.events} au total`} />
        <Kpi icon={Ticket} label="Inscriptions" value={String(totals.registrations)} hint={`Présence ${pct(totals.attended, totals.registrations)}`} />
        <Kpi icon={Users} label="Organisateurs" value={String(totals.members)} hint={`${euro(totals.revenue)} de billetterie`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Associations</CardTitle>
          <div className="flex w-full gap-2 sm:w-auto">
            <Input placeholder="Nouvelle association" value={newName} maxLength={120}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} className="sm:w-56" />
            <Button onClick={create} disabled={creating} size="icon" aria-label="Ajouter">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sorted.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune association pour l'instant. Elles apparaissent quand un organisateur s'inscrit avec votre école, ou ajoutez-les ici.
            </p>
          )}
          {sorted.map((a) => {
            const st = stats[a.id];
            const badge = STATUS_BADGE[a.status];
            return (
              <div key={a.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/school-admin/associations/$associationId" params={{ associationId: a.id }}
                        className="truncate text-base font-semibold hover:underline">{a.name}</Link>
                      <Badge className={badge.className}>{badge.label}</Badge>
                      {st?.events_pending ? <Badge variant="outline">{st.events_pending} à valider</Badge> : null}
                    </div>
                    {st && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {st.events_total} événement{st.events_total > 1 ? "s" : ""} · {st.registrations} inscrit{st.registrations > 1 ? "s" : ""} ·
                        remplissage {pct(st.registrations, st.capacity)} · présence {pct(st.attended, st.registrations)} · {euro(st.revenue)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "pending" && (
                      <Button size="sm" disabled={busyId === a.id} onClick={() => update(a, { status: "active" }, `${a.name} validée.`)}>
                        Valider
                      </Button>
                    )}
                    {a.status === "active" && (
                      <Button size="sm" variant="outline" disabled={busyId === a.id} className="text-red-700"
                        onClick={() => update(a, { status: "suspended" }, `${a.name} suspendue.`)}>
                        Suspendre
                      </Button>
                    )}
                    {a.status === "suspended" && (
                      <Button size="sm" variant="outline" disabled={busyId === a.id}
                        onClick={() => update(a, { status: "active" }, `${a.name} réactivée.`)}>
                        Réactiver
                      </Button>
                    )}
                    <Button asChild size="icon" variant="ghost" aria-label="Détails">
                      <Link to="/school-admin/associations/$associationId" params={{ associationId: a.id }}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <Switch checked={a.requires_approval} disabled={busyId === a.id}
                    onCheckedChange={(v) => update(a, { requires_approval: v },
                      v ? "Les événements de cette association devront être validés." : "Publication directe réactivée.")} />
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Valider chaque événement avant publication
                  </span>
                </label>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SchoolSettings school={school} onSaved={refresh} />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

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
    <Card>
      <CardHeader><CardTitle className="text-lg">Réglages de l'école</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="schoolName">Nom</Label>
          <Input id="schoolName" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schoolDomains">Domaines email</Label>
          <Input id="schoolDomains" value={domains} onChange={(e) => setDomains(e.target.value)} />
          <p className="text-xs text-muted-foreground">Rattachement automatique des comptes sur ces domaines.</p>
        </div>
        <div className="sm:col-span-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
