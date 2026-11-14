import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, ChevronLeft, Globe, GraduationCap, History, Instagram, Loader2, Newspaper, Pencil, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Monogram } from "@/components/SchoolAdminShell";
import { associationImage, useAssociationFallbacks } from "@/components/AssociationLogo";
import { EventMiniCard, FollowButton, FollowHint, PostCard, PostComposer } from "@/components/social/SocialBits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage } from "@/lib/schools";
import { isPastEvent } from "@/lib/event-dates";
import { fetchVisibleEvents, POST_SELECT, useFollows, usePostLikes, type FeedEvent, type Post, type PublicAssociation } from "@/lib/social";

export const Route = createFileRoute("/associations/$associationId")({
  component: () => (
    <ProtectedLayout>
      <AssociationPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Association — Plav'" }] }),
});

const PROFILE_ERRORS: Record<string, string> = {
  invalid_instagram: "Nom Instagram invalide (lettres, chiffres, points et _ uniquement).",
  invalid_website: "Adresse du site invalide.",
};

function AssociationPage() {
  const { associationId } = Route.useParams();
  const { user, role, associationId: myAssociationId, membershipStatus } = useAuth();
  const [association, setAssociation] = useState<PublicAssociation | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const fallback = useAssociationFallbacks([associationId])[associationId];
  const follows = useFollows([associationId]);
  const likes = usePostLikes(posts.map((p) => p.id));

  // Organisateur validé de l'association (ou admin) : publie et modifie la page.
  const canPost = role === "admin" || (role === "organizer" && myAssociationId === associationId && membershipStatus === "approved");

  const loadPosts = useCallback(async () => {
    const { data } = await db.from("association_posts").select(POST_SELECT)
      .eq("association_id", associationId).order("created_at", { ascending: false }).limit(50);
    setPosts((data as Post[] | null) ?? []);
  }, [associationId]);

  const load = useCallback(async () => {
    const [{ data: a }, visible, manage] = await Promise.all([
      db.from("associations").select("id, name, description, logo_path, instagram, website, school_id, status, created_at, schools(name)")
        .eq("id", associationId).maybeSingle(),
      fetchVisibleEvents(),
      user ? db.rpc("can_manage_association", { _association_id: associationId }) : Promise.resolve({ data: false }),
      loadPosts(),
    ]);
    setAssociation((a as PublicAssociation | null) ?? null);
    setEvents(visible.filter((e) => e.association_id === associationId));
    setCanManage(manage.data === true);
    setLoading(false);
  }, [associationId, user, loadPosts]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (association) document.title = `${association.name} — Plav'`;
  }, [association]);

  const upcoming = useMemo(() => events.filter((e) => !isPastEvent(e.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events]);
  const past = useMemo(() => events.filter((e) => isPastEvent(e.starts_at)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)), [events]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!association) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <p className="text-lg font-semibold">Association introuvable</p>
        <p className="mt-1 text-sm text-muted-foreground">Elle n'existe pas ou n'est pas encore validée par son école.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/associations">Voir les associations</Link></Button>
      </div>
    );
  }

  const following = follows.following.has(associationId);
  const followers = follows.counts[associationId] ?? 0;
  const logo = associationImage(association.logo_path, fallback);
  const isOwnPage = canPost && role === "organizer";

  const about = (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">À propos</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {association.description
          ? <p className="whitespace-pre-wrap leading-relaxed">{association.description}</p>
          : <p className="text-muted-foreground">{canPost ? "Ajoute une description pour présenter ton association." : "Pas encore de description."}</p>}
        <div className="space-y-1.5 text-muted-foreground">
          {association.schools?.name && <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4" />{association.schools.name}</p>}
          {association.instagram && (
            <a href={`https://instagram.com/${association.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary">
              <Instagram className="h-4 w-4" />@{association.instagram}
            </a>
          )}
          {association.website && (
            <a href={association.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate hover:text-primary">
              <Globe className="h-4 w-4 shrink-0" /><span className="truncate">{association.website.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
          <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Sur Plav' depuis {format(new Date(association.created_at), "MMMM yyyy", { locale: fr })}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/associations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronLeft className="h-4 w-4" />Associations
      </Link>

      {/* En-tête façon profil */}
      <Card className="overflow-hidden">
        <div className="relative h-28 bg-gradient-to-r from-[#6B1A2F] via-[#8A2B44] to-[#E8B22E] md:h-40">
          <img src="/plav-cocotte.svg" alt="" className="absolute -right-6 -top-8 h-48 w-48 opacity-15 md:h-64 md:w-64" />
        </div>
        <CardContent className="relative px-5 pb-5 md:px-8">
          <div className="-mt-12 flex flex-col gap-4 md:-mt-14 md:flex-row md:items-end">
            <Monogram name={association.name} src={logo} size="lg" className="!rounded-full border-4 border-card shadow-lg md:!h-28 md:!w-28" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-bold leading-tight text-primary md:text-4xl">{association.name}</h1>
              {association.schools?.name && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground"><GraduationCap className="h-4 w-4" />{association.schools.name}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canPost || canManage ? (
                <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" />Modifier la page</Button>
              ) : null}
              {canManage && role === "school_admin" && (
                <Button asChild variant="ghost"><Link to="/school-admin/associations/$associationId" params={{ associationId }}><Settings2 className="mr-1.5 h-4 w-4" />Fiche école</Link></Button>
              )}
              {!isOwnPage && <FollowButton following={following} onToggle={() => follows.toggle(associationId, association.name)} />}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><strong className="text-base">{followers}</strong> <span className="text-muted-foreground">abonné{followers > 1 ? "s" : ""}</span></span>
            <span><strong className="text-base">{upcoming.length}</strong> <span className="text-muted-foreground">à venir</span></span>
            <span><strong className="text-base">{past.length}</strong> <span className="text-muted-foreground">passé{past.length > 1 ? "s" : ""}</span></span>
            <span><strong className="text-base">{posts.length}</strong> <span className="text-muted-foreground">actualité{posts.length > 1 ? "s" : ""}</span></span>
            {!isOwnPage && <span className="md:ml-auto"><FollowHint following={following} /></span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue={upcoming.length || !posts.length ? "upcoming" : "news"} className="min-w-0">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="upcoming"><CalendarClock className="mr-1.5 h-4 w-4" />À venir ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="news"><Newspaper className="mr-1.5 h-4 w-4" />Actualités</TabsTrigger>
            <TabsTrigger value="past"><History className="mr-1.5 h-4 w-4" />Passés</TabsTrigger>
            <TabsTrigger value="about" className="lg:hidden">À propos</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.length === 0
              ? <Empty text="Aucun événement à venir pour l'instant." hint={!following && !isOwnPage ? "Abonne-toi pour être prévenu du prochain." : undefined} />
              : upcoming.map((e) => <EventMiniCard key={e.id} event={e} />)}
          </TabsContent>

          <TabsContent value="news" className="space-y-4">
            {canPost && (
              <PostComposer associationId={associationId} associationName={association.name} logoPath={association.logo_path}
                fallbackLogo={fallback} events={upcoming} onPosted={loadPosts} />
            )}
            {posts.length === 0
              ? <Empty text="Pas encore d'actualité." hint={canPost ? "Partage une photo, une annonce ou un événement à venir." : undefined} />
              : posts.map((p) => (
                <PostCard key={p.id} post={p} fallbackLogo={fallback} likes={likes.counts[p.id] ?? 0} liked={likes.mine.has(p.id)}
                  onLike={() => likes.toggle(p.id)} canDelete={canPost || canManage || p.author_id === user?.id} onDeleted={loadPosts} />
              ))}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0
              ? <Empty text="Aucun événement passé." />
              : past.map((e) => <EventMiniCard key={e.id} event={e} past />)}
          </TabsContent>

          <TabsContent value="about" className="lg:hidden">{about}</TabsContent>
        </Tabs>

        <aside className="hidden space-y-4 lg:block">
          {about}
          {upcoming[0] && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Prochain événement</CardTitle></CardHeader>
              <CardContent><EventMiniCard event={upcoming[0]} /></CardContent>
            </Card>
          )}
        </aside>
      </div>

      <EditProfileDialog open={editing} onOpenChange={setEditing} association={association}
        onSaved={(a) => setAssociation({ ...association, ...a })} />
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <Card className="border-2 border-dashed">
      <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
        <Users className="mb-1 h-8 w-8 text-primary/40" />
        <p className="font-medium">{text}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EditProfileDialog({ open, onOpenChange, association, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  association: PublicAssociation;
  onSaved: (a: Partial<PublicAssociation>) => void;
}) {
  const [description, setDescription] = useState(association.description ?? "");
  const [instagram, setInstagram] = useState(association.instagram ?? "");
  const [website, setWebsite] = useState(association.website ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescription(association.description ?? "");
    setInstagram(association.instagram ?? "");
    setWebsite(association.website ?? "");
  }, [open, association]);

  async function save() {
    setSaving(true);
    const { error } = await db.rpc("update_association_profile", {
      _association_id: association.id, _description: description, _instagram: instagram, _website: website,
    });
    if (error) {
      setSaving(false);
      const key = Object.keys(PROFILE_ERRORS).find((k) => error.message.includes(k));
      toast.error(key ? PROFILE_ERRORS[key] : schoolErrorMessage(error.message));
      return;
    }
    // Relecture : le serveur nettoie les valeurs (@, https://…).
    const { data } = await db.from("associations").select("description, instagram, website").eq("id", association.id).maybeSingle();
    setSaving(false);
    onSaved(data ?? {});
    onOpenChange(false);
    toast.success("Page mise à jour.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier la page</DialogTitle>
          <DialogDescription>Ce que les étudiants voient sur la page de {association.name}. Le logo se change dans Paramètres.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={5} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Qui êtes-vous, que faites-vous, comment vous rejoindre…" />
            <p className="text-right text-xs text-muted-foreground">{description.length}/1000</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="insta">Instagram</Label>
              <Input id="insta" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@monasso" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site">Site web</Label>
              <Input id="site" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="monasso.fr" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
