import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db, schoolErrorMessage, type School } from "@/lib/schools";

// Comptes école (inscrits via /register-school) à valider par l'admin plateforme.
const STATUS: Record<School["status"], { label: string; className: string }> = {
  pending:  { label: "En attente", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  active:   { label: "Active",     className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  rejected: { label: "Refusée",    className: "bg-red-100 text-red-800 hover:bg-red-100" },
};

export function SchoolAccountsReview() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await db.from("schools").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Chargement impossible (la migration school_admin est-elle lancée ?).");
    setSchools(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(s: School, approve: boolean) {
    const note = notes[s.id]?.trim() ?? "";
    if (!approve && !note) { toast.error("Indique la raison du refus : l'école la verra."); return; }
    setBusyId(s.id);
    const { error } = await db.rpc("review_school", { _school_id: s.id, _approve: approve, _note: note || null });
    setBusyId(null);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success(approve ? `${s.name} est validée. Les comptes existants de l'école y sont rattachés.` : `${s.name} refusée.`);
    load();
  }

  const pending = schools.filter((s) => s.status === "pending");
  const others = schools.filter((s) => s.status !== "pending");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Comptes école</h2>
        <p className="text-sm text-muted-foreground">
          Vérifie que la demande vient bien de l'école (domaine email, nom) avant de lui ouvrir son espace.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {pending.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Building2 className="mx-auto mb-3 h-10 w-10 opacity-50" />
                Aucune demande en attente.
              </CardContent>
            </Card>
          ) : pending.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.email_domains.map((d) => "@" + d).join(", ")}
                      {s.created_at && ` · demandé le ${format(new Date(s.created_at), "d MMM yyyy", { locale: fr })}`}
                    </p>
                  </div>
                  <Badge className={STATUS.pending.className}>{STATUS.pending.label}</Badge>
                </div>
                <Input placeholder="Raison du refus (obligatoire pour refuser)" maxLength={300}
                  value={notes[s.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />
                <div className="flex gap-2">
                  <Button onClick={() => decide(s, true)} disabled={busyId === s.id} className="flex-1 bg-green-700 hover:bg-green-800">
                    {busyId === s.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Valider
                  </Button>
                  <Button onClick={() => decide(s, false)} disabled={busyId === s.id} variant="outline" className="flex-1 text-red-700">
                    <XCircle className="mr-2 h-4 w-4" />Refuser
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {others.length > 0 && (
            <Card>
              <CardContent className="divide-y p-0">
                {others.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email_domains.map((d) => "@" + d).join(", ")}</p>
                    </div>
                    <Badge className={STATUS[s.status].className}>{STATUS[s.status].label}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
