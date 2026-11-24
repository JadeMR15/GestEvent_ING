import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar, CalendarClock, Camera, ChevronLeft, Eye, Globe, GraduationCap, History, Images, Info, Instagram, Loader2,
  Newspaper, Pencil, Settings2, Share2, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Monogram } from "@/components/SchoolAdminShell";
import { associationCoverUrl, associationImage, checkCoverFile, saveAssociationCover, useAssociationFallbacks } from "@/components/AssociationLogo";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { AlbumsSection } from "@/components/albums/AlbumBits";
import { EmptyState } from "@/components/EmptyState";
import { UserAvatar } from "@/components/UserAvatar";
import { EventMiniCard, EventTile, FollowButton, FollowHint, PostCard, PostComposer } from "@/components/social/SocialBits";
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
import { fetchVisibleEvents, POST_SELECT, postImageUrl, useFollows, usePostLikes, type FeedEvent, type Post, type PublicAssociation } from "@/lib/social";

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

type Association = PublicAssociation & { cover_path?: string | null };
type Member = { id: string; full_name: string | null; avatar_path: string | null };

// Onglets soulignés (bordeaux sur l'onglet actif).
const TAB = "relative h-11 shrink-0 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-1 text-[15px] font-semibold text-gris-chaud shadow-none data-[state=active]:border-bordeaux-600 data-[state=active]:bg-transparent data-[state=active]:text-bordeaux-600 data-[state=active]:shadow-none [&_svg]:size-5";

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="rounded-[var(--radius-pilule)] bg-bordeaux-100 px-2 text-xs font-bold leading-5 text-bordeaux-600">{n}</span> : null;
}

