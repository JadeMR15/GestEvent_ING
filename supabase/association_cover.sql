-- ============================================================
-- Photo de couverture des associations — 2026-11-14
-- À lancer APRÈS social.sql.
-- Rangée dans le même stockage que le logo (association-logos/<association_id>/…),
-- donc avec les mêmes droits : organisateur validé, école de l'association, admin Plav'.
-- ============================================================

ALTER TABLE public.associations ADD COLUMN IF NOT EXISTS cover_path TEXT;

CREATE OR REPLACE FUNCTION public.set_association_cover(_association_id UUID, _path TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_association(_association_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _path IS NOT NULL AND split_part(_path, '/', 1) <> _association_id::text THEN
    RAISE EXCEPTION 'invalid_path';
  END IF;
  UPDATE public.associations SET cover_path = _path WHERE id = _association_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_association_cover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_association_cover(UUID, TEXT) TO authenticated;

-- Une couverture fait plus de 2 Mo avant compression côté navigateur : on laisse 5 Mo.
UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'association-logos';
