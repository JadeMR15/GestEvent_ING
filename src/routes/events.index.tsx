import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTakenCounts, takenOf } from "@/lib/event-taken";
import { useLikes } from "@/lib/likes";
import { LikeButton } from "@/components/LikeButton";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { APPROVAL_BADGE, APPROVAL_LABEL, type ApprovalStatus } from "@/lib/schools";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Search, CirclePlus, Clock, GraduationCap, Map as MapIcon, List, ArrowUpDown, SlidersHorizontal } from "lucide-react";
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
      const list = data ?? [];
      const taken = await fetchTakenCounts(list.map((e) => e.id));
      setEvents(list.map((e) => ({ ...e, taken: taken[e.id] })));
      setLoading(false);
    })();
  }, [role, user]);

  const schools = useMemo(() =>
    Array.from(new Map(events.map((e) => e.school).filter(Boolean).map((s: string) => [s.toLowerCase(), s])).values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    [events]
  );

  const cities = useMemo(() =>
    Array.from(new Map(events.map((e) => e.city).filter(Boolean).map((c: string) => [c.toLowerCase(), c])).values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    [events]
  );

  const filtered = useMemo(() => events.filter((e) => {
    const isFull = e.capacity > 0 && takenOf(e) >= e.capacity;

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
        const remA = a.capacity > 0 ? a.capacity - takenOf(a) : Infinity;
        const remB = b.capacity > 0 ? b.capacity - takenOf(b) : Infinity;
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
      <SelectTrigger className="w-full md:w-auto">
        <MapPin />
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
      <SelectTrigger className="w-full md:w-auto">
        <GraduationCap />
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
      <SelectTrigger className="w-full md:w-auto">
        <ArrowUpDown />
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
  const likes = useLikes(useMemo(() => events.map((e) => e.id), [events]));

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
            <Button asChild className="hidden md:inline-flex">
              <Link to="/events/new"><CirclePlus />Nouvel événement</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Recherche + filtres — mobile */}
      <div className="space-y-3 md:hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Soirée, lieu, école…" className="peer pl-[46px]" />
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gris-chaud peer-focus:text-bordeaux-600" strokeWidth={2} />
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <button aria-label="Filtres" className="tap relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-moyen)] border-[1.5px] border-sable bg-blanc text-bordeaux-600">
                <SlidersHorizontal className="h-5 w-5" strokeWidth={2} />
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
                <DrawerClose asChild><Button className="flex-1">Voir {sorted.length} résultat{sorted.length > 1 ? "s" : ""}</Button></DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <button
            aria-label={viewMode === "list" ? "Voir la carte" : "Voir la liste"}
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
            className={`tap flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-moyen)] border-[1.5px] ${viewMode === "map" ? "border-bordeaux-600 bg-bordeaux-600 text-creme" : "border-sable bg-blanc text-bordeaux-600"}`}
          >
            {viewMode === "list" ? <MapIcon className="h-5 w-5" strokeWidth={2} /> : <List className="h-5 w-5" strokeWidth={2} />}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.onClick}
              className={`tap min-h-11 shrink-0 rounded-[var(--radius-pilule)] border px-4 text-sm font-semibold transition-colors ${c.active ? "border-bordeaux-600 bg-bordeaux-600 text-creme" : "border-sable bg-blanc text-encre"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recherche + filtres — ordinateur */}
      <div className="hidden flex-wrap gap-3 md:flex">
        <div className="relative min-w-56 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre, lieu, ville, école…" className="peer pl-[46px]" />
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gris-chaud peer-focus:text-bordeaux-600" strokeWidth={2} />
        </div>
        {citySelect}
        {schoolSelect}
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-auto">
            <Clock />
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
        <Card>
          <EmptyState title="Aucun événement trouvé." />
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
            const taken = takenOf(e);
            const pct = e.capacity > 0 ? Math.min(100, Math.round((taken / e.capacity) * 100)) : 0;
            const isFull = e.capacity > 0 && taken >= e.capacity;
            const remaining = e.capacity - taken;

            return (
              <Link key={e.id} to="/events/$eventId" params={{ eventId: e.id }} className="tap block rounded-[var(--radius-carte)]">
                {/* Carte d'événement — charte § 5 */}
                <Card className="group flex h-full flex-col overflow-hidden transition-shadow md:hover:shadow-[var(--ombre-menu)]">
                  {/* Visuel 4:3 ; sans image : dégradé bordeaux 600 → 400 */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-vibrant">
                    {e.cover_image_url ? (
                      <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <img src="/plav-cocotte.svg" alt="" className="absolute -bottom-8 -right-8 h-40 w-40 opacity-25" />
                    )}
                    {/* En haut à gauche : statut urgent (ou état de publication pour l'organisateur) */}
                    <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
                      {e.capacity > 0 && (isFull || remaining < 10) && (
                        <Badge variant={isFull ? "destructive" : "warning"}>
                          {isFull ? "Complet · liste d'attente" : `Plus que ${remaining} place${remaining > 1 ? "s" : ""}`}
                        </Badge>
                      )}
                      {e.status === "draft" && <Badge variant="neutral">Brouillon</Badge>}
                      {(e.approval_status === "pending" || e.approval_status === "rejected") && (
                        <Badge className={APPROVAL_BADGE[e.approval_status as ApprovalStatus]}>{APPROVAL_LABEL[e.approval_status as ApprovalStatus]}</Badge>
                      )}
                    </div>
                    {/* En haut à droite : prix */}
                    <span className="absolute right-3 top-3 rounded-[var(--radius-petit)] bg-creme px-2.5 py-1 t-corps-fort text-bordeaux-600">
                      {e.price > 0 ? `${Number(e.price).toFixed(2).replace(".", ",").replace(",00", "")} €` : "Gratuit"}
                    </span>
                    {/* Date façon billet */}
                    <div className="absolute bottom-3 left-3 flex w-14 flex-col items-center overflow-hidden rounded-[var(--radius-moyen)] bg-blanc text-center shadow-[var(--ombre-carte)]">
                      <span className="w-full bg-bordeaux-600 py-0.5 text-xs font-bold uppercase text-creme">
                        {format(new Date(e.starts_at), "MMM", { locale: fr }).replace(".", "")}
                      </span>
                      <span className="font-display text-2xl font-black leading-8 text-bordeaux-600">{format(new Date(e.starts_at), "d")}</span>
                    </div>
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
                    {(e.school || e.association) && (
                      <div className="flex flex-wrap gap-1">
                        {e.school && <Badge><GraduationCap className="h-4 w-4" strokeWidth={2} />{e.school}</Badge>}
                        {e.association && <Badge>{e.association}</Badge>}
                      </div>
                    )}
                    <h3 className="t-titre-3 line-clamp-2 text-encre group-hover:text-bordeaux-600">{e.title}</h3>
                    <p className="hidden line-clamp-2 text-sm text-gris-chaud md:block">{e.description || "Aucune description."}</p>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-2 t-legende text-gris-chaud">
                          <Clock className="h-4 w-4 shrink-0" strokeWidth={2} />{format(new Date(e.starts_at), "EEE d MMM · HH'h'mm", { locale: fr })}
                        </p>
                        <p className="flex min-w-0 items-center gap-2 t-legende text-gris-chaud">
                          <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} />
                          <span className="line-clamp-1">{e.city ? `${e.city}${e.location ? ` — ${e.location}` : ""}` : e.location || "En ligne"}</span>
                        </p>
                      </div>
                      <LikeButton count={likes.counts[e.id] ?? 0} liked={likes.mine.has(e.id)} onToggle={() => likes.toggle(e.id)} />
                    </div>
                    {e.capacity > 0 && (
                      <div className="mt-auto space-y-1.5 pt-1">
                        {/* Jauge : piste 6 px sable, remplissage selon le statut */}
                        <div className="h-1.5 overflow-hidden rounded-[var(--radius-pilule)] bg-sable">
                          <div className={`h-full rounded-[var(--radius-pilule)] transition-all ${isFull ? "bg-statut-rouge-500" : remaining < 10 ? "bg-statut-orange-500" : "bg-bordeaux-600"}`} style={{ width: `${isFull ? 100 : pct}%` }} />
                        </div>
                        <p className="flex items-center gap-2 t-legende text-gris-chaud"><Users className="h-4 w-4" strokeWidth={2} />{taken}/{e.capacity}</p>
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
