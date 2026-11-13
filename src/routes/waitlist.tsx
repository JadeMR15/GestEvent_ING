import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellRing, CalendarDays, ExternalLink, Hourglass, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  type MyWaitlistEntry, formatRemaining, getMyWaitlist, isLiveOffer, leaveWaitlist, ordinal,
} from "@/lib/waitlist";

export const Route = createFileRoute("/waitlist")({
  component: () => <ProtectedLayout><WaitlistPage /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Mes listes d'attente — Plav'" }] }),
});

const HISTORY_LABEL: Record<string, string> = {
  accepted: "Place obtenue",
  expired: "Offre expirée",
  left: "Liste quittée",
  waiting: "Événement passé",
  offered: "Offre expirée",
};

function WaitlistPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MyWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    setEntries(await getMyWaitlist());
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Position et offres mises à jour en direct.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`waitlist:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const hasOffer = entries.some((e) => e.status === "offered");
  useEffect(() => {
    if (!hasOffer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasOffer]);

  async function leave(entry: MyWaitlistEntry) {
    const isOffer = entry.status === "offered";
    const question = isOffer
      ? `Laisser ta place pour « ${entry.event_title} » à la personne suivante ?`
      : `Quitter la liste d'attente de « ${entry.event_title} » ?`;
    if (!confirm(question)) return;
    setLeaving(entry.id);
    const res = await leaveWaitlist(entry.event_id);
    setLeaving(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success(isOffer ? "Place laissée à la personne suivante." : "Tu as quitté la liste d'attente.");
    load();
  }

  const upcoming = (e: MyWaitlistEntry) => new Date(e.event_starts_at).getTime() > now;
  const current = entries.filter((e) => upcoming(e) && (e.status === "waiting" || isLiveOffer(e, now)));
  const history = entries.filter((e) => !current.includes(e)).reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mes listes d'attente</h1>
        <p className="text-muted-foreground">
          Quand une place se libère, elle est proposée dans l'ordre d'arrivée. Tu es prévenu(e) par email.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : current.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Hourglass className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Tu n'es sur aucune liste d'attente.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sur un événement complet, clique sur « Rejoindre la liste d'attente ».
            </p>
            <Button asChild className="mt-4 bg-gradient-primary shadow-glow">
              <Link to="/events">Découvrir les événements</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {current.map((e) => {
            const offer = e.status === "offered";
            return (
              <Card key={e.id} className={`overflow-hidden border-2 shadow-elegant ${offer ? "border-[#E8B22E]" : ""}`}>
                <div className="h-2 bg-gradient-vibrant" />
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold">{e.event_title}</h3>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5" />{format(new Date(e.event_starts_at), "PPP p", { locale: fr })}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />{e.event_location || "En ligne"}
                        </div>
                      </div>
                    </div>
                    {!offer && (
                      <div className="rounded-xl bg-[#FBF5EA] px-4 py-2 text-center">
                        <p className="text-2xl font-bold text-[#6B1A2F]">{e.rank ? ordinal(e.rank) : "—"}</p>
                        <p className="text-xs text-muted-foreground">dans la file</p>
                      </div>
                    )}
                  </div>

                  {offer ? (
                    <div className="rounded-xl bg-[#F8E7B5]/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-semibold text-[#6B1A2F]">
                          <BellRing className="h-4 w-4" />Une place t'attend !
                        </p>
                        <span className="font-mono font-bold text-[#6B1A2F]">
                          {formatRemaining(new Date(e.offer_expires_at!).getTime() - now)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#4A0F20]/80">
                        Réservée jusqu'à {format(new Date(e.offer_expires_at!), "HH:mm", { locale: fr })}, ensuite elle passe à la personne suivante.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild className="bg-gradient-primary shadow-glow">
                          <Link to="/events/$eventId" params={{ eventId: e.event_id }}>Prendre ma place</Link>
                        </Button>
                        <Button variant="ghost" className="text-[#6B1A2F]" onClick={() => leave(e)} disabled={leaving === e.id}>
                          Je laisse ma place
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <p className="text-sm text-muted-foreground">
                        {e.rank === 1 ? "Tu es le/la prochain(e) servi(e)." : `${(e.rank ?? 1) - 1} personne${(e.rank ?? 1) - 1 > 1 ? "s" : ""} avant toi.`}
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/events/$eventId" params={{ eventId: e.event_id }}>
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />Voir
                          </Link>
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => leave(e)} disabled={leaving === e.id}>
                          {leaving === e.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                          Quitter
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Historique</p>
          {history.map((e) => (
            <Card key={e.id} className="border">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.event_title}</p>
                  <p className="text-muted-foreground">{format(new Date(e.event_starts_at), "PPP", { locale: fr })}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.status === "accepted" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {HISTORY_LABEL[e.status] ?? e.status}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
