import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, MapPin, Users, Search, PlusCircle, Clock, GraduationCap, Map as MapIcon, List, ArrowUpDown } from "lucide-react";
import { format, isThisWeek, isThisMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

const EventMap = lazy(() => import("@/components/EventMap"));

export const Route = createFileRoute("/events/")({
  component: () => <ProtectedLayout><EventList /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Événements — GuestEvent" }] }),
});

type DateFilter = "all" | "week" | "month";
type StatusFilter = "all" | "open" | "full";
type ViewMode = "list" | "map";
type SortOption = "date_asc" | "date_desc" | "title_asc" | "title_desc" | "spots_asc" | "price_asc" | "price_desc";

function EventList() {
  const [events, setEvents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("date_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const { role, user } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    (async () => {
      let query = supabase.from("events").select("*, registrations(id,status)").order("starts_at", { ascending: true });
      if (role === "organizer" && user) query = query.eq("organizer_id", user.id);
      const { data } = await query;
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, [role, user]);

  function getActive(e: any) {
    const now = new Date();
    return (e.registrations ?? []).filter(
      (r: any) =>
        r.status === "registered" ||
        r.status === "attended" ||
        (r.status === "pending" && r.expires_at && new Date(r.expires_at) > now),
    );
  }

  const schools = useMemo(() =>
    Array.from(new Map(events.map((e) => e.school).filter(Boolean).map((s: string) => [s.toLowerCase(), s])).values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    [events]
  );

  const cities = useMemo(() =>
    Array.from(new Map(events.map((e) => e.city).filter(Boolean).map((c: string) => [c.toLowerCase(), c])).values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    [events]
  );

  const filtered = useMemo(() => events.filter((e) => {
    const active = getActive(e);
    const isFull = e.capacity > 0 && active.length >= e.capacity;

    if (q) {
      const lq = q.toLowerCase();
      if (
        !e.title.toLowerCase().includes(lq) &&
        !e.location?.toLowerCase().includes(lq) &&
        !e.city?.toLowerCase().includes(lq) &&
        !e.school?.toLowerCase().includes(lq) &&
        !e.association?.toLowerCase().includes(lq)
      ) return false;
    }

    if (dateFilter === "week" && !isThisWeek(new Date(e.starts_at))) return false;
    if (dateFilter === "month" && !isThisMonth(new Date(e.starts_at))) return false;
    if (statusFilter === "open" && isFull) return false;
    if (statusFilter === "full" && !isFull) return false;
    if (schoolFilter !== "all" && e.school?.toLowerCase() !== schoolFilter.toLowerCase()) return false;
    if (cityFilter !== "all" && e.city?.toLowerCase() !== cityFilter.toLowerCase()) return false;

    return true;
  }), [events, q, dateFilter, statusFilter, schoolFilter, cityFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case "date_asc":   return arr.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      case "date_desc":  return arr.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
      case "title_asc":  return arr.sort((a, b) => a.title.localeCompare(b.title, "fr"));
      case "title_desc": return arr.sort((a, b) => b.title.localeCompare(a.title, "fr"));
      case "spots_asc":  return arr.sort((a, b) => {
        const remA = a.capacity > 0 ? a.capacity - getActive(a).length : Infinity;
        const remB = b.capacity > 0 ? b.capacity - getActive(b).length : Infinity;
        return remA - remB;
      });
      case "price_asc":  return arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price_desc": return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      default: return arr;
    }
  }, [filtered, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight not-italic">
            {role === "organizer" || role === "admin" ? "Vos événements" : "Événements"}
          </h1>
          <p className="text-muted-foreground">
            {role === "organizer" || role === "admin" ? "Gérez vos événements." : "Découvrez et rejoignez les prochains événements."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Vue liste / carte */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />Liste
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <MapIcon className="h-4 w-4" />Carte
            </button>
          </div>
          {(role === "organizer" || role === "admin") && (
            <Button asChild className="bg-gradient-primary shadow-glow">
              <Link to="/events/new"><PlusCircle className="mr-2 h-4 w-4" />Nouvel événement</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre, lieu, ville, école…" className="pl-9" />
        </div>

        {/* Filtre ville */}
        {cities.length > 0 && (
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-44">
              <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Toutes les villes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les villes</SelectItem>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="w-48">
            <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Toutes les écoles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les écoles</SelectItem>
            {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

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

<Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-48">
            <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_asc">Date (plus proche)</SelectItem>
            <SelectItem value="date_desc">Date (plus loin)</SelectItem>
            <SelectItem value="title_asc">Titre A → Z</SelectItem>
            <SelectItem value="title_desc">Titre Z → A</SelectItem>
            <SelectItem value="spots_asc">Places restantes</SelectItem>
            <SelectItem value="price_asc">Prix croissant</SelectItem>
            <SelectItem value="price_desc">Prix décroissant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : sorted.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">Aucun événement trouvé.</CardContent>
        </Card>
      ) : viewMode === "map" ? (
        /* ── Vue carte ── */
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sorted.filter((e) => e.latitude && e.longitude).length} événement(s) affiché(s) sur la carte
            {sorted.some((e) => !e.latitude) && " — certains n'ont pas de ville renseignée"}
          </p>
          {mounted && (
            <Suspense fallback={<div className="h-[500px] animate-pulse rounded-xl border bg-muted" />}>
              <EventMap events={sorted} />
            </Suspense>
          )}
        </div>
      ) : (
        /* ── Vue liste ── */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((e) => {
            const active = getActive(e);
            const taken = active.length;
            const pct = e.capacity > 0 ? Math.min(100, Math.round((taken / e.capacity) * 100)) : 0;
            const isFull = e.capacity > 0 && taken >= e.capacity;
            const remaining = e.capacity - taken;

            return (
              <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }}>
                <Card className="group h-full overflow-hidden border-2 transition-all hover:shadow-glow hover:-translate-y-0.5">
                  {e.cover_image_url ? (
                    <div className="relative h-36 w-full overflow-hidden bg-muted">
                      <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      {e.status === "draft" && <div className="absolute left-2 top-2"><Badge variant="secondary">Brouillon</Badge></div>}
                    </div>
                  ) : (
                    <div className="relative h-2 bg-gradient-vibrant" />
                  )}
                  <CardContent className="p-5">
                    <div className="flex flex-wrap gap-1 mt-1 mb-2">
                      {e.school && <Badge variant="secondary" className="text-[10px] bg-[#D5E8A0] text-[#204839]"><GraduationCap className="mr-1 h-3 w-3" />{e.school}</Badge>}
                      {e.association && <Badge variant="secondary" className="text-[10px]">{e.association}</Badge>}
                    </div>
                    <h3 className="text-lg font-semibold group-hover:text-primary line-clamp-2">{e.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{e.description || "Aucune description."}</p>
                    <div className="mt-4 space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />{format(new Date(e.starts_at), "PPP p", { locale: fr })}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span className="line-clamp-1">{e.city ? `${e.city}${e.location ? ` — ${e.location}` : ""}` : e.location || "En ligne"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />{taken} / {e.capacity > 0 ? e.capacity : "∞"}
                      </div>
                    </div>
                    {e.capacity > 0 && (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full transition-all ${isFull ? "bg-destructive" : remaining < 10 ? "bg-orange-500" : "bg-gradient-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {(isFull || remaining < 10) && e.capacity > 0 && (
                      <div className="mt-3 flex justify-end">
                        {isFull
                          ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0 leading-none h-5">Complet</Badge>
                          : <Badge className="bg-orange-500 hover:bg-orange-500 text-[10px] px-1.5 py-0 leading-none h-5">{remaining} place{remaining > 1 ? "s" : ""}</Badge>}
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
