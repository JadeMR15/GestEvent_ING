-- ============================================================
-- Côté social — 2026-11-14
-- À lancer APRÈS push_notifications.sql.
-- 1. Profil public des associations (bio, Instagram, site).
-- 2. Abonnements aux associations.
-- 3. Actualités publiées par les associations (texte, photo, événement lié) + « j'aime ».
-- 4. Notifications push aux abonnés : nouvelle actualité, nouvel événement.
-- ============================================================

-- 1. Profil public ------------------------------------------------------------------
ALTER TABLE public.associations ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.associations ADD COLUMN IF NOT EXISTS website   TEXT;

-- Organisateur validé de l'association (ou admin Plav') : publie et modifie le profil public.
CREATE OR REPLACE FUNCTION public.can_post_association(_association_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.associations a ON a.id = p.association_id
                  WHERE p.id = auth.uid() AND p.association_id = _association_id
                    AND p.membership_status = 'approved' AND a.status = 'active'
                    AND public.has_role(auth.uid(), 'organizer'));
$$;
REVOKE EXECUTE ON FUNCTION public.can_post_association(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_post_association(UUID) TO authenticated;

-- Bio et liens : l'organisateur ne peut pas modifier le reste (nom, statut…), d'où cette fonction.
CREATE OR REPLACE FUNCTION public.update_association_profile(_association_id UUID, _description TEXT, _instagram TEXT, _website TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _insta TEXT := nullif(regexp_replace(trim(coalesce(_instagram, '')), '^(https?://)?(www\.)?instagram\.com/|^@|/+$', '', 'g'), '');
  _site  TEXT := nullif(trim(coalesce(_website, '')), '');
BEGIN
  IF NOT (public.can_post_association(_association_id) OR public.can_manage_association(_association_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _insta IS NOT NULL AND _insta !~ '^[A-Za-z0-9._]{1,30}$' THEN RAISE EXCEPTION 'invalid_instagram'; END IF;
  IF _site IS NOT NULL THEN
    IF _site !~* '^https?://' THEN _site := 'https://' || _site; END IF;
    IF _site !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' OR length(_site) > 200 THEN RAISE EXCEPTION 'invalid_website'; END IF;
  END IF;
  UPDATE public.associations
  SET description = nullif(left(trim(coalesce(_description, '')), 1000), ''), instagram = _insta, website = _site
  WHERE id = _association_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_association_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_association_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- 2. Abonnements ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.association_follows (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, association_id)
);
CREATE INDEX IF NOT EXISTS association_follows_assoc_idx ON public.association_follows (association_id);
ALTER TABLE public.association_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_select_own" ON public.association_follows;
CREATE POLICY "follows_select_own" ON public.association_follows FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "follows_insert_own" ON public.association_follows;
CREATE POLICY "follows_insert_own" ON public.association_follows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.associations a WHERE a.id = association_id AND a.status = 'active'));
DROP POLICY IF EXISTS "follows_delete_own" ON public.association_follows;
CREATE POLICY "follows_delete_own" ON public.association_follows FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Nombre d'abonnés (les abonnés eux-mêmes restent privés).
CREATE OR REPLACE FUNCTION public.association_follower_counts(_ids UUID[])
RETURNS TABLE (association_id UUID, followers INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, (SELECT count(*) FROM public.association_follows f WHERE f.association_id = a.id)::int
  FROM public.associations a WHERE a.id = ANY (_ids);
$$;
GRANT EXECUTE ON FUNCTION public.association_follower_counts(UUID[]) TO authenticated, anon;


-- 3. Actualités ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.association_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  author_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body           TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  image_path     TEXT CHECK (image_path IS NULL OR (image_path LIKE association_id::text || '/%' AND length(image_path) <= 200)),
  event_id       UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(trim(body)) > 0 OR image_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS association_posts_assoc_idx ON public.association_posts (association_id, created_at DESC);
CREATE INDEX IF NOT EXISTS association_posts_created_idx ON public.association_posts (created_at DESC);
ALTER TABLE public.association_posts ENABLE ROW LEVEL SECURITY;

-- Lecture : actualités des associations actives (tout le monde, comme les événements publics).
DROP POLICY IF EXISTS "posts_select" ON public.association_posts;
CREATE POLICY "posts_select" ON public.association_posts FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.associations a WHERE a.id = association_id AND a.status = 'active')
         OR (auth.uid() IS NOT NULL AND public.can_manage_association(association_id)));
