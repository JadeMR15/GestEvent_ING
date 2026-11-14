-- ============================================================
-- Albums photo des associations — 2026-11-14
-- À lancer APRÈS association_cover.sql.
-- Un album par soirée (ou thème), rempli par les organisateurs de l'association.
-- Visibilité : « public » (tous les comptes connectés) ou « attendees » (seulement les
-- inscrits à l'événement lié). Photos dans un stockage PRIVÉ : liens signés temporaires.
-- Fichiers : event-photos/<album_id>/<photo_id>.webp et <album_id>/thumb/<photo_id>.webp
-- ============================================================

-- 1. Tables ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.photo_albums (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES public.events(id) ON DELETE SET NULL,
  title          TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
  description    TEXT CHECK (description IS NULL OR length(description) <= 1000),
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'attendees')),
  cover_photo_id UUID,
  photo_count    INT NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at    TIMESTAMPTZ,
  -- « Réservé aux participants » n'a de sens qu'avec un événement lié.
  CHECK (visibility = 'public' OR event_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS photo_albums_assoc_idx ON public.photo_albums (association_id, created_at DESC);
ALTER TABLE public.photo_albums ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.album_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      UUID NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  thumb_path    TEXT NOT NULL,
  width         INT,
  height        INT,
  size_bytes    INT,
  original_name TEXT CHECK (original_name IS NULL OR length(original_name) <= 200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (split_part(path, '/', 1) = album_id::text AND split_part(thumb_path, '/', 1) = album_id::text)
);
CREATE INDEX IF NOT EXISTS album_photos_album_idx ON public.album_photos (album_id, created_at, id);
ALTER TABLE public.album_photos ENABLE ROW LEVEL SECURITY;


-- 2. Droits -------------------------------------------------------------------------------
-- Ajouter / supprimer des photos : organisateurs validés de l'association (et admin Plav').
CREATE OR REPLACE FUNCTION public.can_edit_album(_album_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.photo_albums a
                  WHERE a.id = _album_id AND public.can_post_association(a.association_id));
$$;

-- Voir les photos : l'équipe de l'association, son école (modération), l'admin ;
-- sinon album public, ou inscrit à la soirée pour un album réservé.
CREATE OR REPLACE FUNCTION public.can_view_album(_album_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.photo_albums a JOIN public.associations s ON s.id = a.association_id
    WHERE a.id = _album_id AND (
      public.can_post_association(a.association_id)
      OR public.can_manage_association(a.association_id)
      OR (s.status = 'active' AND (
            a.visibility = 'public'
            OR EXISTS (SELECT 1 FROM public.registrations r
                        WHERE r.event_id = a.event_id AND r.user_id = auth.uid()
                          AND r.status IN ('registered', 'attended'))))
    ));
$$;
REVOKE EXECUTE ON FUNCTION public.can_edit_album(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_album(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_album(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_album(UUID) TO authenticated;

-- Albums : la liste est visible (avec un cadenas si réservé) ; les photos, selon can_view_album.
DROP POLICY IF EXISTS "albums_select" ON public.photo_albums;
CREATE POLICY "albums_select" ON public.photo_albums FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.associations s WHERE s.id = association_id AND s.status = 'active')
         OR public.can_post_association(association_id) OR public.can_manage_association(association_id));
DROP POLICY IF EXISTS "albums_insert" ON public.photo_albums;
CREATE POLICY "albums_insert" ON public.photo_albums FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_post_association(association_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.association_id = photo_albums.association_id)));
DROP POLICY IF EXISTS "albums_update" ON public.photo_albums;
CREATE POLICY "albums_update" ON public.photo_albums FOR UPDATE TO authenticated
  USING (public.can_post_association(association_id))
  WITH CHECK (public.can_post_association(association_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.association_id = photo_albums.association_id)));
DROP POLICY IF EXISTS "albums_delete" ON public.photo_albums;
CREATE POLICY "albums_delete" ON public.photo_albums FOR DELETE TO authenticated
  USING (public.can_post_association(association_id) OR public.can_manage_association(association_id));

