import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, CheckCircle2, CircleDashed, ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/verifications")({
  component: () => (
    <ProtectedLayout allow={["admin"]}>
      <AdminVerificationsPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Vérifications — Plav'" }] }),
});

type Checks = Record<string, { ok: boolean; detail: string }>;
interface Pending {
  id: string;
  full_name: string;
  school: string | null;
  verification_note: string | null;
  verification_checks: Checks | null;
  student_doc_path: string | null;
  updated_at: string;
}

function AdminVerificationsPage() {
  const [items, setItems]     = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, school, verification_note, verification_checks, student_doc_path, updated_at")
      .eq("verification_status", "review")
      .order("updated_at", { ascending: true });
    if (error) toast.error("Chargement impossible.");
    setItems((data as Pending[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openDocument(path: string) {
    // Lien temporaire (5 min) : le fichier reste privé.
    const { data, error } = await supabase.storage.from("student-documents").createSignedUrl(path, 300);
    if (error || !data) { toast.error("Document introuvable."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function decide(p: Pending, approve: boolean) {
    const reason = reasons[p.id]?.trim();
    if (!approve && !reason) { toast.error("Indique la raison du refus : l'étudiant la verra."); return; }
    setBusyId(p.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        verification_status: approve ? "verified" : "rejected",
        verification_note: approve ? "Compte vérifié par un admin." : `Refusé par un admin : ${reason}`,
        verified_at: approve ? new Date().toISOString() : null,
        student_doc_path: null,
      })
      .eq("id", p.id);
    if (!error && p.student_doc_path) {
      await supabase.storage.from("student-documents").remove([p.student_doc_path]);
    }
    setBusyId(null);
    if (error) { toast.error("Mise à jour impossible."); return; }
    toast.success(approve ? `${p.full_name} est vérifié(e).` : `Dossier de ${p.full_name} refusé.`);
    setItems((prev) => prev.filter((x) => x.id !== p.id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vérifications étudiantes</h1>
        <p className="text-muted-foreground">
          Justificatifs que la vérification automatique n'a pas pu valider seule. Le document est supprimé après ta décision.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <BadgeCheck className="mx-auto mb-3 h-10 w-10 opacity-50" />
            Aucun dossier en attente.
          </CardContent>
        </Card>
      ) : (
        items.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{p.full_name || "Sans nom"}</p>
                  <p className="text-sm text-muted-foreground">École déclarée : {p.school || "—"}</p>
                </div>
                {p.student_doc_path && (
                  <Button variant="outline" size="sm" onClick={() => openDocument(p.student_doc_path!)}>
                    <ExternalLink className="mr-1.5 h-4 w-4" />Voir le document
                  </Button>
                )}
              </div>

              {p.verification_checks && (
                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                  {Object.values(p.verification_checks).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {c.ok
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                      {c.detail}
                    </div>
                  ))}
                </div>
              )}

              <Input
                placeholder="Raison du refus (obligatoire pour refuser)"
                maxLength={200}
                value={reasons[p.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button onClick={() => decide(p, true)} disabled={busyId === p.id} className="flex-1 bg-green-700 hover:bg-green-800">
                  {busyId === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                  Valider
                </Button>
                <Button onClick={() => decide(p, false)} disabled={busyId === p.id} variant="outline" className="flex-1 text-red-700">
                  <XCircle className="mr-2 h-4 w-4" />Refuser
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