DROP POLICY IF EXISTS "posts_insert" ON public.association_posts;
CREATE POLICY "posts_insert" ON public.association_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_post_association(association_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.association_id = association_posts.association_id)));
-- Suppression : l'auteur, un organisateur de l'association, ou l'école (modération).
DROP POLICY IF EXISTS "posts_delete" ON public.association_posts;
CREATE POLICY "posts_delete" ON public.association_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_post_association(association_id) OR public.can_manage_association(association_id));

-- Photos des actualités : <association_id>/<fichier>, publiques.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('post-images', 'post-images', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "post_images_insert" ON storage.objects;
CREATE POLICY "post_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-images'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_post_association(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "post_images_delete" ON storage.objects;
CREATE POLICY "post_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-images'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (public.can_post_association(((storage.foldername(name))[1])::uuid)
         OR public.can_manage_association(((storage.foldername(name))[1])::uuid)));

-- « J'aime » sur les actualités.
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    UUID NOT NULL REFERENCES public.association_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_likes_select_own" ON public.post_likes;
CREATE POLICY "post_likes_select_own" ON public.post_likes FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "post_likes_insert_own" ON public.post_likes;
CREATE POLICY "post_likes_insert_own" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "post_likes_delete_own" ON public.post_likes;
CREATE POLICY "post_likes_delete_own" ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.post_like_counts(_ids UUID[])
RETURNS TABLE (post_id UUID, likes INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id)::int
  FROM public.association_posts p WHERE p.id = ANY (_ids);
$$;
GRANT EXECUTE ON FUNCTION public.post_like_counts(UUID[]) TO authenticated, anon;


-- 4. Notifications aux abonnés ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_on_association_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name TEXT;
  r     RECORD;
BEGIN
  SELECT name INTO _name FROM public.associations WHERE id = NEW.association_id;
  FOR r IN SELECT user_id FROM public.association_follows WHERE association_id = NEW.association_id LOOP
    PERFORM public.enqueue_push(r.user_id, coalesce(_name, 'Une association'),
      coalesce(nullif(trim(NEW.body), ''), 'a publié une photo.'),
      '/associations/' || NEW.association_id, 'post-' || NEW.association_id);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push post: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_association_post ON public.association_posts;
CREATE TRIGGER push_on_association_post AFTER INSERT ON public.association_posts
  FOR EACH ROW EXECUTE FUNCTION public.push_on_association_post();

-- Nouvel événement visible (publié et validé si besoin) : une seule fois par événement.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS followers_notified_at TIMESTAMPTZ;
-- Pas de notification pour les événements déjà en ligne.
UPDATE public.events SET followers_notified_at = now() WHERE followers_notified_at IS NULL;

-- Nommé « zz_ » : s'exécute après events_school_scope, qui fixe le statut de validation.
CREATE OR REPLACE FUNCTION public.zz_events_notify_followers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.followers_notified_at IS NOT NULL OR NEW.association_id IS NULL
     OR NEW.status NOT IN ('published', 'private')
     OR NEW.approval_status NOT IN ('not_required', 'approved')
     OR NEW.starts_at < now() THEN
    RETURN NEW;
  END IF;
  NEW.followers_notified_at := now();
  BEGIN
    FOR r IN SELECT f.user_id FROM public.association_follows f
             WHERE f.association_id = NEW.association_id
               -- Événement réservé à l'école : seulement ses membres.
               AND (NEW.status <> 'private' OR EXISTS (
                     SELECT 1 FROM public.profiles p WHERE p.id = f.user_id
                       AND p.school_id = NEW.school_id AND p.membership_status = 'approved')) LOOP
      PERFORM public.enqueue_push(r.user_id, 'Nouvel événement · ' || coalesce(NEW.association, 'association'),
        NEW.title || ' — ' || to_char(NEW.starts_at AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI'),
        '/events/' || NEW.id, 'event-' || NEW.id);
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'push followers: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_events_notify_followers ON public.events;
CREATE TRIGGER zz_events_notify_followers BEFORE INSERT OR UPDATE OF status, approval_status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.zz_events_notify_followers();
