import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Compass, Loader2, Newspaper, Sparkles } from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { useAssociationFallbacks } from "@/components/AssociationLogo";
import { AssociationAvatar, EventMiniCard, FollowButton, PostCard, timeAgo } from "@/components/social/SocialBits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/schools";
import { isPastEvent } from "@/lib/event-dates";
import { fetchVisibleEvents, POST_SELECT, useFollows, usePostLikes, type FeedEvent, type Post, type PublicAssociation } from "@/lib/social";

export const Route = createFileRoute("/feed")({
  component: () => (
    <ProtectedLayout allow={["participant"]}>
      <Feed />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Fil d'actu — Plav'" }] }),
});

type Item =
  | { kind: "post"; at: string; post: Post }
  | { kind: "event"; at: string; event: FeedEvent };

function Feed() {
  const { user, schoolId, associationId: myAssociation, membershipStatus } = useAuth();
  const [associations, setAssociations] = useState<PublicAssociation[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const follows = useFollows(associations.map((a) => a.id));
  const fallbacks = useAssociationFallbacks(associations.map((a) => a.id));

  // Associations suivies + la sienne (organisateur validé).
  const followedIds = useMemo(() => {
    const ids = new Set(follows.following);
    if (myAssociation && membershipStatus === "approved") ids.add(myAssociation);
    return [...ids];
  }, [follows.following, myAssociation, membershipStatus]);
  const followedKey = [...followedIds].sort().join(",");

  useEffect(() => {
    (async () => {
      const [{ data }, visible] = await Promise.all([
        db.from("associations").select("id, name, description, logo_path, instagram, website, school_id, status, created_at, schools(name)")
          .eq("status", "active").order("name"),
        fetchVisibleEvents(),
      ]);
      setAssociations((data as PublicAssociation[] | null) ?? []);
      setEvents(visible);
    })();
  }, []);

  const loadPosts = useCallback(async () => {
    const ids = followedKey ? followedKey.split(",") : [];
    if (!ids.length) { setPosts([]); setLoading(false); return; }
    const { data } = await db.from("association_posts").select(POST_SELECT)
      .in("association_id", ids).order("created_at", { ascending: false }).limit(60);
    setPosts((data as Post[] | null) ?? []);
    setLoading(false);
  }, [followedKey]);

  useEffect(() => { if (follows.ready) loadPosts(); }, [follows.ready, loadPosts]);

  // Fil : actualités + nouveaux événements à venir des associations suivies, du plus récent au plus ancien.
  const items = useMemo<Item[]>(() => {
    const ids = new Set(followedIds);
    const evs: Item[] = events
      .filter((e) => e.association_id && ids.has(e.association_id) && !isPastEvent(e.starts_at))
      .map((e) => ({ kind: "event", at: e.created_at, event: e }));
    const ps: Item[] = posts.map((p) => ({ kind: "post", at: p.created_at, post: p }));
    return [...ps, ...evs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
  }, [posts, events, followedIds]);

  const likes = usePostLikes(posts.map((p) => p.id));
  const byId = useMemo(() => Object.fromEntries(associations.map((a) => [a.id, a])), [associations]);

  // Suggestions : associations non suivies, de mon école d'abord, puis les plus actives.
  const suggestions = useMemo(() => {
    const upcoming: Record<string, number> = {};
    for (const e of events) if (e.association_id && !isPastEvent(e.starts_at)) upcoming[e.association_id] = (upcoming[e.association_id] ?? 0) + 1;
    return associations
      .filter((a) => !follows.following.has(a.id) && a.id !== myAssociation)
      .sort((a, b) => Number(b.school_id === schoolId) - Number(a.school_id === schoolId)
        || (upcoming[b.id] ?? 0) - (upcoming[a.id] ?? 0) || (follows.counts[b.id] ?? 0) - (follows.counts[a.id] ?? 0))
      .slice(0, 6);
  }, [associations, events, follows.following, follows.counts, myAssociation, schoolId]);

  const followed = associations.filter((a) => follows.following.has(a.id));

  const suggestionList = (
    <ul className="space-y-3">
      {suggestions.map((a) => (
        <li key={a.id} className="flex items-center gap-3">
          <Link to="/associations/$associationId" params={{ associationId: a.id }} className="flex min-w-0 flex-1 items-center gap-3">
            <AssociationAvatar name={a.name} logoPath={a.logo_path} fallback={fallbacks[a.id]} className="!h-10 !w-10 !rounded-full text-xs" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold hover:text-primary">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.schools?.name}</span>
            </span>
          </Link>
          <FollowButton size="sm" following={false} onToggle={() => follows.toggle(a.id, a.name)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fil d'actu</h1>
          <p className="text-muted-foreground">Les nouveautés des associations que tu suis.</p>
        </div>

        {loading || !follows.ready ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : followedIds.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="space-y-5 py-8">
              <div className="text-center">
                <Sparkles className="mx-auto mb-2 h-9 w-9 text-primary/60" />
                <p className="text-lg font-semibold">Ton fil est vide pour l'instant</p>
                <p className="text-sm text-muted-foreground">Abonne-toi à des associations pour voir leurs actus et leurs nouveaux événements ici.</p>
              </div>
              {suggestions.length > 0 && <div className="mx-auto max-w-md">{suggestionList}</div>}
              <div className="text-center">
                <Button asChild variant="outline"><Link to="/associations"><Compass className="mr-2 h-4 w-4" />Découvrir toutes les associations</Link></Button>
              </div>
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Newspaper className="mx-auto mb-2 h-8 w-8 text-primary/40" />
              Rien de neuf pour l'instant chez tes associations.
            </CardContent>
          </Card>
        ) : (
          items.map((it) => it.kind === "post" ? (
            <PostCard key={`p-${it.post.id}`} post={it.post} fallbackLogo={fallbacks[it.post.association_id]}
              likes={likes.counts[it.post.id] ?? 0} liked={likes.mine.has(it.post.id)} onLike={() => likes.toggle(it.post.id)}
              canDelete={it.post.author_id === user?.id} onDeleted={loadPosts} />
          ) : (
            <Card key={`e-${it.event.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  {it.event.association_id && byId[it.event.association_id] && (
                    <Link to="/associations/$associationId" params={{ associationId: it.event.association_id }}>
                      <AssociationAvatar name={byId[it.event.association_id].name} logoPath={byId[it.event.association_id].logo_path}
                        fallback={fallbacks[it.event.association_id]} className="!h-10 !w-10 !rounded-full text-xs" />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      {it.event.association_id
                        ? <Link to="/associations/$associationId" params={{ associationId: it.event.association_id }} className="font-semibold hover:text-primary hover:underline">{it.event.association}</Link>
                        : <span className="font-semibold">{it.event.association}</span>}
                      {" "}<span className="text-muted-foreground">a publié un événement</span>
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarPlus className="h-3.5 w-3.5" />{timeAgo(it.event.created_at)}</p>
                  </div>
                </div>
                <EventMiniCard event={it.event} />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <aside className="hidden space-y-4 lg:block">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Mes abonnements ({followed.length})</CardTitle></CardHeader>
          <CardContent>
            {followed.length === 0 ? <p className="text-sm text-muted-foreground">Aucun pour l'instant.</p> : (
              <ul className="space-y-2.5">
                {followed.map((a) => (
                  <li key={a.id}>
                    <Link to="/associations/$associationId" params={{ associationId: a.id }} className="flex items-center gap-3 hover:text-primary">
                      <AssociationAvatar name={a.name} logoPath={a.logo_path} fallback={fallbacks[a.id]} className="!h-9 !w-9 !rounded-full text-[11px]" />
                      <span className="truncate text-sm font-medium">{a.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {suggestions.length > 0 && followedIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Suggestions</CardTitle></CardHeader>
            <CardContent>{suggestionList}</CardContent>
          </Card>
        )}
        <Button asChild variant="outline" className="w-full"><Link to="/associations"><Compass className="mr-2 h-4 w-4" />Toutes les associations</Link></Button>
      </aside>
    </div>
  );
}