function AssociationPage() {
  const { associationId } = Route.useParams();
  const { user, role, associationId: myAssociationId, membershipStatus } = useAuth();
  const [association, setAssociation] = useState<Association | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
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
    const [{ data: a }, visible, manage, { data: members }] = await Promise.all([
      db.from("associations").select("id, name, description, logo_path, cover_path, instagram, website, school_id, status, created_at, schools(name)")
        .eq("id", associationId).maybeSingle(),
      fetchVisibleEvents(),
      user ? db.rpc("can_manage_association", { _association_id: associationId }) : Promise.resolve({ data: false }),
      // Équipe : organisateurs validés de l'association.
      db.from("profiles").select("id, full_name, avatar_path").eq("association_id", associationId).eq("membership_status", "approved").limit(24),
      loadPosts(),
    ]);
    setAssociation((a as Association | null) ?? null);
    setEvents(visible.filter((e) => e.association_id === associationId));
    setCanManage(manage.data === true);
    setTeam((members as Member[] | null) ?? []);
    setLoading(false);
  }, [associationId, user, loadPosts]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (association) document.title = `${association.name} — Plav'`;
  }, [association]);

  const upcoming = useMemo(() => events.filter((e) => !isPastEvent(e.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events]);
  const past = useMemo(() => events.filter((e) => isPastEvent(e.starts_at)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)), [events]);

  async function changeCover(blob: Blob | null) {
    if (!association) return;
    setCoverFile(null);
    setCoverBusy(true);
    try {
      const path = await saveAssociationCover(association.id, blob, association.cover_path);
      setAssociation({ ...association, cover_path: path });
      toast.success(blob ? "Photo de couverture mise à jour." : "Photo de couverture retirée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: association?.name ?? "Plav'", url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Lien de la page copié.");
    } catch { /* partage annulé */ }
  }

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

  // Le réseau (abonnements) est réservé aux participants. L'organisateur ne voit que la page
  // de son association (pour l'animer), l'école celles de ses associations (modération).
  const isParticipant = role === "participant";
  const allowed = isParticipant || role === "admin" || canPost || canManage;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <p className="text-lg font-semibold">Page réservée aux étudiants</p>
        <p className="mt-1 text-sm text-muted-foreground">Ton espace organisateur te donne accès à la page de ta propre association.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/dashboard">Retour au tableau de bord</Link></Button>
      </div>
    );
  }

  const following = follows.following.has(associationId);
  const followers = follows.counts[associationId] ?? 0;
  const logo = associationImage(association.logo_path, fallback);
  const cover = associationCoverUrl(association.cover_path);
  const isOwnPage = canPost && role === "organizer";
  const next = upcoming[0];
  const daysToNext = next ? differenceInCalendarDays(new Date(next.starts_at), new Date()) : null;

  const stats = [
    { n: followers, label: `abonné${followers > 1 ? "s" : ""}` },
    { n: upcoming.length, label: "à venir" },
    { n: past.length, label: `passé${past.length > 1 ? "s" : ""}` },
    { n: posts.length, label: `actualité${posts.length > 1 ? "s" : ""}` },
  ];

  const about = (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="t-sous-titre text-encre">À propos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {association.description
          ? <p className="t-corps whitespace-pre-wrap text-encre">{association.description}</p>
          : <p className="t-corps text-gris-chaud">{canPost ? "Ajoute une description pour présenter ton association." : "Pas encore de description."}</p>}
        <ul className="space-y-2.5 border-t border-bordure pt-4 t-legende text-gris-chaud">
          {association.schools?.name && <li className="flex items-center gap-2"><GraduationCap className="h-4 w-4 shrink-0" />{association.schools.name}</li>}
          {association.instagram && (
            <li>
              <a href={`https://instagram.com/${association.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-bordeaux-600">
                <Instagram className="h-4 w-4 shrink-0" />@{association.instagram}
              </a>
            </li>
          )}
          {association.website && (
            <li>
              <a href={association.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-bordeaux-600">
                <Globe className="h-4 w-4 shrink-0" /><span className="truncate">{association.website.replace(/^https?:\/\//, "")}</span>
              </a>
            </li>
          )}
          <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0" />Sur Plav' depuis {format(new Date(association.created_at), "MMMM yyyy", { locale: fr })}</li>
        </ul>
      </CardContent>
    </Card>
  );

  const teamCard = team.length > 0 && (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="t-sous-titre text-encre">L'équipe</CardTitle></CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <UserAvatar path={m.avatar_path} name={m.full_name} size="md" />
              <span className="t-corps-fort truncate text-encre">{m.full_name || "Organisateur"}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isParticipant ? (
          <Link to="/associations" className="inline-flex items-center gap-1 t-legende text-gris-chaud hover:text-bordeaux-600">
            <ChevronLeft className="h-4 w-4" />Associations
          </Link>
        ) : role === "school_admin" ? (
          <Link to="/school-admin/associations/$associationId" params={{ associationId }} className="inline-flex items-center gap-1 t-legende text-gris-chaud hover:text-bordeaux-600">
            <ChevronLeft className="h-4 w-4" />Fiche de l'association
          </Link>
        ) : (
          <Link to="/dashboard" className="inline-flex items-center gap-1 t-legende text-gris-chaud hover:text-bordeaux-600">
            <ChevronLeft className="h-4 w-4" />Tableau de bord
          </Link>
        )}

        {/* Aperçu (organisateur, école) : information discrète */}
        {!isParticipant && (
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pilule)] bg-statut-bleu-100 py-1.5 pl-3 pr-4 text-[13px] font-semibold text-statut-bleu-700">
            <Eye className="h-4 w-4" />
            {isOwnPage
              ? `Aperçu de ta page publique · ${followers} abonné${followers > 1 ? "s" : ""} prévenu${followers > 1 ? "s" : ""} à chaque nouveauté`
              : role === "school_admin" ? "Aperçu de la page publique · modération des actualités" : "Aperçu de la page publique"}
          </span>
        )}
      </div>

      {/* En-tête : photo de couverture, logo et nom centrés */}
      <section className="overflow-hidden rounded-[var(--radius-carte)] border border-bordure bg-blanc shadow-[var(--ombre-carte)]">
        <div className="relative h-60 bg-gradient-vibrant md:h-80">
          {cover
            ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <img src="/plav-cocotte.svg" alt="" className="absolute -right-10 -top-12 h-72 w-72 opacity-15 md:h-96 md:w-96" />}
          {/* Léger dégradé en bas : le logo se détache de la photo */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(49,13,23,0)_55%,rgba(49,13,23,0.35))]" />

          {canManage && (
            <div className="absolute right-3 top-3 flex gap-2">
              <Button size="sm" variant="outlineLight" disabled={coverBusy} onClick={() => coverInput.current?.click()}
                className="bg-bordeaux-900/40 backdrop-blur">
                {coverBusy ? <Loader2 className="animate-spin" /> : <Camera />}
                {cover ? "Changer la couverture" : "Ajouter une couverture"}
              </Button>
              {cover && (
                <Button size="icon" variant="outlineLight" disabled={coverBusy} onClick={() => changeCover(null)}
                  className="bg-bordeaux-900/40 backdrop-blur" aria-label="Retirer la couverture">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  const err = checkCoverFile(f);
                  if (err) toast.error(err); else setCoverFile(f);
                }} />
            </div>
          )}

        </div>

        {/* Logo centré, à cheval sur la couverture, puis le nom en grand */}
        <div className="relative z-10 -mt-20 flex flex-col items-center px-5 pb-6 text-center md:-mt-24 md:px-8">
          <Monogram name={association.name} src={logo} size="lg" fill
            className="!h-36 !w-36 !rounded-full text-5xl ring-[6px] ring-blanc shadow-[var(--ombre-menu)] md:!h-44 md:!w-44" />
          <h1 className="mt-4 text-encre max-md:text-[28px]">{association.name}</h1>
          {association.schools?.name && (
            <p className="mt-1 flex items-center gap-1.5 t-corps-fort text-gris-chaud"><GraduationCap className="h-5 w-5" />{association.schools.name}</p>
          )}

          <dl className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {stats.map((s, i) => (
              <div key={s.label} className={`flex items-baseline gap-1.5 ${i > 0 ? "sm:border-l sm:border-bordure sm:pl-6" : ""}`}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-black text-bordeaux-600">{s.n}</dd>
                <span className="t-legende text-gris-chaud">{s.label}</span>
              </div>
            ))}
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {isParticipant && <FollowButton following={following} onToggle={() => follows.toggle(associationId, association.name)} />}
            <Button variant="outline" onClick={share}><Share2 />Partager</Button>
            {(canPost || canManage) && (
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil />Modifier la page</Button>
            )}
            {canManage && role === "school_admin" && (
              <Button asChild variant="ghost"><Link to="/school-admin/associations/$associationId" params={{ associationId }}><Settings2 />Fiche école</Link></Button>
            )}
          </div>
        </div>
        {isParticipant && <div className="flex justify-center border-t border-bordure px-5 py-2.5 md:px-8"><FollowHint following={following} /></div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Tabs defaultValue={upcoming.length || !posts.length ? "upcoming" : "news"} className="min-w-0">
          <TabsList className="no-scrollbar h-auto w-full justify-start gap-6 overflow-x-auto rounded-[var(--radius-carte)] border border-bordure bg-blanc px-5 py-0 shadow-[var(--ombre-carte)]">
            <TabsTrigger value="upcoming" className={TAB}><Calendar />À venir<Count n={upcoming.length} /></TabsTrigger>
            <TabsTrigger value="news" className={TAB}><Newspaper />Actualités<Count n={posts.length} /></TabsTrigger>
            <TabsTrigger value="photos" className={TAB}><Images />Photos</TabsTrigger>
            <TabsTrigger value="past" className={TAB}><History />Passés<Count n={past.length} /></TabsTrigger>
            <TabsTrigger value="about" className={`${TAB} lg:hidden`}><Info />À propos</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-5">
            {upcoming.length === 0
              ? <Card><EmptyState title="Aucun événement à venir pour l'instant." message={!following && isParticipant ? "Abonne-toi pour être prévenu du prochain." : undefined} /></Card>
              : <div className="grid gap-4 sm:grid-cols-2">{upcoming.map((e) => <EventTile key={e.id} event={e} />)}</div>}
          </TabsContent>

          <TabsContent value="news" className="mt-5 space-y-4">
            {canPost && (
              <PostComposer associationId={associationId} associationName={association.name} logoPath={association.logo_path}
                fallbackLogo={fallback} events={upcoming} onPosted={loadPosts} />
            )}
            {posts.length === 0
              ? <Card><EmptyState title="Pas encore d'actualité." message={canPost ? "Partage une photo, une annonce ou un événement à venir." : undefined} /></Card>
              : posts.map((p) => (
                <PostCard key={p.id} post={p} fallbackLogo={fallback} likes={likes.counts[p.id] ?? 0} liked={likes.mine.has(p.id)}
                  onLike={() => likes.toggle(p.id)} canDelete={canPost || canManage || p.author_id === user?.id} onDeleted={loadPosts} />
              ))}
          </TabsContent>

          <TabsContent value="photos" className="mt-5">
            {/* Albums photo par soirée, déposés par l'équipe de l'association */}
            <AlbumsSection associationId={associationId} canPost={canPost} events={[...upcoming, ...past]} />
          </TabsContent>

          <TabsContent value="past" className="mt-5">
            {past.length === 0
              ? <Card><EmptyState title="Aucun événement passé." /></Card>
              : <div className="grid gap-4 sm:grid-cols-2">{past.map((e) => <EventTile key={e.id} event={e} past />)}</div>}
          </TabsContent>

          <TabsContent value="about" className="mt-5 space-y-4 lg:hidden">{about}{teamCard}</TabsContent>
        </Tabs>

        <aside className="hidden space-y-4 lg:block">
          {next && (
            <Card className="overflow-hidden border-bordeaux-600 bg-bordeaux-600">
              <CardContent className="space-y-3 p-5">
                <p className="t-surtitre text-bordeaux-200">Prochain événement</p>
                <p className="font-display text-[28px] font-black leading-tight text-jaune-300">
                  {daysToNext === 0 ? "Aujourd'hui" : daysToNext === 1 ? "Demain" : `Dans ${daysToNext} jours`}
                </p>
                <EventMiniCard event={next} className="border-bordeaux-700" />
              </CardContent>
            </Card>
          )}
          {about}
          {teamCard}
          {team.length === 0 && canPost && (
            <p className="flex items-center gap-2 t-legende text-gris-chaud"><Users className="h-4 w-4" />L'équipe apparaît ici quand les organisateurs sont validés par l'école.</p>
          )}
        </aside>
      </div>

      <ImageCropDialog file={coverFile} aspect={3} outputWidth={1920} title="Recadrer la photo de couverture"
        description="Place la partie importante au centre : sur téléphone, les côtés de la bannière sont coupés."
        onCancel={() => setCoverFile(null)} onConfirm={changeCover} />


      <EditProfileDialog open={editing} onOpenChange={setEditing} association={association}
        onSaved={(a) => setAssociation({ ...association, ...a })} />
    </div>
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
