import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, GraduationCap, Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { associationCoverUrl, useAssociationFallbacks } from "@/components/AssociationLogo";
import { AssociationAvatar, FollowButton } from "@/components/social/SocialBits";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/schools";
import { isPastEvent } from "@/lib/event-dates";
import { fetchVisibleEvents, useFollows, type PublicAssociation } from "@/lib/social";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/associations/")({
  component: () => (
    <ProtectedLayout allow={["participant"]}>
      <Directory />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Associations — Plav'" }] }),
});

type Filter = "all" | "mine" | "school";

function Directory() {
  const { schoolId } = useAuth();
  const [associations, setAssociations] = useState<PublicAssociation[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const ids = associations.map((a) => a.id);
  const follows = useFollows(ids);
  const fallbacks = useAssociationFallbacks(ids);

  useEffect(() => {
    (async () => {
      const [{ data }, events] = await Promise.all([
        db.from("associations").select("id, name, description, logo_path, cover_path, instagram, website, school_id, status, created_at, schools(name)")
          .eq("status", "active").order("name"),
        fetchVisibleEvents(),
      ]);
      const counts: Record<string, number> = {};
      for (const e of events) if (e.association_id && !isPastEvent(e.starts_at)) counts[e.association_id] = (counts[e.association_id] ?? 0) + 1;
      setAssociations((data as PublicAssociation[] | null) ?? []);
      setUpcoming(counts);
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return associations
      .filter((a) => filter === "all" || (filter === "mine" ? follows.following.has(a.id) : a.school_id === schoolId))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.schools?.name ?? "").toLowerCase().includes(q))
      // Mon école d'abord, puis les plus suivies, puis les plus actives.
      .sort((a, b) =>
        Number(b.school_id === schoolId) - Number(a.school_id === schoolId)
        || (follows.counts[b.id] ?? 0) - (follows.counts[a.id] ?? 0)
        || (upcoming[b.id] ?? 0) - (upcoming[a.id] ?? 0)
        || a.name.localeCompare(b.name, "fr"));
  }, [associations, query, filter, follows.following, follows.counts, upcoming, schoolId]);

  // Pagination : 12 associations par page (3 lignes de 4 sur grand écran).
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [query, filter]);
  const goTo = (p: number) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const tabs: { value: Filter; label: string; show: boolean }[] = [
    { value: "all", label: "Toutes", show: true },
    { value: "mine", label: `Mes abonnements (${follows.following.size})`, show: true },
    { value: "school", label: "Mon école", show: !!schoolId },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="md:sr-only">Associations</h1>
        <p className="text-muted-foreground">Découvre les assos, abonne-toi et ne rate plus aucun de leurs événements.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.value} type="button" onClick={() => setFilter(t.value)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une asso ou une école" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filter === "mine" ? "Tu ne suis encore aucune association." : "Aucune association ne correspond."}
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageItems.map((a) => {
            const followers = follows.counts[a.id] ?? 0;
            const next = upcoming[a.id] ?? 0;
            return (
              <Link key={a.id} to="/associations/$associationId" params={{ associationId: a.id }} className="tap block rounded-[var(--radius-carte)]">
                <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-carte)] border border-bordure bg-blanc shadow-[var(--ombre-carte)] transition-shadow hover:shadow-[var(--ombre-menu)]">
                  {/* Bannière : photo de couverture de l'asso, sinon dégradé bordeaux */}
                  <div className="relative h-28 shrink-0 bg-gradient-vibrant">
                    {associationCoverUrl(a.cover_path)
                      ? <img src={associationCoverUrl(a.cover_path)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <img src="/plav-cocotte.svg" alt="" className="absolute -right-4 -top-6 h-32 w-32 opacity-15" />}
                  </div>
                  {/* Logo centré, à cheval sur la bannière */}
                  <div className="relative z-10 -mt-12 flex justify-center">
                    <AssociationAvatar name={a.name} logoPath={a.logo_path} fallback={fallbacks[a.id]}
                      className="!h-24 !w-24 !rounded-full text-2xl ring-4 ring-blanc shadow-[var(--ombre-carte)]" />
                  </div>
                  <div className="flex flex-1 flex-col items-center gap-2 px-5 pb-5 pt-3 text-center">
                    <h3 className="t-titre-3 line-clamp-2 text-encre group-hover:text-bordeaux-600">{a.name}</h3>
                    {a.schools?.name && (
                      <p className="flex items-center gap-1.5 t-legende text-gris-chaud"><GraduationCap className="h-4 w-4" />{a.schools.name}</p>
                    )}
                    {a.description && <p className="line-clamp-2 text-sm leading-snug text-gris-chaud">{a.description}</p>}
                    <div className="mt-auto flex w-full flex-col gap-3 pt-3">
                      <div className="flex items-center justify-center gap-5 border-t border-bordure pt-3 t-legende text-gris-chaud">
                        <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /><strong className="text-encre">{followers}</strong> abonné{followers > 1 ? "s" : ""}</span>
                        <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><strong className="text-encre">{next}</strong> à venir</span>
                      </div>
                      <FollowButton following={follows.following.has(a.id)} onToggle={() => follows.toggle(a.id, a.name)} className="w-full" />
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
        {pageCount > 1 && (
          <nav aria-label="Pages des associations" className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => goTo(current - 1)} disabled={current === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" />Précédent
            </Button>
            <span className="rounded-full bg-blanc px-3 py-1 text-sm text-encre">Page {current + 1} sur {pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => goTo(current + 1)} disabled={current >= pageCount - 1}>
              Suivant<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </nav>
        )}
        </>
      )}
    </div>
  );
}
