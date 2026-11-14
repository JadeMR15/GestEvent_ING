import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolAdminShell } from "@/components/SchoolAdminShell";
import { SchoolThread } from "@/components/SchoolThread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  APPROVAL_BADGE, APPROVAL_LABEL, ASSOCIATION_STATUS_BADGE, db, euro, pct, schoolErrorMessage,
  type ApprovalStatus, type Association, type AssociationStats, type School,
} from "@/lib/schools";
import { isPastEvent } from "@/lib/event-dates";

export const Route = createFileRoute("/school-admin/associations/$associationId")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell title="Association">
        {(school, refresh) => <AssociationDetail school={school} refresh={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Association — Plav'" }] }),
});

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  approval_status: ApprovalStatus;
  capacity: number;
  registrations: { status: string; attended_at: string | null }[];
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  association_id: string | null;
  membership_status: string;
}

function AssociationDetail({ school, refresh }: { school: School; refresh: () => Promise<void> }) {
  const { associationId } = useParams({ from: "/school-admin/associations/$associationId" });
  const [association, setAssociation] = useState<Association | null>(null);
  const [stats, setStats] = useState<AssociationStats | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, st, ev, mem] = await Promise.all([
      db.from("associations").select("*").eq("id", associationId).eq("school_id", school.id).maybeSingle(),
      db.rpc("school_association_stats", { _school_id: school.id }),
      db.from("events")
        .select("id, title, starts_at, status, approval_status, capacity, registrations(status, attended_at)")
        .eq("association_id", associationId)
        .order("starts_at", { ascending: false }),
      db.rpc("school_members", { _school_id: school.id }),
    ]);
    setAssociation(a.data ?? null);
    const row = ((st.data as AssociationStats[] | null) ?? []).find((r) => r.association_id === associationId) ?? null;
    setStats(row ? { ...row, revenue: Number(row.revenue) } : null);
    setEvents(ev.data ?? []);
    setMembers(((mem.data as Member[] | null) ?? []).filter((m) => m.association_id === associationId));
    setLoading(false);
  }, [associationId, school.id]);

  useEffect(() => { load(); }, [load]);

  async function update(patch: Partial<Association>, ok: string) {
    if (!association) return;
    setBusy(true);
    const { error } = await db.from("associations").update(patch).eq("id", association.id);
    setBusy(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    setAssociation({ ...association, ...patch });
    toast.success(ok);
    refresh();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!association) return <p className="py-12 text-center text-muted-foreground">Association introuvable.</p>;

  const badge = ASSOCIATION_STATUS_BADGE[association.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Retour">
            <Link to="/school-admin"><ChevronLeft className="h-5 w-5" /></Link>
          </Button>
          <h2 className="text-2xl font-bold">{association.name}</h2>
          <Badge className={badge.className}>{badge.label}</Badge>
        </div>
        <div className="flex gap-2">
          {association.status !== "active" && (
            <Button size="sm" disabled={busy} onClick={() => update({ status: "active" }, "Association active.")}>
              {association.status === "pending" ? "Valider" : "Réactiver"}
            </Button>
          )}
          {association.status === "active" && (
            <Button size="sm" variant="outline" className="text-red-700" disabled={busy}
              onClick={() => update({ status: "suspended" }, "Association suspendue.")}>Suspendre</Button>
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <Switch checked={association.requires_approval} disabled={busy}
          onCheckedChange={(v) => update({ requires_approval: v }, v ? "Validation activée." : "Publication directe réactivée.")} />
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Valider chaque événement avant publication
        </span>
      </label>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Événements" value={String(stats.events_total)} hint={`${stats.events_upcoming} à venir`} />
          <Stat label="Inscriptions" value={String(stats.registrations)} hint={`Remplissage ${pct(stats.registrations, stats.capacity)}`} />
          <Stat label="Présence" value={pct(stats.attended, stats.registrations)} hint={`${stats.attended} check-in`} />
          <Stat label="Billetterie" value={euro(stats.revenue)} hint={`${stats.members} organisateur${stats.members > 1 ? "s" : ""}`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-lg">Événements</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun événement.</p>}
            {events.map((e) => {
              const regs = e.registrations.filter((r) => r.status === "registered" || r.status === "attended");
              const attended = e.registrations.filter((r) => r.status === "attended" || r.attended_at).length;
              return (
                <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(e.starts_at), "d MMM yyyy, HH:mm", { locale: fr })}
                      {" · "}{regs.length}/{e.capacity} inscrits
                      {isPastEvent(e.starts_at) && ` · ${pct(attended, regs.length)} présents`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {e.status === "draft" && <Badge variant="secondary">Brouillon</Badge>}
                    {e.status === "private" && <Badge variant="outline">Privé</Badge>}
                    {e.approval_status !== "not_required" && (
                      <Badge className={APPROVAL_BADGE[e.approval_status]}>{APPROVAL_LABEL[e.approval_status]}</Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg">Membres</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun organisateur rattaché.</p>}
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.full_name || "Sans nom"}</p>
                  <a href={`mailto:${m.email}`} className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary">
                    <Mail className="h-3 w-3" />{m.email}
                  </a>
                </div>
                {m.membership_status !== "approved" && (
                  <Badge variant="outline" className="shrink-0">{m.membership_status === "pending" ? "À valider" : "Refusé"}</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Messages avec {association.name}</CardTitle></CardHeader>
        <CardContent>
          <SchoolThread associationId={association.id} side="school" schoolName={school.name} associationName={association.name} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
