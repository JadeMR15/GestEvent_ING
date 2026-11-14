import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Monogram } from "@/components/SchoolAdminShell";
import { db, schoolErrorMessage } from "@/lib/schools";
import { avatarUrl } from "@/lib/avatar";

export const LOGO_BUCKET = "association-logos";
const LOGO_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const LOGO_MAX_SIDE = 512;

export function associationLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Photo de profil de l'organisateur, par association : affichée tant que l'association
 * n'a pas de logo (c'est souvent la photo mise à l'inscription).
 */
export function useAssociationFallbacks(ids: string[]): Record<string, string> {
  const key = [...ids].sort().join(",");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) { setUrls({}); return; }
    db.rpc("association_avatar_fallbacks", { _ids: key.split(",") })
      .then(({ data }: { data: { association_id: string; avatar_path: string }[] | null }) => {
        const next: Record<string, string> = {};
        for (const r of data ?? []) {
          const url = avatarUrl(r.avatar_path);
          if (url) next[r.association_id] = url;
        }
        setUrls(next);
      });
  }, [key]);
  return urls;
}

/** Logo de l'association, sinon photo de son organisateur. */
export function associationImage(path: string | null | undefined, fallback?: string | null): string | null {
  return associationLogoUrl(path) ?? fallback ?? null;
}

/** Réduit le logo à 512 px max (sans le recadrer : un logo peut être large) et le convertit en WebP. */
async function prepareLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement de l'image impossible.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  return blob;
}

interface Props {
  associationId: string;
  name: string;
  path: string | null | undefined;
  onChange: (path: string | null) => void;
  /** Image affichée sans logo (photo de l'organisateur). */
  fallbackSrc?: string | null;
  size?: "md" | "lg";
  className?: string;
}

/** Logo de l'association avec boutons « Changer » / « Retirer ». */
export function AssociationLogoEditor({ associationId, name, path, onChange, fallbackSrc, size = "lg", className = "" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!LOGO_ACCEPTED.includes(file.type)) { toast.error("Formats acceptés : JPG, PNG ou WebP."); return; }
    if (file.size > LOGO_MAX_INPUT_BYTES) { toast.error("Image trop lourde (10 Mo maximum)."); return; }
    setBusy(true);
    try {
      const blob = await prepareLogo(file);
      const newPath = `${associationId}/logo-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(newPath, blob, { contentType: "image/webp" });
      if (upErr) throw new Error(upErr.message);
      const { error } = await db.rpc("set_association_logo", { _association_id: associationId, _path: newPath });
      if (error) throw new Error(schoolErrorMessage(error.message));
      if (path) await supabase.storage.from(LOGO_BUCKET).remove([path]);
      onChange(newPath);
      toast.success("Logo mis à jour.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi du logo impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!path) return;
    setBusy(true);
    const { error } = await db.rpc("set_association_logo", { _association_id: associationId, _path: null });
    if (!error) await supabase.storage.from(LOGO_BUCKET).remove([path]);
    setBusy(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    onChange(null);
    toast.success("Logo retiré.");
  }

  return (
    <div className={`flex shrink-0 flex-col items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="group relative rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={path ? "Changer le logo" : "Ajouter un logo"}>
        <Monogram name={name} src={associationImage(path, fallbackSrc)} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
      </button>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => input.current?.click()}>
          {path || fallbackSrc ? "Changer le logo" : "Ajouter un logo"}
        </Button>
        {path && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" disabled={busy}
            onClick={remove} aria-label="Retirer le logo">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept={LOGO_ACCEPTED.join(",")} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
    </div>
  );
}

/** Petit badge « association » d'un événement, avec son logo (ou la photo de l'organisateur). */
export function AssociationChip({ associationId, name, className = "", linkable = true }: { associationId: string | null | undefined; name: string; className?: string; linkable?: boolean }) {
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const fallback = useAssociationFallbacks(associationId ? [associationId] : [])[associationId ?? ""];
  useEffect(() => {
    if (!associationId) return;
    db.from("associations").select("logo_path").eq("id", associationId).maybeSingle()
      .then(({ data }: { data: { logo_path: string | null } | null }) => setLogoPath(data?.logo_path ?? null));
  }, [associationId]);
  const src = associationImage(logoPath, fallback);
  const cls = `inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-secondary-foreground ${src ? "" : "pl-2.5"} ${className}`;
  const inner = <>{src && <img src={src} alt="" className="h-5 w-5 rounded-full border bg-white object-cover" />}{name}</>;
  // Lien vers la page publique de l'association (réseau réservé aux participants).
  return associationId && linkable
    ? <Link to="/associations/$associationId" params={{ associationId }} className={`${cls} hover:bg-secondary/70 hover:underline`}>{inner}</Link>
    : <span className={cls}>{inner}</span>;
}

/** URL publique de la photo de couverture (même stockage que le logo). */
export function associationCoverUrl(path: string | null | undefined): string | null {
  return associationLogoUrl(path);
}

/** Couverture : 1920 px de large max, WebP (sans les métadonnées de la photo). */
async function prepareCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement de l'image impossible.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  return blob;
}

/** Envoie (ou retire, file = null) la couverture ; renvoie le nouveau chemin. */
export async function saveAssociationCover(associationId: string, file: File | null, oldPath: string | null | undefined): Promise<string | null> {
  let newPath: string | null = null;
  if (file) {
    if (!LOGO_ACCEPTED.includes(file.type)) throw new Error("Formats acceptés : JPG, PNG ou WebP.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Image trop lourde (20 Mo maximum).");
    const blob = await prepareCover(file);
    newPath = `${associationId}/cover-${Date.now()}.webp`;
    const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(newPath, blob, { contentType: "image/webp" });
    if (upErr) throw new Error("Envoi de la photo impossible.");
  }
  const { error } = await db.rpc("set_association_cover", { _association_id: associationId, _path: newPath });
  if (error) {
    if (newPath) await supabase.storage.from(LOGO_BUCKET).remove([newPath]);
    throw new Error(schoolErrorMessage(error.message));
  }
  if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
  return newPath;
}
