import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolAdminShell } from "@/components/SchoolAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, CheckCircle2, Loader2, Mail, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db, schoolErrorMessage, type Association, type School } from "@/lib/schools";
import { UserAvatar } from "@/components/UserAvatar";
import { withAvatars } from "@/lib/avatar";

export const Route = createFileRoute("/school-admin/members")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell title="Membres"
        subtitle="Comptes rattachés à votre école. Ceux dont l'email n'est pas sur vos domaines attendent votre accord.">
        {(school, refresh) => <Members school={school} refresh={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Membres — Plav'" }] }),
});

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: "organizer" | "participant";
  association_id: string | null;
  membership_status: "pending" | "approved" | "rejected" | "none";
  verification_status: string;
  created_at: string;
  avatar_path?: string | null;
}

function Members({ school, refresh }: { school: School; refresh: () => Promise<void> }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [assos, setAssos] = useState<Record<string, Association>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "organizer" | "participant">("all");

  const load = useCallback(async () => {
    const [m, a] = await Promise.all([
      db.rpc("school_members", { _school_id: school.id }),
      db.from("associations").select("*").eq("school_id", school.id),
    ]);
    if (m.error) toast.error(schoolErrorMessage(m.error.message));
    setMembers(await withAvatars((m.data as Member[] | null) ?? []));
    setAssos(Object.fromEntries(((a.data as Association[] | null) ?? []).map((x) => [x.id, x])));
    setLoading(false);
  }, [school.id]);

  useEffect(() => { load(); }, [load]);

  async function decide(m: Member, approve: boolean) {
    setBusyId(m.id);
    const { error } = await db.rpc("review_membership", { _profile_id: m.id, _approve: approve });
    setBusyId(null);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success(approve ? `${m.full_name} est rattaché(e) à l'école.` : `Rattachement de ${m.full_name} refusé.`);
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, membership_status: approve ? "approved" : "rejected" } : x)));
    refresh();
  }

  const pending = members.filter((m) => m.membership_status === "pending");
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => m.membership_status !== "pending")
      .filter((m) => roleFilter === "all" || m.role === roleFilter)
      .filter((m) => !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        || (m.association_id && assos[m.association_id]?.name.toLowerCase().includes(q)));
  }, [members, query, roleFilter, assos]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader><CardTitle className="text-lg">À valider ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <MemberInfo m={m} association={m.association_id ? assos[m.association_id]?.name : undefined} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === m.id} onClick={() => decide(m, true)} className="bg-green-700 hover:bg-green-800">
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />Accepter
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => decide(m, false)} className="text-red-700">
                    <XCircle className="mr-1.5 h-4 w-4" />Refuser
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-lg">Tous les membres ({members.length - pending.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nom, email ou association" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="flex rounded-lg bg-muted/50 p-1">
              {([["all", "Tous"], ["organizer", "Organisateurs"], ["participant", "Étudiants"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setRoleFilter(v)}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${roleFilter === v ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {others.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun membre.</p>}
          {others.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <MemberInfo m={m} association={m.association_id ? assos[m.association_id]?.name : undefined} />
              <div className="flex items-center gap-2">
                {m.verification_status === "verified" && (
                  <Badge variant="outline" className="gap-1 text-emerald-700"><BadgeCheck className="h-3 w-3" />Vérifié</Badge>
                )}
                {m.membership_status === "rejected" ? (
                  <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => decide(m, true)}>Accepter</Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => decide(m, false)} className="text-red-700">
                    Retirer
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberInfo({ m, association }: { m: Member; association?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
    <UserAvatar path={m.avatar_path} name={m.full_name} size="md" />
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{m.full_name || "Sans nom"}</p>
        <Badge variant="secondary" className="text-[10px]">{m.role === "organizer" ? "Organisateur" : "Étudiant"}</Badge>
        {association && <Badge variant="outline" className="text-[10px]">{association}</Badge>}
        {m.membership_status === "rejected" && <Badge className="bg-red-100 text-[10px] text-red-800 hover:bg-red-100">Refusé</Badge>}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3" />{m.email}</a>
        <span>inscrit le {format(new Date(m.created_at), "d MMM yyyy", { locale: fr })}</span>
      </p>
    </div>
    </div>
  );
}
