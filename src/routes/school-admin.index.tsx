import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Monogram, SchoolAdminShell } from "@/components/SchoolAdminShell";
import { associationImage, useAssociationFallbacks } from "@/components/AssociationLogo";
import { useNotifications } from "@/lib/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowRight, MessageSquare, CalendarDays, Euro, Loader2, Plus, Search, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { db, euro, pct, schoolErrorMessage, ASSOCIATION_STATUS_BADGE as STATUS_BADGE, type Association, type AssociationStats, type School } from "@/lib/schools";

export const Route = createFileRoute("/school-admin/")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell>
        {(school, refresh) => <Overview school={school} refresh={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Espace école — Plav'" }] }),
});

type Filter = "all" | Association["status"];
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "pending", label: "À valider" },
  { value: "active", label: "Actives" },
  { value: "suspended", label: "Suspendues" },
];

function Overview({ school, refresh }: { school: School; refresh: () => Promise<void> }) {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [stats, setStats] = useState<Record<string, AssociationStats>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const fallbacks = useAssociationFallbacks(associations.map((a) => a.id));
  const unread = useNotifications().school_messages_by_association ?? {};

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
      pendingEvents: sum("events_pending"),
      registrations: sum("registrations"),
      attended: sum("attended"),
      capacity: sum("capacity"),
      revenue: sum("revenue"),
    };
  }, [stats, associations]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: associations.length, pending: 0, active: 0, suspended: 0 };
    for (const a of associations) c[a.status]++;
    return c;
  }, [associations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return associations
      .filter((a) => (filter === "all" || a.status === filter) && (!q || a.name.toLowerCase().includes(q)))
      // À valider d'abord, puis par nombre d'événements à venir.
      .sort((a, b) =>
        Number(b.status === "pending") - Number(a.status === "pending")
        || (stats[b.id]?.events_upcoming ?? 0) - (stats[a.id]?.events_upcoming ?? 0)
        || a.name.localeCompare(b.name, "fr"));
  }, [associations, stats, query, filter]);

  async function update(a: Association, patch: Partial<Association>, ok: string) {
    setBusyId(a.id);
    const { error } = await db.from("associations").update(patch).eq("id", a.id);
    setBusyId(null);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    setAssociations((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    toast.success(ok);
    refresh();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8">
      {/* Indicateurs clés */}
      <Card className="overflow-hidden">
        <CardContent className="grid grid-cols-2 p-0 lg:grid-cols-4 [&>*]:border-border max-lg:[&>*:nth-child(odd)]:border-r max-lg:[&>*:nth-child(-n+2)]:border-b lg:[&>*:not(:last-child)]:border-r">
          <Kpi icon={UsersRound} label="Associations actives" value={String(totals.active)}
            hint={counts.pending ? `${counts.pending} en attente de validation` : `${associations.length} au total`} />
          <Kpi icon={CalendarDays} label="Événements à venir" value={String(totals.upcoming)}
            hint={totals.pendingEvents ? `${totals.pendingEvents} à valider` : `${totals.events} depuis le début`} />
          <Kpi icon={Ticket} label="Inscriptions" value={String(totals.registrations)}
            hint={`Remplissage ${pct(totals.registrations, totals.capacity)} · présence ${pct(totals.attended, totals.registrations)}`} />
          <Kpi icon={Euro} label="Billetterie" value={euro(totals.revenue)} hint="Toutes associations confondues" />
        </CardContent>
      </Card>

      {totals.pendingEvents > 0 && (
        <Link to="/school-admin/reviews"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100">
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {totals.pendingEvents} événement{totals.pendingEvents > 1 ? "s attendent" : " attend"} votre validation
          </span>
          <span className="flex items-center gap-1 font-semibold">Traiter <ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}

      {/* Associations */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Associations</h2>
            <p className="text-sm text-muted-foreground">
              Les fiches de chaque association de {school.name} : activité, chiffres et règles de publication.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Nouvelle association</Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" onClick={() => setFilter(f.value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {f.label}
                <span className={`text-xs ${filter === f.value ? "opacity-80" : "opacity-60"}`}>{counts[f.value]}</span>
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une association" className="pl-9" />
          </div>
        </div>

        {visible.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {associations.length === 0
                ? "Aucune association pour l'instant. Elles apparaissent quand un organisateur s'inscrit avec votre école, ou ajoutez-les vous-même."
                : "Aucune association ne correspond à ces critères."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((a) => (
              <AssociationCard key={a.id} association={a} stats={stats[a.id]} busy={busyId === a.id} onUpdate={update}
                fallbackLogo={fallbacks[a.id]} unread={unread[a.id] ?? 0} />
            ))}
          </div>
        )}
      </section>

      <AddAssociationDialog open={adding} onOpenChange={setAdding} school={school} onCreated={() => { load(); refresh(); }} />
    </div>
  );
}

function AssociationCard({ association: a, stats: st, busy, onUpdate, fallbackLogo, unread }: {
  association: Association;
  fallbackLogo?: string;
  unread: number;
  stats: AssociationStats | undefined;
  busy: boolean;
  onUpdate: (a: Association, patch: Partial<Association>, ok: string) => void;
}) {
  const badge = STATUS_BADGE[a.status];
  const metrics = [
    { label: "Événements", value: String(st?.events_total ?? 0), hint: `${st?.events_upcoming ?? 0} à venir` },
    { label: "Inscrits", value: String(st?.registrations ?? 0), hint: `${pct(st?.registrations ?? 0, st?.capacity ?? 0)} remplis` },
    { label: "Présence", value: pct(st?.attended ?? 0, st?.registrations ?? 0), hint: `${st?.attended ?? 0} check-in` },
    { label: "Billetterie", value: euro(st?.revenue ?? 0), hint: `${st?.members ?? 0} organisateur${(st?.members ?? 0) > 1 ? "s" : ""}` },
  ];

  return (
    <Card className={`flex flex-col transition-shadow hover:shadow-md ${a.status === "pending" ? "border-amber-300 ring-1 ring-amber-200" : ""} ${a.status === "suspended" ? "opacity-75" : ""}`}>
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Monogram name={a.name} src={associationImage(a.logo_path, fallbackLogo)} />
          <div className="min-w-0 flex-1">
            <Link to="/school-admin/associations/$associationId" params={{ associationId: a.id }}
              className="line-clamp-2 text-base font-semibold leading-snug hover:text-primary hover:underline">{a.name}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge className={badge.className}>{badge.label}</Badge>
              {a.created_at && (
                <span className="text-xs text-muted-foreground">depuis {format(new Date(a.created_at), "MMM yyyy", { locale: fr })}</span>
              )}
            </div>
          </div>
        </div>

        {a.description
          ? <p className="line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
          : null}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
          {metrics.map((m) => (
            <div key={m.label} className="bg-card px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{m.label}</dt>
              <dd className="text-lg font-bold leading-tight">{m.value}</dd>
              <dd className="text-[11px] text-muted-foreground">{m.hint}</dd>
            </div>
          ))}
        </dl>

        {unread > 0 && (
          <Link to="/school-admin/messages" search={{ a: a.id }}
            className="flex items-center gap-2 rounded-lg bg-jaune-100 px-3 py-2 text-xs font-semibold text-bordeaux-800 hover:bg-jaune-200">
            <MessageSquare className="h-3.5 w-3.5" />
            {unread} nouveau{unread > 1 ? "x" : ""} message{unread > 1 ? "s" : ""}
          </Link>
        )}

        {st?.events_pending ? (
          <Link to="/school-admin/reviews" className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" />
            {st.events_pending} événement{st.events_pending > 1 ? "s" : ""} à valider
          </Link>
        ) : null}

        <label className="mt-auto flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />Valider les événements avant publication
          </span>
          <Switch checked={a.requires_approval} disabled={busy}
            onCheckedChange={(v) => onUpdate(a, { requires_approval: v },
              v ? `Les événements de ${a.name} devront être validés.` : `${a.name} publie à nouveau directement.`)} />
        </label>
      </CardContent>

      <div className="flex items-center gap-2 border-t px-5 py-3">
        {a.status === "pending" && (
          <Button size="sm" disabled={busy} onClick={() => onUpdate(a, { status: "active" }, `${a.name} validée.`)}>Valider</Button>
        )}
        {a.status === "active" && (
          <Button size="sm" variant="ghost" disabled={busy} className="text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => onUpdate(a, { status: "suspended" }, `${a.name} suspendue.`)}>Suspendre</Button>
        )}
        {a.status === "suspended" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onUpdate(a, { status: "active" }, `${a.name} réactivée.`)}>Réactiver</Button>
        )}
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <Link to="/school-admin/associations/$associationId" params={{ associationId: a.id }}>
            Ouvrir la fiche<ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function AddAssociationDialog({ open, onOpenChange, school, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  school: School;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    const n = name.trim();
    if (n.length < 2) { toast.error("Nom trop court."); return; }
    setSaving(true);
    const { error } = await db.from("associations")
      .insert({ school_id: school.id, name: n, description: description.trim(), status: "active" });
    setSaving(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success(`${n} ajoutée.`);
    setName("");
    setDescription("");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle association</DialogTitle>
          <DialogDescription>Elle sera active tout de suite ; ses organisateurs pourront la choisir à l'inscription.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assoName">Nom *</Label>
            <Input id="assoName" value={name} maxLength={120} autoFocus
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assoDesc">Description</Label>
            <Input id="assoDesc" value={description} maxLength={300} placeholder="BDE, BDS, association culturelle…"
              onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={create} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof UsersRound; label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 md:p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />{label}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
