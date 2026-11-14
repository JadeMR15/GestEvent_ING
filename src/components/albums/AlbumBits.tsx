import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, FolderPlus, Images, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage } from "@/lib/schools";
import { ALBUM_SELECT, signPaths, type Album } from "@/lib/albums";
import { cn } from "@/lib/utils";

export type AlbumEvent = { id: string; title: string; starts_at: string };

/** Formulaire de création / modification d'un album. */
export function AlbumFormDialog({ open, onOpenChange, associationId, events, album, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  associationId: string;
  events: AlbumEvent[];
  album?: Album | null;
  onSaved: (a: Album) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState("none");
  const [visibility, setVisibility] = useState<Album["visibility"]>("public");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(album?.title ?? "");
    setDescription(album?.description ?? "");
    setEventId(album?.event_id ?? "none");
    setVisibility(album?.visibility ?? "public");
  }, [open, album]);

  // Choisir une soirée remplit le titre s'il est vide.
  function pickEvent(id: string) {
    setEventId(id);
    if (id === "none") { setVisibility("public"); return; }
    const ev = events.find((e) => e.id === id);
    if (ev && !title.trim()) setTitle(ev.title);
  }

  async function save() {
    if (!user) return;
    if (title.trim().length < 2) { toast.error("Donne un titre à l'album."); return; }
    setSaving(true);
    const row = {
      title: title.trim(), description: description.trim() || null,
      event_id: eventId === "none" ? null : eventId,
      visibility: eventId === "none" ? "public" : visibility,
    };
    const res = album
      ? await db.from("photo_albums").update(row).eq("id", album.id).select(ALBUM_SELECT).single()
      : await db.from("photo_albums").insert({ ...row, association_id: associationId, created_by: user.id }).select(ALBUM_SELECT).single();
    setSaving(false);
    if (res.error) { toast.error(schoolErrorMessage(res.error.message)); return; }
    onSaved(res.data as Album);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{album ? "Modifier l'album" : "Nouvel album photo"}</DialogTitle>
          <DialogDescription>Un dossier par soirée : tu y déposes ensuite toutes les photos du photographe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Soirée</Label>
            <Select value={eventId} onValueChange={pickEvent}>
              <SelectTrigger><Calendar /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune (album libre)</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.title} · {format(new Date(e.starts_at), "d MMM yyyy", { locale: fr })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="album-title">Titre</Label>
            <Input id="album-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Soirée raclette — 15 novembre" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="album-desc">Description (facultatif)</Label>
            <Textarea id="album-desc" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Merci à notre photographe…" />
          </div>
          <fieldset className="space-y-2">
            <Label asChild><legend>Qui peut voir les photos ?</legend></Label>
            {([
              { v: "public", title: "Tous les étudiants", hint: "Toute personne connectée qui visite la page de l'association." },
              { v: "attendees", title: "Seulement les participants de la soirée", hint: eventId === "none" ? "Choisis d'abord la soirée." : "Les inscrits à la soirée (et ton équipe)." },
            ] as const).map((o) => {
              const disabled = o.v === "attendees" && eventId === "none";
              const active = visibility === o.v;
              return (
                <button key={o.v} type="button" disabled={disabled} onClick={() => setVisibility(o.v)}
                  className={cn("flex w-full items-start gap-3 rounded-[var(--radius-moyen)] border-[1.5px] p-3 text-left transition-colors",
                    active ? "border-bordeaux-600 bg-bordeaux-100" : "border-sable bg-blanc hover:border-bordeaux-300",
                    disabled && "cursor-not-allowed opacity-50")}>
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-bordeaux-600" : "border-sable")}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-bordeaux-600" />}
                  </span>
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-encre">{o.v === "attendees" && <Lock className="h-4 w-4" />}{o.title}</span>
                    <span className="t-legende text-gris-chaud">{o.hint}</span>
                  </span>
                </button>
              );
            })}
          </fieldset>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="secondary" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}{album ? "Enregistrer" : "Créer l'album"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Onglet « Photos » de la page d'une association : la liste des albums. */
export function AlbumsSection({ associationId, canPost, events }: { associationId: string; canPost: boolean; events: AlbumEvent[] }) {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await db.from("photo_albums").select(ALBUM_SELECT)
        .eq("association_id", associationId).order("created_at", { ascending: false });
      const list = (data as Album[] | null) ?? [];
      setAlbums(list);
      setLoading(false);
      // Couvertures : seulement celles que l'utilisateur a le droit de voir.
      const ids = list.map((a) => a.cover_photo_id).filter((x): x is string => !!x);
      if (!ids.length) return;
      const { data: photos } = await db.from("album_photos").select("id, album_id, thumb_path").in("id", ids);
      const rows = (photos ?? []) as { album_id: string; thumb_path: string }[];
      const urls = await signPaths(rows.map((r) => r.thumb_path));
      setCovers(Object.fromEntries(rows.map((r) => [r.album_id, urls[r.thumb_path]]).filter(([, u]) => !!u)));
    })();
  }, [associationId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-bordeaux-600" /></div>;

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-carte)] border border-dashed border-bordeaux-300 bg-bordeaux-100/50 p-4">
          <p className="t-corps text-encre">Ton photographe t'a envoyé les photos d'une soirée ? Crée un album et dépose-les toutes d'un coup.</p>
          <Button variant="secondary" onClick={() => setCreating(true)}><FolderPlus />Nouvel album</Button>
        </div>
      )}

      {albums.length === 0 ? (
        <Card><EmptyState title="Pas encore d'album photo." message={canPost ? "Les participants pourront regarder et télécharger les photos de vos soirées." : undefined} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {albums.map((a) => (
            <Link key={a.id} to="/albums/$albumId" params={{ albumId: a.id }} className="group block rounded-[var(--radius-carte)]">
              <article className="overflow-hidden rounded-[var(--radius-carte)] border border-sable bg-blanc shadow-[var(--ombre-carte)] transition-shadow group-hover:shadow-[var(--ombre-menu)]">
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-vibrant">
                  {covers[a.id]
                    ? <img src={covers[a.id]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    : (
                      <div className="absolute inset-0 flex items-center justify-center text-creme/80">
                        {a.visibility === "attendees" && a.photo_count > 0 ? <Lock className="h-10 w-10" /> : <Images className="h-10 w-10" />}
                      </div>
                    )}
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--radius-petit)] bg-creme px-2.5 py-1 t-corps-fort text-bordeaux-600">
                    <Images className="h-4 w-4" />{a.photo_count}
                  </span>
                  {a.visibility === "attendees" && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pilule)] bg-statut-bleu-100 py-1 pl-2.5 pr-3 text-[13px] font-semibold text-statut-bleu-700">
                      <Lock className="h-3.5 w-3.5" />Participants
                    </span>
                  )}
                </div>
                <div className="space-y-1 px-5 pb-5 pt-4">
                  <h3 className="t-titre-3 line-clamp-2 text-encre group-hover:text-bordeaux-600">{a.title}</h3>
                  <p className="flex items-center gap-2 t-legende text-gris-chaud">
                    <Calendar className="h-4 w-4" />
                    {a.events ? `${a.events.title} · ${format(new Date(a.events.starts_at), "d MMM yyyy", { locale: fr })}` : format(new Date(a.created_at), "d MMMM yyyy", { locale: fr })}
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      <AlbumFormDialog open={creating} onOpenChange={setCreating} associationId={associationId} events={events}
        onSaved={(a) => { toast.success("Album créé : ajoute tes photos."); navigate({ to: "/albums/$albumId", params: { albumId: a.id } }); }} />
    </div>
  );
}
