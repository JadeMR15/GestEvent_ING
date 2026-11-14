import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolAdminShell } from "@/components/SchoolAdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, CheckCircle2, ExternalLink, Loader2, MapPin, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db, schoolErrorMessage, type School } from "@/lib/schools";

export const Route = createFileRoute("/school-admin/reviews")({
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell title="Validation des événements"
        subtitle="Événements des associations soumises à validation, en attente de votre accord.">
        {(school, refresh) => <Reviews school={school} refresh={refresh} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Validation — Plav'" }] }),
});

interface PendingEvent {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  location: string;
  city: string;
  capacity: number;
  price: number;
  status: string;
  association: string | null;
  association_id: string | null;
  cover_image_url: string | null;
  updated_at: string;
}

function Reviews({ school, refresh }: { school: School; refresh: () => Promise<void> }) {
  const [items, setItems] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await db
      .from("events")
      .select("id, title, description, starts_at, location, city, capacity, price, status, association, association_id, cover_image_url, updated_at")
      .eq("school_id", school.id)
      .eq("approval_status", "pending")
      .order("starts_at", { ascending: true });
    if (error) toast.error("Chargement impossible.");
    setItems(data ?? []);
    setLoading(false);
  }, [school.id]);

  useEffect(() => { load(); }, [load]);

  async function decide(e: PendingEvent, approve: boolean) {
    const message = messages[e.id]?.trim() ?? "";
    if (!approve && !message) { toast.error("Explique à l'association pourquoi tu refuses : elle recevra ton message."); return; }
    setBusyId(e.id);
    const { error } = await db.rpc("review_event", { _event_id: e.id, _approve: approve, _message: message || null });
    setBusyId(null);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    toast.success(approve ? `« ${e.title} » est publié.` : `« ${e.title} » refusé, message envoyé à l'association.`);
    setItems((prev) => prev.filter((x) => x.id !== e.id));
    refresh();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-50" />
          Aucun événement en attente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((e) => (
        <Card key={e.id} className="overflow-hidden">
          <CardContent className="grid gap-4 p-0 md:grid-cols-[220px_1fr]">
            <div className="h-40 bg-secondary md:h-full">
              {e.cover_image_url
                ? <img src={e.cover_image_url} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center"><Calendar className="h-10 w-10 text-primary/40" /></div>}
            </div>
            <div className="space-y-3 p-5 md:pl-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-primary">{e.association ?? "Association"}</p>
                  <h3 className="text-lg font-bold">{e.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {e.status === "private" && <Badge variant="outline">Réservé à l'école</Badge>}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/events/$eventId" params={{ eventId: e.id }}><ExternalLink className="mr-1.5 h-4 w-4" />Aperçu</Link>
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{format(new Date(e.starts_at), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}</span>
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[e.location, e.city].filter(Boolean).join(", ")}</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{e.capacity} places · {Number(e.price) > 0 ? `dès ${e.price} €` : "gratuit"}</span>
              </div>
              {e.description && <p className="line-clamp-3 text-sm">{e.description}</p>}
              <Textarea
                rows={2}
                maxLength={4000}
                placeholder="Message à l'association (obligatoire pour refuser, facultatif pour valider)"
                value={messages[e.id] ?? ""}
                onChange={(ev) => setMessages((m) => ({ ...m, [e.id]: ev.target.value }))}
              />
              <div className="flex gap-2">
                <Button onClick={() => decide(e, true)} disabled={busyId === e.id} className="flex-1 bg-green-700 hover:bg-green-800">
                  {busyId === e.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Valider et publier
                </Button>
                <Button onClick={() => decide(e, false)} disabled={busyId === e.id} variant="outline" className="flex-1 text-red-700">
                  <XCircle className="mr-2 h-4 w-4" />Refuser
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
