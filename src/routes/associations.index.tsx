import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, GraduationCap, Loader2, Search, Users } from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { useAssociationFallbacks } from "@/components/AssociationLogo";
import { AssociationAvatar, FollowButton } from "@/components/social/SocialBits";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/schools";
import { isPastEvent } from "@/lib/event-dates";
import { fetchVisibleEvents, useFollows, type PublicAssociation } from "@/lib/social";

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
  const ids = associations.map((a) => a.id);
  const follows = useFollows(ids);
  const fallbacks = useAssociationFallbacks(ids);

  useEffect(() => {
    (async () => {
      const [{ data }, events] = await Promise.all([
        db.from("associations").select("id, name, description, logo_path, instagram, website, school_id, status, created_at, schools(name)")
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

  const tabs: { value: Filter; label: string; show: boolean }[] = [
    { value: "all", label: "Toutes", show: true },
    { value: "mine", label: `Mes abonnements (${follows.following.size})`, show: true },
    { value: "school", label: "Mon école", show: !!schoolId },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Associations</h1>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => {
            const followers = follows.counts[a.id] ?? 0;
            const next = upcoming[a.id] ?? 0;
            return (
              <Link key={a.id} to="/associations/$associationId" params={{ associationId: a.id }} className="tap block">
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="h-14 bg-gradient-to-r from-[#6B1A2F] via-[#8A2B44] to-[#E8B22E] opacity-90" />
                  <CardContent className="-mt-8 flex h-[calc(100%-3.5rem)] flex-col gap-3 p-4">
                    <div className="flex items-end justify-between gap-2">
                      <AssociationAvatar name={a.name} logoPath={a.logo_path} fallback={fallbacks[a.id]}
                        className="!h-16 !w-16 !rounded-full border-4 border-card shadow" />
                      <FollowButton size="sm" following={follows.following.has(a.id)} onToggle={() => follows.toggle(a.id, a.name)} />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-lg font-semibold group-hover:text-primary">{a.name}</p>
                      {a.schools?.name && <p className="flex items-center gap-1 text-xs text-muted-foreground"><GraduationCap className="h-3.5 w-3.5" />{a.schools.name}</p>}
                    </div>
                    <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{a.description || " "}</p>
                    <div className="flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /><strong className="text-foreground">{followers}</strong> abonné{followers > 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /><strong className="text-foreground">{next}</strong> à venir</span>
                    </div>
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
