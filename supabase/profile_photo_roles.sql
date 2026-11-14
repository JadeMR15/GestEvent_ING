-- ============================================================
-- Photo de profil réservée aux associations et aux écoles (2026-11-14)
-- Organisateur (son association), compte école (logo de l'école) et admin Plav'.
-- Les participants et bénévoles n'ont pas de photo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_have_avatar(_uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _uid AND role IN ('organizer', 'school_admin', 'admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.can_have_avatar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_have_avatar(UUID) TO authenticated;

-- Profil : refuse une nouvelle photo pour un compte qui n'y a pas droit.
CREATE OR REPLACE FUNCTION public.profiles_avatar_role()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.avatar_path IS NOT NULL
     AND NEW.avatar_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.avatar_path END)
     AND NOT public.can_have_avatar(NEW.id) THEN
    RAISE EXCEPTION 'avatar_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_avatar_role ON public.profiles;
CREATE TRIGGER profiles_avatar_role BEFORE INSERT OR UPDATE OF avatar_path ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_avatar_role();

-- Stockage : envoi de photo réservé aux mêmes comptes.
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
              AND public.can_have_avatar(auth.uid()));

-- Retire les photos déjà mises par des participants (le fichier est supprimé à part).
UPDATE public.profiles SET avatar_path = NULL
WHERE avatar_path IS NOT NULL AND NOT public.can_have_avatar(id);
