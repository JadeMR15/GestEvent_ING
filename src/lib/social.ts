// Côté social : abonnements aux associations, actualités, « j'aime ».
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage } from "@/lib/schools";

export const POST_IMAGE_BUCKET = "post-images";

export interface PublicAssociation {
  id: string;
  name: string;
  description: string | null;
  logo_path: string | null;
  instagram: string | null;
  website: string | null;
  school_id: string;
  status: string;
  created_at: string;
  schools?: { name: string } | null;
}

export interface FeedEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  city: string | null;
  cover_image_url: string | null;
  price: number | null;
  status: string;
  approval_status: string;
  association_id: string | null;
  association: string | null;
  school: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  association_id: string;
  author_id: string | null;
  body: string;
  image_path: string | null;
  event_id: string | null;
  created_at: string;
  associations?: { name: string; logo_path: string | null } | null;
  events?: { id: string; title: string; starts_at: string; cover_image_url: string | null; location: string | null; city: string | null } | null;
}

export const POST_SELECT = "*, associations(name, logo_path), events(id, title, starts_at, cover_image_url, location, city)";

export function postImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Événements visibles (règles de get_public_events), publiés et validés. */
export async function fetchVisibleEvents(): Promise<FeedEvent[]> {
  const { data } = await db.rpc("get_public_events");
  return ((data ?? []) as FeedEvent[]).filter((e) =>
    ["published", "closed", "private"].includes(e.status) && ["not_required", "approved"].includes(e.approval_status));
}

/** Abonnements de l'utilisateur et nombre d'abonnés des associations affichées. */
export function useFollows(associationIds: string[]) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const key = [...associationIds].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = key ? key.split(",") : [];
      const [c, mine] = await Promise.all([
        ids.length ? db.rpc("association_follower_counts", { _ids: ids }) : Promise.resolve({ data: [] }),
        user ? db.from("association_follows").select("association_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setCounts(Object.fromEntries(((c.data ?? []) as { association_id: string; followers: number }[]).map((r) => [r.association_id, r.followers])));
      setFollowing(new Set(((mine.data ?? []) as { association_id: string }[]).map((r) => r.association_id)));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [key, user]);

  const toggle = useCallback(async (associationId: string, name?: string) => {
    if (!user) { navigate({ to: "/login" }); return; }
    const was = following.has(associationId);
    // Réponse immédiate, annulée si le serveur refuse.
    const apply = (on: boolean) => {
      setFollowing((prev) => { const n = new Set(prev); if (on) n.add(associationId); else n.delete(associationId); return n; });
      setCounts((prev) => ({ ...prev, [associationId]: Math.max(0, (prev[associationId] ?? 0) + (on ? 1 : -1)) }));
    };
    apply(!was);
    const { error } = was
      ? await db.from("association_follows").delete().eq("user_id", user.id).eq("association_id", associationId)
      : await db.from("association_follows").insert({ user_id: user.id, association_id: associationId });
    if (error) { apply(was); toast.error(schoolErrorMessage(error.message)); return; }
    if (!was) toast.success(name ? `Tu suis ${name}.` : "Abonnement ajouté.");
  }, [user, following, navigate]);

  return { following, counts, toggle, ready };
}

/** « J'aime » des actualités affichées. */
export function usePostLikes(postIds: string[]) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const key = postIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const [c, own] = await Promise.all([
        db.rpc("post_like_counts", { _ids: ids }),
        user ? db.from("post_likes").select("post_id").eq("user_id", user.id).in("post_id", ids) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setCounts(Object.fromEntries(((c.data ?? []) as { post_id: string; likes: number }[]).map((r) => [r.post_id, r.likes])));
      setMine(new Set(((own.data ?? []) as { post_id: string }[]).map((r) => r.post_id)));
    })();
    return () => { cancelled = true; };
  }, [key, user]);

  const toggle = useCallback(async (postId: string) => {
    if (!user) { navigate({ to: "/login" }); return; }
    const was = mine.has(postId);
    const apply = (on: boolean) => {
      setMine((prev) => { const n = new Set(prev); if (on) n.add(postId); else n.delete(postId); return n; });
      setCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) + (on ? 1 : -1)) }));
    };
    apply(!was);
    const { error } = was
      ? await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id)
      : await db.from("post_likes").insert({ post_id: postId, user_id: user.id });
    if (error) apply(was);
  }, [user, mine, navigate]);

  return { counts, mine, toggle };
}

/** Photo d'actualité : 1600 px max, WebP, sans les métadonnées (lieu GPS…). */
export async function uploadPostImage(associationId: string, file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Formats acceptés : JPG, PNG ou WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image trop lourde (15 Mo maximum).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  const path = `${associationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { error } = await supabase.storage.from(POST_IMAGE_BUCKET).upload(path, blob, { contentType: "image/webp" });
  if (error) throw new Error("Envoi de la photo impossible.");
  return path;
}
