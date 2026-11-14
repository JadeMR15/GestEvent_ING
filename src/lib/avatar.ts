import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const AVATAR_SIZE = 512;

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Initiales affichées quand il n'y a pas de photo ("Olivia Peret" → "OP"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Recadre la photo en carré (centre), la réduit à 512 px et la convertit en WebP.
 * Fichier léger, et les métadonnées de la photo d'origine (lieu GPS…) ne sont pas envoyées.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const size = Math.min(AVATAR_SIZE, side);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement de l'image impossible.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  return blob;
}

/** Ajoute la photo de profil (avatar_path) à une liste de comptes, en une requête. */
export async function withAvatars<T extends { id: string }>(rows: T[]): Promise<(T & { avatar_path: string | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.id)));
  if (!ids.length) return rows.map((r) => ({ ...r, avatar_path: null }));
  const { data } = await (supabase as any).from("profiles").select("id, avatar_path").in("id", ids);
  const map = new Map<string, string | null>(((data ?? []) as { id: string; avatar_path: string | null }[]).map((p) => [p.id, p.avatar_path]));
  return rows.map((r) => ({ ...r, avatar_path: map.get(r.id) ?? null }));
}
