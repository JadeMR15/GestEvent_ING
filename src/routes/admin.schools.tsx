import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Inbox, Loader2, Pencil, Plus, School, X, XCircle } from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type SchoolDomain, type SchoolDomainRequest,
  approveDomainRequest, db, rejectDomainRequest,
} from "@/lib/school-email";

export const Route = createFileRoute("/admin/schools")({
  component: () => (
    <ProtectedLayout allow={["admin"]}>
      <AdminSchoolsPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Écoles — Plav'" }] }),
});

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/;

function domainError(message: string) {
  if (message.includes("public_email_domain")) return "Une messagerie grand public (Gmail, Outlook…) ne peut pas être un domaine d'école.";
  if (message.includes("duplicate") || message.includes("unique")) return "Ce domaine existe déjà.";
  return "Enregistrement impossible : " + message;
}

interface RequestGroup { domain: string; requests: (SchoolDomainRequest & { full_name?: string })[] }

function AdminSchoolsPage() {
  const [domains, setDomains] = useState<SchoolDomain[]>([]);
  const [groups, setGroups] = useState<RequestGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Ajout
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  // Modification
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");

  // Décisions sur les demandes (par domaine demandé)
  const [decision, setDecision] = useState<Record<string, { school: string; domain: string; note: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: d }, { data: r }] = await Promise.all([
      db.from("school_domains").select("*").order("school_name"),
      db.from("school_domain_requests").select("*").eq("status", "pending").order("created_at"),
    ]);
    setDomains((d ?? []) as SchoolDomain[]);

    const reqs = (r ?? []) as SchoolDomainRequest[];
    const ids = Array.from(new Set(reqs.map((x) => x.user_id)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await db.from("profiles").select("id, full_name").in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
    }
    const byDomain = new Map<string, RequestGroup>();
    for (const x of reqs) {
      const g = byDomain.get(x.domain) ?? { domain: x.domain, requests: [] };
      g.requests.push({ ...x, full_name: names[x.user_id] });
      byDomain.set(x.domain, g);
    }
    setGroups([...byDomain.values()].sort((a, b) => b.requests.length - a.requests.length));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addDomain() {
    const school_name = newName.trim();
    const domain = newDomain.trim().toLowerCase().replace(/^@/, "");
    if (school_name.length < 2) { toast.error("Nom de l'école requis."); return; }
    if (!DOMAIN_RE.test(domain)) { toast.error("Domaine invalide (ex. ecole.fr)."); return; }
    setAdding(true);
    const { error } = await db.from("school_domains").insert({ school_name, domain });
    setAdding(false);
    if (error) { toast.error(domainError(error.message)); return; }
    toast.success(`${school_name} (${domain}) ajoutée.`);
    setNewName(""); setNewDomain("");
    load();
  }

  async function saveEdit(d: SchoolDomain) {
    const school_name = editName.trim();
    const domain = editDomain.trim().toLowerCase();
    if (school_name.length < 2 || !DOMAIN_RE.test(domain)) { toast.error("Nom ou domaine invalide."); return; }
    const { error } = await db.from("school_domains").update({ school_name, domain }).eq("id", d.id);
    if (error) { toast.error(domainError(error.message)); return; }
    toast.success("Domaine modifié.");
    setEditId(null);
    load();
  }

  async function toggleActive(d: SchoolDomain, active: boolean) {
    const { error } = await db.from("school_domains").update({ active }).eq("id", d.id);
    if (error) { toast.error(domainError(error.message)); return; }
    setDomains((list) => list.map((x) => (x.id === d.id ? { ...x, active } : x)));
    toast.success(active
      ? `${d.domain} réactivé.`
      : `${d.domain} désactivé : les nouvelles adresses de ce domaine ne seront plus acceptées.`);
  }

  const dec = (g: RequestGroup) => decision[g.domain] ?? { school: "", domain: g.domain, note: "" };
  const setDec = (g: RequestGroup, patch: Partial<{ school: string; domain: string; note: string }>) =>
    setDecision((all) => ({ ...all, [g.domain]: { ...dec(g), ...patch } }));

  async function approve(g: RequestGroup) {
    const d = dec(g);
    if (d.school.trim().length < 2) { toast.error("Indique le nom de l'école."); return; }
    setBusy(g.domain);
    const res = await approveDomainRequest(g.requests[0].id, d.school.trim(), d.domain.trim().toLowerCase());
    setBusy(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`${d.school.trim()} ajoutée : ${res.notified ?? 0} étudiant(s) prévenu(s).`);
    load();
  }

  async function reject(g: RequestGroup) {
    const note = dec(g).note.trim();
    if (!note) { toast.error("Indique la raison du refus : l'étudiant la verra."); return; }
    setBusy(g.domain);
    for (const r of g.requests) {
      const res = await rejectDomainRequest(r.id, note);
      if (res.error) { setBusy(null); toast.error(res.error); return; }
    }
    setBusy(null);
    toast.success(`Demande(s) pour ${g.domain} refusée(s).`);
    load();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Écoles</h1>
        <p className="text-muted-foreground">
          Domaines d'adresses email qui prouvent l'appartenance à une école. Les sous-domaines sont acceptés
          (ex. <code>etu.esme.fr</code> pour <code>esme.fr</code>). Les messageries grand public sont refusées.
        </p>
      </div>

      {/* Demandes d'ajout */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />Demandes d'ajout ({groups.length})</CardTitle>
          <CardDescription>Domaines saisis par des étudiants et pas encore reconnus.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : groups.map((g) => {
            const d = dec(g);
            return (
              <div key={g.domain} className="space-y-3 rounded-xl border bg-[#FBF5EA] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono font-semibold text-[#6B1A2F]">@{g.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.requests.length} demande{g.requests.length > 1 ? "s" : ""}
                  </p>
                </div>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {g.requests.map((r) => (
                    <li key={r.id}>
                      {r.full_name || "Étudiant"} · {r.email} · {format(new Date(r.created_at), "d MMM", { locale: fr })}
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nom de l'école</Label>
                    <Input placeholder="Ex. EFREI" maxLength={120} value={d.school} onChange={(e) => setDec(g, { school: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Domaine à reconnaître</Label>
                    <Input value={d.domain} onChange={(e) => setDec(g, { domain: e.target.value })} />
                  </div>
                </div>
                <Input placeholder="Raison du refus (obligatoire pour refuser)" maxLength={300}
                  value={d.note} onChange={(e) => setDec(g, { note: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => approve(g)} disabled={busy === g.domain} className="bg-green-700 hover:bg-green-800">
                    {busy === g.domain ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Reconnaître l'école
                  </Button>
                  <Button variant="outline" onClick={() => reject(g)} disabled={busy === g.domain} className="text-red-700">
                    <XCircle className="mr-2 h-4 w-4" />Refuser
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  En reconnaissant l'école, chaque étudiant reçoit un lien de confirmation sur son adresse d'école.
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Domaines reconnus */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><School className="h-5 w-5" />Domaines reconnus ({domains.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Nom de l'école" maxLength={120} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="domaine.fr" value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDomain(); }} />
            <Button onClick={addDomain} disabled={adding} className="bg-gradient-primary shadow-glow">
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Ajouter
            </Button>
          </div>

          <ul className="divide-y">
            {domains.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                {editId === d.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input className="min-w-32 flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Input className="min-w-32 flex-1" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
                    <Button size="icon" variant="ghost" onClick={() => saveEdit(d)} title="Enregistrer"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditId(null)} title="Annuler"><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <div className={`min-w-0 ${d.active ? "" : "opacity-50"}`}>
                    <p className="font-medium">{d.school_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">@{d.domain} et sous-domaines</p>
                  </div>
                )}
                {editId !== d.id && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={d.active} onCheckedChange={(v) => toggleActive(d, v)} />
                      {d.active ? "Actif" : "Désactivé"}
                    </label>
                    <Button size="icon" variant="ghost" title="Modifier"
                      onClick={() => { setEditId(d.id); setEditName(d.school_name); setEditDomain(d.domain); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Désactiver un domaine bloque les nouvelles confirmations ; les comptes déjà vérifiés le restent jusqu'au 31 août.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
