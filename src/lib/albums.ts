// Albums photo des associations : envoi en masse, liens signés, téléchargement.
// Les photos sont dans un stockage privé : on n'y accède que par des liens temporaires,
// accordés par la base selon les droits (album public ou réservé aux inscrits).
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/schools";
import { encodeCanvas, imageExt } from "@/lib/image-encode";

export const PHOTO_BUCKET = "event-photos";
const FULL_SIDE = 2560;   // assez pour imprimer ou partager en story
const THUMB_SIDE = 480;   // vignettes de la grille
const SIGN_SECONDS = 60 * 60;

export interface Album {
  id: string;
  association_id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  visibility: "public" | "attendees";
  cover_photo_id: string | null;
  photo_count: number;
  created_at: string;
  notified_at: string | null;
  events?: { id: string; title: string; starts_at: string } | null;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  original_name: string | null;
  created_at: string;
}

export const ALBUM_SELECT = "*, events(id, title, starts_at)";
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Liens temporaires pour une liste de fichiers (par paquets, l'API en accepte beaucoup). */
export async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 500) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths.slice(i, i + 500), SIGN_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}

/** Lien de téléchargement (le navigateur enregistre le fichier sous ce nom). */
export async function downloadUrl(path: string, filename: string): Promise<string | null> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGN_SECONDS, { download: filename });
  return data?.signedUrl ?? null;
}

/** « Soirée raclette ! » → « Soiree-raclette » (noms de fichiers). */
export function albumSlug(albumTitle: string) {
  return albumTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photos";
}

/** Nom du fichier téléchargé, avec l'extension réelle (WebP, ou JPEG si envoyé depuis Safari). */
export function photoFileName(albumTitle: string, index: number, path: string) {
  const ext = path.split(".").pop() || "jpg";
  return `${albumSlug(albumTitle)}-${String(index + 1).padStart(4, "0")}.${ext}`;
}

// --- Envoi ---------------------------------------------------------------------------------

async function toWebp(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await encodeCanvas(canvas, quality);
  canvas.width = canvas.height = 0; // libère la mémoire tout de suite
  return { blob, w, h };
}

/** Une photo : version grande (2560 px) + vignette (480 px), en WebP, sans les métadonnées (GPS…). */
async function uploadOne(albumId: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  try {
    const full = await toWebp(bitmap, FULL_SIDE, 0.86);
    const thumb = await toWebp(bitmap, THUMB_SIDE, 0.72);
    const id = crypto.randomUUID();
    const path = `${albumId}/${id}.${imageExt(full.blob)}`;
    const thumbPath = `${albumId}/thumb/${id}.${imageExt(thumb.blob)}`;
    const store = supabase.storage.from(PHOTO_BUCKET);
    const [a, b] = await Promise.all([
      store.upload(path, full.blob, { contentType: full.blob.type }),
      store.upload(thumbPath, thumb.blob, { contentType: thumb.blob.type }),
    ]);
    if (a.error || b.error) {
      await store.remove([path, thumbPath]);
      throw new Error(a.error?.message ?? b.error?.message);
    }
    const { error } = await db.from("album_photos").insert({
      id, album_id: albumId, path, thumb_path: thumbPath, width: full.w, height: full.h,
      size_bytes: full.blob.size, original_name: file.name.slice(0, 200),
    });
    if (error) {
      await store.remove([path, thumbPath]);
      throw new Error(error.message);
    }
  } finally {
    bitmap.close();
  }
}

export interface UploadProgress { done: number; failed: number; total: number; failedNames: string[] }

/**
 * Envoie une liste de photos, plusieurs à la fois (moins sur téléphone : la mémoire est limitée).
 * Chaque échec est réessayé une fois. `shouldStop` permet d'interrompre l'envoi.
 */
export async function uploadPhotos(albumId: string, files: File[], onProgress: (p: UploadProgress) => void, shouldStop: () => boolean) {
  const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
  const workers = mobile ? 2 : Math.min(4, Math.max(2, (navigator.hardwareConcurrency ?? 4) - 2));
  const p: UploadProgress = { done: 0, failed: 0, total: files.length, failedNames: [] };
  let next = 0;
  onProgress({ ...p });
  async function worker() {
    while (next < files.length && !shouldStop()) {
      const file = files[next++];
      try {
        await uploadOne(albumId, file);
        p.done++;
      } catch {
        try { await uploadOne(albumId, file); p.done++; } catch { p.failed++; p.failedNames.push(file.name); }
      }
      onProgress({ ...p, failedNames: [...p.failedNames] });
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return p;
}

// --- Téléchargement de tout l'album -----------------------------------------------------------

const ZIP_PART = 150; // ~ 60 à 100 Mo par fichier ZIP : supportable par un navigateur

/** Télécharge l'album en fichiers ZIP de 150 photos (album-1.zip, album-2.zip…). */
export async function downloadAlbumZip(album: Album, onProgress: (done: number, total: number) => void, shouldStop: () => boolean) {
  const { default: JSZip } = await import("jszip");
  // Tous les chemins (par pages de 1000).
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("album_photos").select("path").eq("album_id", album.id)
      .order("created_at").order("id").range(from, from + 999);
    const rows = (data ?? []) as { path: string }[];
    paths.push(...rows.map((r) => r.path));
    if (rows.length < 1000) break;
  }
  const total = paths.length;
  let done = 0;
  const parts = Math.ceil(total / ZIP_PART);
  for (let part = 0; part < parts && !shouldStop(); part++) {
    const slice = paths.slice(part * ZIP_PART, (part + 1) * ZIP_PART);
    const urls = await signPaths(slice);
    const zip = new JSZip();
    let i = 0;
    async function worker() {
      while (i < slice.length && !shouldStop()) {
        const idx = i++;
        const res = await fetch(urls[slice[idx]]);
        if (res.ok) zip.file(photoFileName(album.title, part * ZIP_PART + idx, slice[idx]), await res.blob());
        done++;
        onProgress(done, total);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    if (shouldStop()) break;
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${albumSlug(album.title)}${parts > 1 ? `-${part + 1}` : ""}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
}

/** Supprime un album et tous ses fichiers. */
export async function deleteAlbum(albumId: string) {
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("album_photos").select("path, thumb_path").eq("album_id", albumId).range(from, from + 999);
    const rows = (data ?? []) as { path: string; thumb_path: string }[];
    for (const r of rows) paths.push(r.path, r.thumb_path);
    if (rows.length < 1000) break;
  }
  for (let i = 0; i < paths.length; i += 1000) await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 1000));
  const { error } = await db.from("photo_albums").delete().eq("id", albumId);
  if (error) throw new Error(error.message);
}
