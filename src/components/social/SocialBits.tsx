import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, Bell, BellRing, Calendar, Check, Heart, ImagePlus, Loader2, MapPin, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monogram } from "@/components/SchoolAdminShell";
import { associationImage } from "@/components/AssociationLogo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage } from "@/lib/schools";
import { cn } from "@/lib/utils";
import { POST_IMAGE_BUCKET, postImageUrl, uploadPostImage, type FeedEvent, type Post } from "@/lib/social";

/** « il y a 3 h », puis la date au-delà d'une semaine. */
export function timeAgo(iso: string) {
  const d = new Date(iso);
  if (Date.now() - d.getTime() > 7 * 24 * 3600_000) return format(d, "d MMM yyyy", { locale: fr });
  return `il y a ${formatDistanceToNowStrict(d, { locale: fr })}`;
}

export function FollowButton({ following, onToggle, size = "default", className }: {
  following: boolean;
  onToggle: () => void;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Button size={size} variant={following ? "outline" : "default"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className={cn(following && "group border-primary/30 text-primary", className)} aria-pressed={following}>
      {following ? (
        <>
          <Check className="mr-1.5 h-4 w-4 group-hover:hidden" /><X className="mr-1.5 hidden h-4 w-4 group-hover:inline" />
          <span className="group-hover:hidden">Abonné</span><span className="hidden group-hover:inline">Se désabonner</span>
        </>
      ) : (
        <><Plus className="mr-1.5 h-4 w-4" />Suivre</>
      )}
    </Button>
  );
}

/** Pastille de l'association (logo, sinon photo de l'organisateur, sinon initiales). */
export function AssociationAvatar({ name, logoPath, fallback, className = "" }: { name: string; logoPath?: string | null; fallback?: string; className?: string }) {
  return <Monogram name={name} src={associationImage(logoPath, fallback)} className={className} fill />;
}

/** Événement en carte compacte (page association, fil d'actualité). */
export function EventMiniCard({ event, past = false, className = "" }: { event: Pick<FeedEvent, "id" | "title" | "starts_at" | "cover_image_url" | "location" | "city"> & { price?: number | null }; past?: boolean; className?: string }) {
  const d = new Date(event.starts_at);
  const place = event.city ? `${event.city}${event.location ? ` — ${event.location}` : ""}` : event.location || "En ligne";
  return (
    <Link to="/events/$eventId" params={{ eventId: event.id }}
      className={cn("group flex gap-3 overflow-hidden rounded-2xl border bg-card p-2 pr-3 transition-shadow hover:shadow-md", past && "opacity-80", className)}>
      <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-vibrant">
        {event.cover_image_url
          ? <img src={event.cover_image_url} alt="" className={cn("h-full w-full object-cover", past && "grayscale-[40%]")} loading="lazy" />
          : <img src="/plav-cocotte.svg" alt="" className="absolute -bottom-3 -right-3 h-16 w-16 opacity-30" />}
        <span className="absolute left-1.5 top-1.5 rounded-[var(--radius-petit)] bg-blanc px-1.5 py-0.5 text-center text-xs font-bold leading-tight text-bordeaux-600 shadow-[var(--ombre-carte)]">
          {format(d, "d MMM", { locale: fr }).replace(".", "")}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">{event.title}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />{format(d, "EEE d MMM · HH'h'mm", { locale: fr })}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{place}</span>
        </p>
      </div>
      {event.price != null && !past && (
        <span className="self-start rounded-[var(--radius-petit)] bg-fond px-2.5 py-1 t-corps-fort text-bordeaux-600">
          {event.price > 0 ? `${Number(event.price).toFixed(2).replace(".", ",").replace(",00", "")} €` : "Gratuit"}
        </span>
      )}
    </Link>
  );
}

/** Une actualité : en-tête association, texte, photo, événement lié, « j'aime ». */
export function PostCard({ post, fallbackLogo, likes, liked, onLike, canDelete, onDeleted }: {
  post: Post;
  fallbackLogo?: string;
  likes: number;
  liked: boolean;
  onLike: () => void;
  canDelete?: boolean;
  onDeleted?: () => void;
}) {
  const name = post.associations?.name ?? "Association";
  const image = postImageUrl(post.image_path);
  const [expanded, setExpanded] = useState(false);
  const long = post.body.length > 420;

  async function remove() {
    if (!confirm("Supprimer cette actualité ?")) return;
    const { error } = await db.from("association_posts").delete().eq("id", post.id);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    if (post.image_path) await supabase.storage.from(POST_IMAGE_BUCKET).remove([post.image_path]);
    toast.success("Actualité supprimée.");
    onDeleted?.();
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-0">
        <div className="flex items-center gap-3 px-4 pt-4">
          <Link to="/associations/$associationId" params={{ associationId: post.association_id }}>
            <AssociationAvatar name={name} logoPath={post.associations?.logo_path} fallback={fallbackLogo} className="!h-10 !w-10 !rounded-full text-xs" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to="/associations/$associationId" params={{ associationId: post.association_id }} className="block truncate font-semibold hover:text-primary hover:underline">
              {name}
            </Link>
            <p className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</p>
          </div>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Options"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={remove} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {post.body.trim() && (
          <div className="px-4">
            <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-relaxed", !expanded && long && "line-clamp-6")}>{post.body}</p>
            {long && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-sm font-semibold text-primary hover:underline">
                {expanded ? "Voir moins" : "Voir plus"}
              </button>
            )}
          </div>
        )}

        {image && <img src={image} alt="" className="max-h-[560px] w-full bg-muted object-cover" loading="lazy" />}

        {post.events && <div className="px-4"><EventMiniCard event={post.events} /></div>}

        <div className="flex items-center gap-2 border-t px-4 py-2">
          <button type="button" onClick={onLike} aria-pressed={liked}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              liked ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-primary")}>
            <Heart className={cn("h-4 w-4", liked && "fill-current")} />
            {likes > 0 ? likes : ""} J'aime
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Zone « Publier une actualité » (organisateur de l'association). */
export function PostComposer({ associationId, associationName, logoPath, fallbackLogo, events, onPosted }: {
  associationId: string;
  associationName: string;
  logoPath?: string | null;
  fallbackLogo?: string;
  events: { id: string; title: string; starts_at: string }[];
  onPosted: () => void;
}) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function publish() {
    if (!user || (!body.trim() && !file)) return;
    setBusy(true);
    let image_path: string | null = null;
    try {
      if (file) image_path = await uploadPostImage(associationId, file);
      const { error } = await db.from("association_posts").insert({
        association_id: associationId, author_id: user.id, body: body.trim(), image_path,
        event_id: eventId === "none" ? null : eventId,
      });
      if (error) throw new Error(schoolErrorMessage(error.message));
      setBody(""); setFile(null); setEventId("none");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      toast.success("Actualité publiée. Tes abonnés sont prévenus.");
      onPosted();
    } catch (e) {
      if (image_path) await supabase.storage.from(POST_IMAGE_BUCKET).remove([image_path]);
      toast.error(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="space-y-3 p-4">
        <div className="flex gap-3">
          <AssociationAvatar name={associationName} logoPath={logoPath} fallback={fallbackLogo} className="!h-10 !w-10 !rounded-full text-xs" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3}
            placeholder={`Quoi de neuf chez ${associationName} ?`}
            className="min-h-[72px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {preview && (
          <div className="relative ml-[52px] overflow-hidden rounded-xl border">
            <img src={preview} alt="" className="max-h-72 w-full object-cover" />
            <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-8 w-8 rounded-full" aria-label="Retirer la photo"
              onClick={() => { setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="ml-[52px] flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus className="mr-1.5 h-4 w-4" />Photo
          </Button>
          {events.length > 0 && (
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="h-9 w-auto max-w-[240px] gap-1.5 border-dashed text-sm">
                <Calendar className="h-4 w-4 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans événement</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.title} · {format(new Date(e.starts_at), "d MMM", { locale: fr })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button className="ml-auto" onClick={publish} disabled={busy || (!body.trim() && !file)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publier
          </Button>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </CardContent>
    </Card>
  );
}

/** Icône « abonné aux notifications » (utilisée dans les en-têtes). */
export function FollowHint({ following }: { following: boolean }) {
  return following
    ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5 text-primary" />Tu reçois ses nouveautés</span>
    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bell className="h-3.5 w-3.5" />Abonne-toi pour recevoir ses nouveautés</span>;
}

/** Événement en grande carte (page d'une association) — format de la carte d'événement de la charte. */
export function EventTile({ event, past = false }: { event: Pick<FeedEvent, "id" | "title" | "starts_at" | "cover_image_url" | "location" | "city"> & { price?: number | null }; past?: boolean }) {
  const d = new Date(event.starts_at);
  const place = event.city ? `${event.city}${event.location ? ` — ${event.location}` : ""}` : event.location || "En ligne";
  return (
    <Link to="/events/$eventId" params={{ eventId: event.id }} className="group block rounded-[var(--radius-carte)]">
      <article className="flex h-full flex-col overflow-hidden rounded-[var(--radius-carte)] border border-bordure bg-blanc shadow-[var(--ombre-carte)] transition-shadow group-hover:shadow-[var(--ombre-menu)]">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-vibrant">
          {event.cover_image_url
            ? <img src={event.cover_image_url} alt="" loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-300 group-hover:scale-105", past && "opacity-55")} />
            : <img src="/plav-cocotte.svg" alt="" className={cn("absolute -bottom-6 -right-6 h-32 w-32 opacity-25", past && "opacity-15")} />}
          <span className="absolute left-3 top-3 flex flex-col items-center overflow-hidden rounded-[var(--radius-moyen)] bg-blanc text-center shadow-[var(--ombre-carte)]">
            <span className="w-full bg-bordeaux-600 px-2.5 py-0.5 text-xs font-bold uppercase text-blanc">{format(d, "MMM", { locale: fr }).replace(".", "")}</span>
            <span className="font-display text-xl font-black leading-7 text-bordeaux-600">{format(d, "d")}</span>
          </span>
          {past
            ? <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pilule)] bg-bordure py-1 pl-2.5 pr-3 text-[13px] font-semibold text-encre before:size-[7px] before:rounded-full before:bg-gris-chaud before:content-['']">Terminé</span>
            : event.price != null && (
              <span className="absolute right-3 top-3 rounded-[var(--radius-petit)] bg-fond px-2.5 py-1 t-corps-fort text-bordeaux-600">
                {event.price > 0 ? `${Number(event.price).toFixed(2).replace(".", ",").replace(",00", "")} €` : "Gratuit"}
              </span>
            )}
        </div>
        <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
          <h3 className={cn("t-titre-3 line-clamp-2", past ? "text-gris-chaud" : "text-encre group-hover:text-bordeaux-600")}>{event.title}</h3>
          <p className="flex items-center gap-2 t-legende text-gris-chaud"><Clock className="h-4 w-4 shrink-0" />{format(d, "EEEE d MMMM · HH'h'mm", { locale: fr })}</p>
          <p className="flex items-center gap-2 t-legende text-gris-chaud"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{place}</span></p>
        </div>
      </article>
    </Link>
  );
}
