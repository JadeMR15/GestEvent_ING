-- ============================================================
-- Espace administration des écoles — ÉTAPE 5 (2026-11-14)
-- À lancer APRÈS school_admin_4.sql.
-- L'association d'un organisateur est fixée par l'école :
-- 1. Un organisateur est toujours « en attente » tant que l'école ne l'a pas validé
--    (avant : validé d'office si son email était sur le domaine de l'école, donc
--    n'importe quel étudiant pouvait publier au nom de n'importe quelle association).
-- 2. Une fois validé, il ne peut plus changer d'association ni d'école lui-même.
--    Pour changer, l'école retire son rattachement (il peut alors en choisir une autre).
-- Les événements prennent déjà l'association du profil (trigger events_school_scope).
-- ============================================================

CREATE OR REPLACE FUNCTION public._attach_to_school(
  _uid UUID, _school_id UUID, _association_id UUID, _new_association TEXT, _as_organizer BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s      RECORD;
  _aid   UUID;
  _aname TEXT;
  _email TEXT;
  _name  TEXT := left(trim(coalesce(_new_association, '')), 120);
BEGIN
  SELECT id, name, email_domains INTO s FROM public.schools WHERE id = _school_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'school_not_found'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  IF _as_organizer THEN
    IF _association_id IS NOT NULL THEN
      SELECT id, name INTO _aid, _aname FROM public.associations
      WHERE id = _association_id AND school_id = s.id AND status <> 'suspended';
      IF NOT FOUND THEN RAISE EXCEPTION 'association_not_found'; END IF;
    ELSIF length(_name) >= 2 THEN
      SELECT id, name INTO _aid, _aname FROM public.associations
      WHERE school_id = s.id AND lower(trim(name)) = lower(_name);
      IF NOT FOUND THEN
        INSERT INTO public.associations (school_id, name, status, created_by)
        VALUES (s.id, _name, 'pending', _uid)
        RETURNING id, name INTO _aid, _aname;
      END IF;
    ELSE
      RAISE EXCEPTION 'association_required';
    END IF;
  END IF;

  UPDATE public.profiles SET
    school_id         = s.id,
    school            = s.name,
    association_id    = _aid,
    association       = COALESCE(_aname, ''),
    -- Organisateur : validé par l'école uniquement. Participant : le domaine suffit.
    membership_status = CASE
      WHEN _as_organizer THEN 'pending'
      WHEN public.email_matches_school(_email, s.email_domains) THEN 'approved'
      ELSE 'pending' END
  WHERE id = _uid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._attach_to_school(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_school(_school_id UUID, _association_id UUID DEFAULT NULL, _new_association TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.has_role(auth.uid(), 'school_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Organisateur validé par son école : association verrouillée.
  IF public.has_role(auth.uid(), 'organizer') AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND association_id IS NOT NULL AND membership_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'association_locked';
  END IF;
  PERFORM public._attach_to_school(auth.uid(), _school_id, _association_id, _new_association,
                                   public.has_role(auth.uid(), 'organizer'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_school(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_school(UUID, UUID, TEXT) TO authenticated;
