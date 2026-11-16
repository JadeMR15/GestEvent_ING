import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Ban, BadgeCheck, Loader2, LockOpen, Search, Users } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { avatarUrl, initials } from "@/lib/avatar";
import { ASSIGNABLE_ROLES, ROLE_LABEL, listUsers, setUserBlocked, setUserRole, type AdminUser, type UserRole } from "@/lib/admin";

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "participant", label: "Participants" },
  { value: "organizer", label: "Organisateurs" },
  { value: "volunteer", label: "Bénévoles" },
  { value: "school_admin", label: "Comptes école" },
  { value: "admin", label: "Admins" },
  { value: "blocked", label: "Bloqués" },
] as const;

const PAGE = 30;

export const Route = createFileRoute("/admin/users")({
  validateSearch: (s: Record<string, unknown>): { role?: string } =>
    typeof s.role === "string" && FILTERS.some((f) => f.value === s.role) ? { role: s.role } : {},
  component: () => (
    <AdminShell title="Utilisateurs" subtitle="Chercher un compte, changer son rôle, le bloquer.">
      {({ refresh }) => <UsersPage refresh={refresh} />}
    </AdminShell>
  ),
  head: () => ({ meta: [{ title: "Utilisateurs — Plav'" }] }),
});

function UsersPage({ refresh }: { refresh: () => Promise<void> }) {
  const { user: me } = useAuth();
  const { role: roleFilter = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/users" });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");

  // Recherche lancée 300 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listUsers({ search: query, role: roleFilter, limit: PAGE });
    if (res.error) toast.error(res.error);
    setUsers(res.data);
    setTotal(res.data[0]?.total_count ?? 0);
    setLoading(false);
  }, [query, roleFilter]);

  useEffect(() => { load(); }, [load]);

  async function more() {
    setLoadingMore(true);
    const res = await listUsers({ search: query, role: roleFilter, limit: PAGE, offset: users.length });
    setLoadingMore(false);
    if (res.error) { toast.error(res.error); return; }
    setUsers((list) => [...list, ...res.data]);
  }

  async function changeRole(u: AdminUser, role: string) {
    if (role === u.role) return;
    if (role === "admin" && !confirm(`Donner à ${u.full_name || u.email} tous les droits d'administration Plav' ?`)) return;
    setBusyId(u.id);
    const err = await setUserRole(u.id, role);
    setBusyId(null);
    if (err) { toast.error(err); return; }
    toast.success(`${u.full_name || u.email} est maintenant ${ROLE_LABEL[role as UserRole].toLowerCase()}.`);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: role as UserRole } : x)));
    refresh();
  }

  async function confirmBlock() {
    if (!blocking) return;
    if (!reason.trim()) { toast.error("Indique la raison du blocage."); return; }
    setBusyId(blocking.id);
    const err = await setUserBlocked(blocking.id, true, reason.trim());
    setBusyId(null);
    if (err) { toast.error(err); return; }
    toast.success(`${blocking.full_name || blocking.email} est bloqué(e).`);
    const id = blocking.id;
    setUsers((list) => list.map((x) => (x.id === id ? { ...x, blocked_at: new Date().toISOString(), blocked_reason: reason.trim() } : x)));
    setBlocking(null);
    setReason("");
    refresh();
  }

  async function unblock(u: AdminUser) {
    setBusyId(u.id);
    const err = await setUserBlocked(u.id, false);
    setBusyId(null);
    if (err) { toast.error(err); return; }
    toast.success(`${u.full_name || u.email} est débloqué(e).`);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, blocked_at: null, blocked_reason: null } : x)));
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Nom, email ou école…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} type="button"
            onClick={() => navigate({ search: f.value ? { role: f.value } : {} })}
            className={`tap shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${roleFilter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : users.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-10 w-10 opacity-50" />
            Aucun compte trouvé.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total} compte{total > 1 ? "s" : ""}</p>
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {users.map((u) => {
                const self = u.id === me?.id;
                const locked = self || u.role === "school_admin";
                const photo = avatarUrl(u.avatar_path);
                return (
                  <li key={u.id} className={`flex flex-col gap-3 p-4 md:flex-row md:items-center ${u.blocked_at ? "bg-destructive/5" : ""}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
                        <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{initials(u.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                          <span className="truncate">{u.full_name || "Sans nom"}</span>
                          {self && <span className="text-xs font-normal text-muted-foreground">(toi)</span>}
                          {u.verification_status === "verified" && <BadgeCheck className="h-4 w-4 text-success" aria-label="Étudiant vérifié" />}
                          {u.blocked_at && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Bloqué</span>}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[u.school_name, u.association_name].filter(Boolean).join(" · ") || "Sans école"}
                          {" · inscrit le "}{format(new Date(u.created_at), "d MMM yyyy", { locale: fr })}
                          {u.last_sign_in_at && <> · vu {formatDistanceToNow(new Date(u.last_sign_in_at), { locale: fr, addSuffix: true })}</>}
                        </p>
                        {u.blocked_reason && <p className="text-xs text-destructive">Motif : {u.blocked_reason}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:shrink-0">
                      {locked ? (
                        <span className="flex h-9 min-w-40 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                          {ROLE_LABEL[u.role]}
                        </span>
                      ) : (
                        <Select value={u.role} onValueChange={(v) => changeRole(u, v)} disabled={busyId === u.id}>
                          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {!self && (u.blocked_at ? (
                        <Button size="sm" variant="outline" onClick={() => unblock(u)} disabled={busyId === u.id}>
                          {busyId === u.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LockOpen className="mr-1.5 h-4 w-4" />}
                          Débloquer
                        </Button>
                      ) : u.role !== "admin" && (
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setBlocking(u); setReason(""); }} disabled={busyId === u.id}>
                          <Ban className="mr-1.5 h-4 w-4" />Bloquer
                        </Button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          {users.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={more} disabled={loadingMore}>
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Afficher plus ({total - users.length})
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!blocking} onOpenChange={(o) => { if (!o) setBlocking(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquer {blocking?.full_name || blocking?.email} ?</DialogTitle>
            <DialogDescription>
              Le compte est déconnecté et ne peut plus se connecter tant que tu ne le débloques pas. Ses données sont conservées.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="Raison du blocage (obligatoire)" maxLength={300} value={reason}
            onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmBlock(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocking(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmBlock} disabled={busyId === blocking?.id}>
              {busyId === blocking?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              Bloquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
