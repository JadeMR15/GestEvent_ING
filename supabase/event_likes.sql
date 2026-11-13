-- ============================================================
-- Plav' — Likes par événement (tâche 6)
-- Rejouable sans erreur. À lancer dans l'éditeur SQL de Supabase.
--
-- - Un like = (événement, utilisateur), une seule fois par personne.
-- - Chacun ne voit, n'ajoute et ne retire que SES likes (RLS).
-- - Le nombre de likes est public (visiteurs compris) via une fonction
--   qui ne renvoie que des nombres, jamais qui a liké.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_likes (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_likes_user_idx ON public.event_likes (user_id, created_at DESC);

ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_likes_select_own" ON public.event_likes;
CREATE POLICY "event_likes_select_own" ON public.event_likes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- On ne peut liker qu'en son nom, et seulement un événement qu'on a le droit de voir.
DROP POLICY IF EXISTS "event_likes_insert_own" ON public.event_likes;
CREATE POLICY "event_likes_insert_own" ON public.event_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));

DROP POLICY IF EXISTS "event_likes_delete_own" ON public.event_likes;
CREATE POLICY "event_likes_delete_own" ON public.event_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Pas de modification possible (un like s'ajoute ou se retire, c'est tout).
REVOKE UPDATE ON public.event_likes FROM authenticated, anon;

-- Nombre de likes par événement (public, nombres uniquement).
CREATE OR REPLACE FUNCTION public.get_event_like_counts(_event_ids UUID[])
RETURNS TABLE (event_id UUID, likes INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.event_id, count(*)::INTEGER
    FROM public.event_likes l
   WHERE l.event_id = ANY(_event_ids[1:500])
   GROUP BY l.event_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_event_like_counts(UUID[]) TO anon, authenticated;
