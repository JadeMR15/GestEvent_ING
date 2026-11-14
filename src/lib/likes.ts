import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// La table event_likes n'est pas encore dans les types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Likes d'une liste d'événements : nombre de likes (visible par tous)
 * et événements likés par l'utilisateur connecté.
 * Un visiteur non connecté qui clique est envoyé vers la connexion.
 */
export function useLikes(eventIds: string[]) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const key = eventIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await db.rpc("get_event_like_counts", { _event_ids: ids });
      if (error) console.error("get_event_like_counts:", error.message);
      if (!cancelled) {
        setCounts(Object.fromEntries(((data ?? []) as { event_id: string; likes: number }[]).map((r) => [r.event_id, r.likes])));
      }
      if (!user) { if (!cancelled) setMine(new Set()); return; }
      const { data: own } = await db.from("event_likes").select("event_id").eq("user_id", user.id).in("event_id", ids);
      if (!cancelled) setMine(new Set(((own ?? []) as { event_id: string }[]).map((r) => r.event_id)));
    })();
    return () => { cancelled = true; };
  }, [key, user]);

  const toggle = useCallback(async (eventId: string) => {
    if (!user) {
      toast.info("Connecte-toi pour liker cet événement.");
      sessionStorage.setItem("loginRedirect", window.location.pathname);
      navigate({ to: "/login" });
      return;
    }
    const liked = mine.has(eventId);
    // Affichage immédiat, annulé si la base refuse.
    const apply = (like: boolean) => {
      setMine((s) => { const n = new Set(s); if (like) n.add(eventId); else n.delete(eventId); return n; });
      setCounts((c) => ({ ...c, [eventId]: Math.max(0, (c[eventId] ?? 0) + (like ? 1 : -1)) }));
    };
    apply(!liked);
    const { error } = liked
      ? await db.from("event_likes").delete().eq("event_id", eventId).eq("user_id", user.id)
      : await db.from("event_likes").insert({ event_id: eventId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) {
      apply(liked);
      toast.error("Impossible d'enregistrer ton like. Réessaie.");
    }
  }, [user, mine, navigate]);

  return { counts, mine, toggle };
}
