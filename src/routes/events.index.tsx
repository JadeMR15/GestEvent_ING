import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, MapPin, Users, Search, PlusCircle, Clock } from "lucide-react";
import { format, isThisWeek, isThisMonth } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/events/")({
  component: () => <ProtectedLayout><EventList /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Événements — GuestEvent" }] }),
});

type DateFilter = "all" | "week" | "month";
type StatusFilter = "all" | "open" | "full";

function EventList() {
  const { role } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("*, registrations(id,status)")
        .order("starts_at", { ascending: true });
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, []);

  function getActive(e: any) {
    const now = new Date();
    return (e.registrations ?? []).filter(
      (r: any) =>
        r.status === "registered" ||
        r.status === "attended" ||
        (r.status === "pending" && r.expires_at && new Date(r.expires_at) > now),
    );
  }

  const filtered = events.filter((e) => {
    const active = getActive(e);
    const isFull = e.capacity > 0 && active.length >= e.capacity;

    if (q && !e.title.toLowerCase().includes(q.toLowerCase()) && !e.location?.toLowerCase().includes(q.toLowerCase())) return false;

    if (dateFilter === "week" && !isThisWeek(new Date(e.starts_at))) return false;
    if (dateFilter === "month" && !isThisMonth(new Date(e.starts_at))) return false;

    if (statusFilter === "open" && isFull) return false;
    if (statusFilter === "full" && !isFull) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Événements</h1>
          <p className="text-muted-foreground">Découvrez et rejoignez les prochains événements.</p>
        </div>
        {(role === "organizer" || role === "admin") && (
          <Button asChild className="bg-gradient-primary shadow-glow">
            <Link to="/events/new"><PlusCircle className="mr-2 h-4 w-4" />Nouvel événement</Link>
          </Button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par titre ou lieu…" className="pl-9" />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-40">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les dates</SelectItem>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="open">Ouvert</SelectItem>
            <SelectItem value="full">Complet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">Aucun événement trouvé.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => {
            const active = getActive(e);
            const taken = active.length;
            const pct = e.capacity > 0 ? Math.min(100, Math.round((taken / e.capacity) * 100)) : 0;
            const isFull = e.capacity > 0 && taken >= e.capacity;
            const remaining = e.capacity - taken;

            return (
              <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }}>
                <Card className="group h-full overflow-hidden border-2 transition-all hover:shadow-glow hover:-translate-y-0.5">
                  {/* Cover image or gradient bar */}
                  {e.cover_image_url ? (
                    <div className="relative h-36 w-full overflow-hidden bg-muted">
                      <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      {/* Capacity badge over image */}
                      <div className="absolute right-2 top-2">
                        {isFull ? (
                          <Badge variant="destructive">Complet</Badge>
                        ) : remaining < 10 ? (
                          <Badge className="bg-orange-500 hover:bg-orange-500">{remaining} places restantes</Badge>
                        ) : null}
                      </div>
                      {/* Draft badge */}
                      {e.status === "draft" && (
                        <div className="absolute left-2 top-2">
                          <Badge variant="secondary">Brouillon</Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative h-2 bg-gradient-vibrant">
                      <div className="absolute -bottom-3 right-2 flex gap-1">
                        {isFull ? (
                          <Badge variant="destructive" className="text-[10px]">Complet</Badge>
                        ) : remaining < 10 ? (
                          <Badge className="bg-orange-500 hover:bg-orange-500 text-[10px]">{remaining} places</Badge>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <CardContent className="p-5">
                    <h3 className="text-lg font-semibold group-hover:text-primary line-clamp-2 mt-1">{e.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{e.description || "Aucune description."}</p>
                    <div className="mt-4 space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />{format(new Date(e.starts_at), "PPP p")}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />{e.location || "En ligne"}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />{taken} / {e.capacity > 0 ? e.capacity : "∞"}
                      </div>
                    </div>
                    {e.capacity > 0 && (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all ${isFull ? "bg-destructive" : remaining < 10 ? "bg-orange-500" : "bg-gradient-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
