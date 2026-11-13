import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Search, PlusCircle, Clock, GraduationCap, Map as MapIcon, List, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { format, isThisWeek, isThisMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { pastEventCutoff } from "@/lib/event-dates";

const EventMap = lazy(() => import("@/components/EventMap"));

export const Route = createFileRoute("/events/")({
  component: () => <ProtectedLayout><EventList /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Soirées — Plav'" }] }),
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
      // Les événements passés n'apparaissent plus ici (ils restent dans « Mes billets »).
      let query = supabase
        .from("events")
        .select("*, registrations(id,status)")
        .gte("starts_at", pastEventCutoff().toISOString())
        .order("starts_at", { ascending: true });
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

  const isOrga = role === "organizer" || role === "admin";
  const advancedCount = (cityFilter !== "all" ? 1 : 0) + (schoolFilter !== "all" ? 1 : 0) + (sortBy !== "date_asc" ? 1 : 0);

  const citySelect = cities.length > 0 && (
    <Select value={cityFilter} onValueChange={setCityFilter}>
      <SelectTrigger className="w-full md:w-44">
        <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Toutes les villes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Toutes les villes</SelectItem>
        {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const schoolSelect = (
    <Select value={schoolFilter} onValueChange={setSchoolFilter}>
      <SelectTrigger className="w-full md:w-48">
        <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Toutes les écoles" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Toutes les écoles</SelectItem>
        {schools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const sortSelect = (
    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
      <SelectTrigger className="w-full md:w-48">
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
  );

  // Pastilles rapides (mobile) : date + places dispo
  const chips: { label: string; active: boolean; onClick: () => void }[] = [
    { label: "Tout", active: dateFilter === "all" && statusFilter === "all", onClick: () => { setDateFilter("all"); setStatusFilter("all"); } },
    { label: "Cette semaine", active: dateFilter === "week", onClick: () => setDateFilter(dateFilter === "week" ? "all" : "week") },
    { label: "Ce mois", active: dateFilter === "month", onClick: () => setDateFilter(dateFilter === "month" ? "all" : "month") },
    { label: "Places dispo", active: statusFilter === "open", onClick: () => setStatusFilter(statusFilter === "open" ? "all" : "open") },
  ];

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight not-italic">
            {isOrga ? "Vos événements" : <>Ce soir, on <span className="plav-highlight">sort</span> ?</>}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {isOrga ? "Gérez vos événements." : "Les prochaines soirées, à portée de main."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Vue liste / carte */}
          <div className="hidden overflow-hidden rounded-lg border md:flex">
            <button
              onClick={() => setViewMode("list")}
              aria-label="Liste"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />Liste
            </button>
            <button
              onClick={() => setViewMode("map")}
              aria-label="Carte"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <MapIcon className="h-4 w-4" />Carte
            </button>
          </div>
          {isOrga && (
            <Button asChild className="hidden bg-gradient-primary shadow-glow md:inline-flex">
              <Link to="/events/new"><PlusCircle className="mr-2 h-4 w-4" />Nouvel événement</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Recherche + filtres — mobile */}
      <div className="space-y-3 md:hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Soirée, lieu, école…" className="h-11 rounded-full bg-card pl-10" />
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <button aria-label="Filtres" className="tap relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-card text-primary">
                <SlidersHorizontal className="h-4 w-4" />
                {advancedCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">{advancedCount}</span>
                )}
              </button>
            </DrawerTrigger>
            <DrawerContent className="pb-safe">
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display text-xl">Filtres</DrawerTitle>
              </DrawerHeader>
              <div className="space-y-3 px-4">
                {citySelect}
                {schoolSelect}
                {sortSelect}
              </div>
              <DrawerFooter className="flex-row">
                <Button variant="outline" className="flex-1" onClick={() => { setCityFilter("all"); setSchoolFilter("all"); setSortBy("date_asc"); }}>Réinitialiser</Button>
                <DrawerClose asChild><Button className="flex-1 bg-gradient-primary">Voir {sorted.length} résultat{sorted.length > 1 ? "s" : ""}</Button></DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <button
            aria-label={viewMode === "list" ? "Voir la carte" : "Voir la liste"}
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
            className={`tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${viewMode === "map" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}
          >
            {viewMode === "list" ? <MapIcon className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.onClick}
              className={`tap shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${c.active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recherche + filtres — ordinateur */}
      <div className="hidden flex-wrap gap-3 md:flex">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre, lieu, ville, école…" className="pl-9" />
        </div>
        {citySelect}
        {schoolSelect}
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
        {sortSelect}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : sorted.length === 0 ? (
        <Card className="rounded-3xl border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground"><img src="/plav-cocotte.svg" alt="" className="mx-auto mb-3 h-16 w-16 opacity-40" />Aucun événement trouvé.</CardContent>
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
              <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }} className="tap block">
                <Card className="group h-full overflow-hidden rounded-3xl border shadow-elegant transition-all md:hover:shadow-glow md:hover:-translate-y-0.5">
                  <div className="relative h-44 w-full overflow-hidden bg-gradient-vibrant md:h-40">
                    {e.cover_image_url ? (
                      <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <img src="/plav-cocotte.svg" alt="" className="absolute -bottom-8 -right-8 h-40 w-40 opacity-25" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    {/* Date façon billet */}
                    <div className="absolute left-3 top-3 flex w-14 flex-col items-center overflow-hidden rounded-2xl bg-card text-center shadow-elegant">
                      <span className="w-full bg-primary py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        {format(new Date(e.starts_at), "MMM", { locale: fr }).replace(".", "")}
                      </span>
                      <span className="font-display text-2xl font-bold leading-8 text-primary">{format(new Date(e.starts_at), "d")}</span>
                    </div>
                    <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">
                        {e.price > 0 ? `${Number(e.price).toFixed(2).replace(".", ",").replace(",00", "")} €` : "Gratuit"}
                      </span>
                      {e.status === "draft" && <Badge variant="secondary">Brouillon</Badge>}
                    </div>
                    {e.capacity > 0 && (isFull || remaining < 10) && (
                      <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold text-white ${isFull ? "bg-destructive" : "bg-orange-500"}`}>
                        {isFull ? "Complet · liste d'attente" : `Plus que ${remaining} place${remaining > 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>
                  <CardContent className="p-4 md:p-5">
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {e.school && <Badge variant="secondary" className="text-[10px] bg-[#F3D27A] text-[#4A0F20]"><GraduationCap className="mr-1 h-3 w-3" />{e.school}</Badge>}
                      {e.association && <Badge variant="secondary" className="text-[10px]">{e.association}</Badge>}
                    </div>
                    <h3 className="text-lg font-semibold group-hover:text-primary line-clamp-2">{e.title}</h3>
                    <p className="mt-1 hidden line-clamp-2 text-sm text-muted-foreground md:block">{e.description || "Aucune description."}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />{format(new Date(e.starts_at), "EEE d MMM · HH'h'mm", { locale: fr })}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{e.city ? `${e.city}${e.location ? ` — ${e.location}` : ""}` : e.location || "En ligne"}</span>
                      </span>
                    </div>
                    {e.capacity > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full transition-all ${isFull ? "bg-destructive" : remaining < 10 ? "bg-orange-500" : "bg-gradient-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />{taken}/{e.capacity}</span>
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
