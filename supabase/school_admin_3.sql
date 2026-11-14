-- ============================================================
-- Espace administration des écoles — ÉTAPE 3 (2026-11-14)
-- À lancer APRÈS school_admin_2.sql.
-- 1. Logo des associations (colonne + stockage).
-- 2. Le compte admin Plav' n'est jamais rattaché à une école.
-- ============================================================

-- 1. Logo -------------------------------------------------------------------
ALTER TABLE public.associations ADD COLUMN IF NOT EXISTS logo_path TEXT;

-- Peut gérer une association : admin de son école, admin Plav', ou organisateur
-- membre validé de l'association.
CREATE OR REPLACE FUNCTION public.can_manage_association(_association_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.associations a
                  WHERE a.id = _association_id AND public.is_school_admin(a.school_id))
      OR EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND p.association_id = _association_id
                    AND p.membership_status = 'approved'
                    AND public.has_role(auth.uid(), 'organizer'));
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_association(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_association(UUID) TO authenticated;

-- Enregistre (ou retire) le logo ; les organisateurs n'ont pas le droit de modifier
-- le reste de l'association, d'où cette fonction dédiée.
CREATE OR REPLACE FUNCTION public.set_association_logo(_association_id UUID, _path TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_association(_association_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _path IS NOT NULL AND split_part(_path, '/', 1) <> _association_id::text THEN
    RAISE EXCEPTION 'invalid_path';
  END IF;
  UPDATE public.associations SET logo_path = _path WHERE id = _association_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_association_logo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_association_logo(UUID, TEXT) TO authenticated;

-- Bucket public (les logos s'affichent sur les événements) ; fichiers rangés par
-- association : <association_id>/<fichier>.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('association-logos', 'association-logos', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "association_logos_insert" ON storage.objects;
CREATE POLICY "association_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'association-logos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_association(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "association_logos_update" ON storage.objects;
CREATE POLICY "association_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'association-logos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_association(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "association_logos_delete" ON storage.objects;
CREATE POLICY "association_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'association-logos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_association(((storage.foldername(name))[1])::uuid));


-- 2. Admin Plav' hors des écoles ----------------------------------------------
-- À la validation d'une école, les comptes existants sont rattachés par nom d'école :
-- on exclut désormais l'admin plateforme (il n'appartient à aucune école).
CREATE OR REPLACE FUNCTION public.review_school(_school_id UUID, _approve BOOLEAN, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.schools
  SET status = CASE WHEN _approve THEN 'active' ELSE 'rejected' END,
      status_note = NULLIF(trim(coalesce(_note, '')), '')
  WHERE id = _school_id
  RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'school_not_found'; END IF;
  IF NOT _approve THEN RETURN; END IF;

  -- Comptes existants : même nom d'école, pas encore rattachés.
  UPDATE public.profiles p
  SET school_id = s.id,
      membership_status = CASE WHEN public.email_matches_school(u.email, s.email_domains) THEN 'approved' ELSE 'pending' END
  FROM auth.users u
  WHERE u.id = p.id AND p.school_id IS NULL
    AND coalesce(p.school, '') <> '' AND lower(trim(p.school)) = lower(s.name)
    AND NOT public.has_role(p.id, 'school_admin')
    AND NOT public.has_role(p.id, 'admin');

  -- Associations déjà utilisées par ces organisateurs (actives : elles existaient avant).
  INSERT INTO public.associations (school_id, name, status)
  SELECT DISTINCT ON (lower(trim(p.association))) s.id, left(trim(p.association), 120), 'active'
  FROM public.profiles p
  WHERE p.school_id = s.id AND length(trim(coalesce(p.association, ''))) >= 2
    AND public.has_role(p.id, 'organizer') AND NOT public.has_role(p.id, 'admin')
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles p SET association_id = a.id
  FROM public.associations a
  WHERE p.school_id = s.id AND p.association_id IS NULL AND a.school_id = s.id
    AND lower(trim(a.name)) = lower(trim(coalesce(p.association, '')))
    AND public.has_role(p.id, 'organizer');

  -- Événements existants de l'école.
  UPDATE public.events e
  SET school_id = s.id,
      association_id = (SELECT a.id FROM public.associations a
                        WHERE a.school_id = s.id AND lower(trim(a.name)) = lower(trim(coalesce(e.association, ''))))
  WHERE e.school_id IS NULL AND lower(trim(coalesce(e.school, ''))) = lower(s.name);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_school(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_school(UUID, BOOLEAN, TEXT) TO authenticated;

-- Nettoyage : comptes admin Plav' déjà rattachés à une école, et associations créées
-- uniquement à partir de leur profil (sans événement ni autre membre).
DELETE FROM public.associations a
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.association_id = a.id AND public.has_role(p.id, 'admin'))
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.association_id = a.id AND NOT public.has_role(p.id, 'admin'))
  AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.association_id = a.id);

UPDATE public.profiles p
SET school_id = NULL, association_id = NULL, membership_status = 'none'
WHERE public.has_role(p.id, 'admin') AND (p.school_id IS NOT NULL OR p.association_id IS NOT NULL);
