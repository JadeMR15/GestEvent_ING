import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  BellRing, Calendar, ChevronLeft, ChevronRight, Download, ImagePlus, Images, Loader2, Lock, Pencil, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { EmptyState } from "@/components/EmptyState";
import { AlbumFormDialog, type AlbumEvent } from "@/components/albums/AlbumBits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage } from "@/lib/schools";
import {
  ALBUM_SELECT, PHOTO_ACCEPT, PHOTO_BUCKET, deleteAlbum, downloadAlbumZip, downloadUrl, photoFileName, signPaths,
  uploadPhotos, type Album, type AlbumPhoto, type UploadProgress,
} from "@/lib/albums";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/albums/$albumId")({
  component: () => (
    <ProtectedLayout>
      <AlbumPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Album photo — Plav'" }] }),
});

const PAGE = 120; // vignettes chargées à la fois

function AlbumPage() {
  const { albumId } = Route.useParams();
  const { role } = useAuth();
  const [album, setAlbum] = useState<Album | null>(null);
  const [associationName, setAssociationName] = useState("");
  const [events, setEvents] = useState<AlbumEvent[]>([]);
  const [canView, setCanView] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const stopUpload = useRef(false);
  const stopZip = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (from: number) => {
    const { data } = await db.from("album_photos").select("*").eq("album_id", albumId)
      .order("created_at").order("id").range(from, from + PAGE - 1);
    const rows = (data as AlbumPhoto[] | null) ?? [];
    const urls = await signPaths(rows.map((r) => r.thumb_path));
    setThumbs((t) => ({ ...t, ...urls }));
    setPhotos((p) => (from === 0 ? rows : [...p, ...rows]));
    setHasMore(rows.length === PAGE);
  }, [albumId]);

  const load = useCallback(async () => {
    const { data: a } = await db.from("photo_albums").select(ALBUM_SELECT).eq("id", albumId).maybeSingle();
    if (!a) { setAlbum(null); setLoading(false); return; }
    const al = a as Album;
    const [view, edit, manage, asso, evs] = await Promise.all([
      db.rpc("can_view_album", { _album_id: albumId }),
      db.rpc("can_edit_album", { _album_id: albumId }),
      db.rpc("can_manage_association", { _association_id: al.association_id }),
      db.from("associations").select("name").eq("id", al.association_id).maybeSingle(),
      db.from("events").select("id, title, starts_at").eq("association_id", al.association_id).order("starts_at", { ascending: false }),
    ]);
    setAlbum(al);
    setCanView(view.data === true);
    setCanEdit(edit.data === true);
    setCanModerate(manage.data === true);
    setAssociationName(asso.data?.name ?? "");
    setEvents((evs.data as AlbumEvent[] | null) ?? []);
    if (view.data === true) await loadPage(0);
    setLoading(false);
  }, [albumId, loadPage]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { if (album) document.title = `${album.title} — Plav'`; }, [album]);

  // Défilement infini : la suite se charge en approchant du bas.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      await loadPage(photos.length);
      setLoadingMore(false);
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, photos.length, loadPage, loadingMore]);

  // Ne pas quitter la page pendant un envoi.
  useEffect(() => {
    if (!upload || upload.done + upload.failed >= upload.total) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [upload]);

  async function addFiles(list: FileList | File[]) {
    const files = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length || !album) return;
    stopUpload.current = false;
    const result = await uploadPhotos(album.id, files, setUpload, () => stopUpload.current);
    const { data } = await db.from("photo_albums").select(ALBUM_SELECT).eq("id", album.id).maybeSingle();
    if (data) setAlbum(data as Album);
    await loadPage(0);
    if (result.failed) toast.error(`${result.failed} photo${result.failed > 1 ? "s n'ont" : " n'a"} pas pu être envoyée${result.failed > 1 ? "s" : ""}.`);
    else if (!stopUpload.current) toast.success(`${result.done} photo${result.done > 1 ? "s ajoutées" : " ajoutée"}.`);
  }

  async function removePhoto(p: AlbumPhoto) {
    if (!confirm("Supprimer cette photo ?")) return;
    const { error } = await db.from("album_photos").delete().eq("id", p.id);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    await supabase.storage.from(PHOTO_BUCKET).remove([p.path, p.thumb_path]);
    setPhotos((list) => list.filter((x) => x.id !== p.id));
    setAlbum((a) => (a ? { ...a, photo_count: Math.max(0, a.photo_count - 1) } : a));
    setOpen(null);
  }

  async function removeAlbum() {
    if (!album || !confirm(`Supprimer l'album « ${album.title} » et ses ${album.photo_count} photos ? C'est définitif.`)) return;
    try {
      await deleteAlbum(album.id);
      toast.success("Album supprimé.");
      window.history.back();
    } catch (e) {
      toast.error(schoolErrorMessage(e instanceof Error ? e.message : ""));
    }
  }

  async function notify() {
    if (!album) return;
    const { data, error } = await db.rpc("notify_album", { _album_id: album.id });
    if (error) { toast.error(error.message.includes("already_notified") ? "Les participants ont déjà été prévenus." : schoolErrorMessage(error.message)); return; }
    setAlbum({ ...album, notified_at: new Date().toISOString() });
    toast.success(`${data ?? 0} personne${(data ?? 0) > 1 ? "s prévenues" : " prévenue"}.`);
  }

  async function downloadAll() {
    if (!album) return;
    stopZip.current = false;
    setZip({ done: 0, total: album.photo_count });
    try {
      await downloadAlbumZip(album, (done, total) => setZip({ done, total }), () => stopZip.current);
    } catch {
      toast.error("Téléchargement interrompu.");
    } finally {
      setZip(null);
    }
  }

  const uploading = !!upload && upload.done + upload.failed < upload.total;
  const backTo = useMemo(() => album ? { to: "/associations/$associationId" as const, params: { associationId: album.association_id } } : null, [album]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-bordeaux-600" /></div>;

  if (!album) {
    return <Card className="mx-auto max-w-lg"><EmptyState title="Album introuvable." message="Il a peut-être été supprimé." /></Card>;
  }

  // Comme le reste du réseau : pour les participants, l'équipe de l'association et l'école.
  if (role !== "participant" && role !== "admin" && !canEdit && !canModerate) {
    return <Card className="mx-auto max-w-lg"><EmptyState title="Page réservée aux étudiants." /></Card>;
  }

  return (
    <div
      className="mx-auto max-w-6xl space-y-6"
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
    >
      {backTo && (
        <Link {...backTo} className="inline-flex items-center gap-1 t-legende text-gris-chaud hover:text-bordeaux-600">
          <ChevronLeft className="h-4 w-4" />{associationName || "Association"}
        </Link>
      )}

      {/* En-tête de l'album */}
      <section className="rounded-[var(--radius-carte)] border border-sable bg-blanc p-5 shadow-[var(--ombre-carte)] md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="t-surtitre text-gris-chaud">Album photo · {associationName}</p>
            <h1 className="text-encre max-md:text-[28px]">{album.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-legende text-gris-chaud">
              <span className="flex items-center gap-1.5"><Images className="h-4 w-4" />{album.photo_count} photo{album.photo_count > 1 ? "s" : ""}</span>
              {album.events && (
                <Link to="/events/$eventId" params={{ eventId: album.events.id }} className="flex items-center gap-1.5 hover:text-bordeaux-600">
                  <Calendar className="h-4 w-4" />{album.events.title} · {format(new Date(album.events.starts_at), "d MMMM yyyy", { locale: fr })}
                </Link>
              )}
              {album.visibility === "attendees" && (
                <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pilule)] bg-statut-bleu-100 py-0.5 pl-2.5 pr-3 font-semibold text-statut-bleu-700">
                  <Lock className="h-3.5 w-3.5" />Réservé aux participants de la soirée
                </span>
              )}
            </div>
            {album.description && <p className="t-corps max-w-2xl whitespace-pre-wrap text-encre">{album.description}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {canView && album.photo_count > 0 && (
              <Button variant="secondary" onClick={downloadAll} disabled={!!zip}><Download />Tout télécharger</Button>
            )}
            {canEdit && (
              <>
                <Button onClick={() => fileInput.current?.click()} disabled={uploading}><ImagePlus />Ajouter des photos</Button>
                {!album.notified_at && album.photo_count > 0 && (
                  <Button variant="outline" onClick={notify}><BellRing />Prévenir les participants</Button>
                )}
                <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setEditing(true)} aria-label="Modifier l'album"><Pencil /></Button>
              </>
            )}
            {(canEdit || canModerate) && (
              <Button variant="outline" size="icon" className="h-12 w-12 border-statut-rouge-500 text-statut-rouge-700 hover:bg-statut-rouge-100" onClick={removeAlbum} aria-label="Supprimer l'album"><Trash2 /></Button>
            )}
          </div>
        </div>
        <input ref={fileInput} type="file" multiple accept={PHOTO_ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files; if (f) addFiles(f); e.target.value = ""; }} />

        {/* Progression : envoi des photos / préparation du ZIP */}
        {upload && (uploading || upload.failed > 0) && (
          <div className="mt-5 space-y-2 rounded-[var(--radius-moyen)] bg-creme p-4">
            <div className="flex items-center justify-between gap-3 t-corps-fort text-encre">
              <span className="flex items-center gap-2">{uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? `Envoi : ${upload.done} / ${upload.total} photos` : `${upload.done} envoyées, ${upload.failed} en échec`}</span>
              {uploading
                ? <Button size="sm" variant="ghost" onClick={() => { stopUpload.current = true; }}><X />Arrêter</Button>
                : <Button size="sm" variant="ghost" onClick={() => setUpload(null)}>Fermer</Button>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-[var(--radius-pilule)] bg-sable">
              <div className="h-full bg-bordeaux-600 transition-all" style={{ width: `${((upload.done + upload.failed) / upload.total) * 100}%` }} />
            </div>
            <p className="t-legende text-gris-chaud">
              {uploading ? "Les photos sont compressées sur ton appareil avant l'envoi. Garde cette page ouverte." : `Non envoyées : ${upload.failedNames.slice(0, 5).join(", ")}${upload.failedNames.length > 5 ? "…" : ""}`}
            </p>
          </div>
        )}
        {zip && (
          <div className="mt-5 space-y-2 rounded-[var(--radius-moyen)] bg-creme p-4">
            <div className="flex items-center justify-between gap-3 t-corps-fort text-encre">
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Préparation du téléchargement : {zip.done} / {zip.total}</span>
              <Button size="sm" variant="ghost" onClick={() => { stopZip.current = true; }}><X />Arrêter</Button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[var(--radius-pilule)] bg-sable">
              <div className="h-full bg-bordeaux-600 transition-all" style={{ width: `${zip.total ? (zip.done / zip.total) * 100 : 0}%` }} />
            </div>
            {zip.total > 150 && <p className="t-legende text-gris-chaud">Les photos arrivent en plusieurs fichiers ZIP de 150 photos.</p>}
          </div>
        )}
      </section>

      {/* Photos */}
      {!canView ? (
        <Card>
          <EmptyState title="Photos réservées aux participants de la soirée."
            message="Seules les personnes inscrites à cet événement peuvent voir et télécharger ces photos." />
        </Card>
      ) : photos.length === 0 ? (
        <Card>
          {canEdit ? (
            <button type="button" onClick={() => fileInput.current?.click()}
              className={`flex w-full flex-col items-center gap-3 rounded-[var(--radius-carte)] border-2 border-dashed px-6 py-14 text-center transition-colors ${dragOver ? "border-bordeaux-600 bg-bordeaux-100" : "border-sable hover:border-bordeaux-300"}`}>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bordeaux-100 text-bordeaux-600"><Upload className="h-7 w-7" /></span>
              <span className="t-titre-3 text-encre">Glisse les photos ici</span>
              <span className="t-corps text-gris-chaud">ou clique pour les choisir — tu peux en sélectionner des centaines d'un coup.</span>
            </button>
          ) : <EmptyState title="Pas encore de photo dans cet album." />}
        </Card>
      ) : (
        <>
          {dragOver && canEdit && (
            <div className="rounded-[var(--radius-carte)] border-2 border-dashed border-bordeaux-600 bg-bordeaux-100 p-6 text-center t-corps-fort text-bordeaux-600">
              Lâche les photos pour les ajouter à l'album
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:gap-2 lg:grid-cols-6">
            {photos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setOpen(i)}
                className="group relative aspect-square overflow-hidden rounded-[var(--radius-petit)] bg-sable">
                {thumbs[p.thumb_path] && (
                  <img src={thumbs[p.thumb_path]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
              </button>
            ))}
          </div>
          <div ref={sentinel} className="flex justify-center py-4">
            {hasMore && <Loader2 className="h-5 w-5 animate-spin text-bordeaux-600" />}
          </div>
        </>
      )}

      <PhotoViewer album={album} photos={photos} index={open} onIndex={setOpen} total={album.photo_count}
        canDelete={canEdit || canModerate} onDelete={removePhoto}
        onNeedMore={hasMore ? () => loadPage(photos.length) : undefined} />

      <AlbumFormDialog open={editing} onOpenChange={setEditing} associationId={album.association_id} events={events} album={album}
        onSaved={(a) => { setAlbum(a); toast.success("Album mis à jour."); }} />
    </div>
  );
}

/** Photo en grand : flèches (clavier aussi), téléchargement, suppression pour l'équipe. */
function PhotoViewer({ album, photos, index, onIndex, total, canDelete, onDelete, onNeedMore }: {
  album: Album;
  photos: AlbumPhoto[];
  index: number | null;
  onIndex: (i: number | null) => void;
  total: number;
  canDelete: boolean;
  onDelete: (p: AlbumPhoto) => void;
  onNeedMore?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const photo = index != null ? photos[index] : null;

  useEffect(() => {
    if (!photo) { setUrl(null); return; }
    let cancelled = false;
    setUrl(null);
    signPaths([photo.path]).then((u) => { if (!cancelled) setUrl(u[photo.path] ?? null); });
    // Précharge la suivante.
    const next = photos[(index ?? 0) + 1];
    if (next) signPaths([next.path]).then((u) => { if (u[next.path]) new Image().src = u[next.path]; });
    if (onNeedMore && index != null && index > photos.length - 10) onNeedMore();
    return () => { cancelled = true; };
  }, [photo, index, photos, onNeedMore]);

  const go = useCallback((d: number) => {
    if (index == null) return;
    const n = index + d;
    if (n >= 0 && n < photos.length) onIndex(n);
  }, [index, photos.length, onIndex]);

  useEffect(() => {
    if (index == null) return;
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, go]);

  async function download() {
    if (!photo || index == null) return;
    const u = await downloadUrl(photo.path, photoFileName(album.title, index));
    if (u) window.location.href = u;
  }

  return (
    <Dialog open={index != null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="max-w-[min(96vw,1400px)] gap-3 border-0 bg-bordeaux-900 p-3 text-creme sm:p-4 [&>button]:text-creme">
        <DialogTitle className="sr-only">Photo {index != null ? index + 1 : ""}</DialogTitle>
        <div className="relative flex h-[75vh] items-center justify-center">
          {url ? <img src={url} alt="" className="max-h-full max-w-full rounded-[var(--radius-petit)] object-contain" />
            : <Loader2 className="h-8 w-8 animate-spin text-creme" />}
          {index != null && index > 0 && (
            <button type="button" onClick={() => go(-1)} aria-label="Photo précédente"
              className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-bordeaux-900/60 hover:bg-bordeaux-700">
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {index != null && index < photos.length - 1 && (
            <button type="button" onClick={() => go(1)} aria-label="Photo suivante"
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-bordeaux-900/60 hover:bg-bordeaux-700">
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="t-legende text-bordeaux-200">{index != null ? index + 1 : 0} / {total}</span>
          <div className="flex gap-2">
            {canDelete && photo && (
              <Button size="sm" variant="outlineLight" onClick={() => onDelete(photo)}><Trash2 />Supprimer</Button>
            )}
            <Button size="sm" variant="secondary" onClick={download} disabled={!photo}><Download />Télécharger</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