DROP POLICY IF EXISTS "album_photos_select" ON public.album_photos;
CREATE POLICY "album_photos_select" ON public.album_photos FOR SELECT TO authenticated
  USING (public.can_view_album(album_id));
DROP POLICY IF EXISTS "album_photos_insert" ON public.album_photos;
CREATE POLICY "album_photos_insert" ON public.album_photos FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_album(album_id));
DROP POLICY IF EXISTS "album_photos_delete" ON public.album_photos;
CREATE POLICY "album_photos_delete" ON public.album_photos FOR DELETE TO authenticated
  USING (public.can_edit_album(album_id)
    OR EXISTS (SELECT 1 FROM public.photo_albums a WHERE a.id = album_id AND public.can_manage_association(a.association_id)));

-- Nombre de photos et photo de couverture tenus à jour automatiquement.
CREATE OR REPLACE FUNCTION public.album_photos_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photo_albums SET photo_count = photo_count + 1,
           cover_photo_id = coalesce(cover_photo_id, NEW.id)
    WHERE id = NEW.album_id;
  ELSE
    UPDATE public.photo_albums SET photo_count = greatest(photo_count - 1, 0),
           cover_photo_id = CASE WHEN cover_photo_id = OLD.id
             THEN (SELECT p.id FROM public.album_photos p WHERE p.album_id = OLD.album_id AND p.id <> OLD.id ORDER BY p.created_at LIMIT 1)
             ELSE cover_photo_id END
    WHERE id = OLD.album_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS album_photos_count ON public.album_photos;
CREATE TRIGGER album_photos_count AFTER INSERT OR DELETE ON public.album_photos
  FOR EACH ROW EXECUTE FUNCTION public.album_photos_count();


-- 3. Stockage privé ------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-photos', 'event-photos', false, 8388608, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "event_photos_select" ON storage.objects;
CREATE POLICY "event_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_view_album(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "event_photos_insert" ON storage.objects;
CREATE POLICY "event_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_edit_album(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "event_photos_delete" ON storage.objects;
CREATE POLICY "event_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND (public.can_edit_album(((storage.foldername(name))[1])::uuid)
         OR EXISTS (SELECT 1 FROM public.photo_albums a
                     WHERE a.id = ((storage.foldername(name))[1])::uuid AND public.can_manage_association(a.association_id))));


-- 4. « Les photos sont en ligne » ---------------------------------------------------------
-- Une seule fois par album : les inscrits de la soirée, et les abonnés si l'album est public.
CREATE OR REPLACE FUNCTION public.notify_album(_album_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a   RECORD;
  n   INT := 0;
  r   RECORD;
BEGIN
  IF NOT public.can_edit_album(_album_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT al.*, s.name AS association_name INTO a
  FROM public.photo_albums al JOIN public.associations s ON s.id = al.association_id WHERE al.id = _album_id;
  IF a.notified_at IS NOT NULL THEN RAISE EXCEPTION 'already_notified'; END IF;
  IF a.photo_count = 0 THEN RAISE EXCEPTION 'album_empty'; END IF;
  UPDATE public.photo_albums SET notified_at = now() WHERE id = _album_id;
  FOR r IN
    SELECT DISTINCT u.user_id FROM (
      SELECT reg.user_id FROM public.registrations reg
       WHERE a.event_id IS NOT NULL AND reg.event_id = a.event_id AND reg.status IN ('registered', 'attended')
      UNION
      SELECT f.user_id FROM public.association_follows f
       WHERE a.visibility = 'public' AND f.association_id = a.association_id
    ) u
  LOOP
    PERFORM public.enqueue_push(r.user_id, '📸 ' || a.association_name,
      'Les photos « ' || a.title || ' » sont en ligne (' || a.photo_count || ' photos).',
      '/albums/' || a.id, 'album-' || a.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_album(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_album(UUID) TO authenticated;
