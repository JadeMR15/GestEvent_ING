-- ============================================================
-- Vérification étudiante par justificatif (2026-11-09)
-- À lancer dans Supabase > SQL Editor. Peut être relancé sans risque.
--
-- - chaque profil a un statut : unverified, pending, review, verified, rejected
-- - un compte non vérifié peut naviguer, mais ne peut ni s'inscrire
--   à un événement ni en créer un
-- - seul le serveur (fonction Vercel) et les admins changent le statut
-- - les justificatifs sont rangés dans un espace privé, un dossier par étudiant
-- ============================================================

-- 1. Statut de vérification sur les profils ---------------------------------
DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('unverified', 'pending', 'review', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status   public.verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_note     TEXT,
  ADD COLUMN IF NOT EXISTS verification_checks   JSONB,
  ADD COLUMN IF NOT EXISTS verification_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_doc_path      TEXT;

CREATE INDEX IF NOT EXISTS profiles_verification_status_idx ON public.profiles (verification_status);

-- 2. Un utilisateur ne peut pas modifier son propre statut ------------------
-- auth.uid() est vide pour le serveur (clé service) et le SQL Editor : ils passent.
CREATE OR REPLACE FUNCTION public.protect_profile_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status   := 'unverified';
    NEW.verification_note     := NULL;
    NEW.verification_checks   := NULL;
    NEW.verification_attempts := 0;
    NEW.verified_at           := NULL;
    NEW.student_doc_path      := NULL;
    RETURN NEW;
  END IF;

  NEW.verification_status   := OLD.verification_status;
  NEW.verification_note     := OLD.verification_note;
  NEW.verification_checks   := OLD.verification_checks;
  NEW.verification_attempts := OLD.verification_attempts;
  NEW.verified_at           := OLD.verified_at;
  NEW.student_doc_path      := OLD.student_doc_path;

  -- Changer de nom ou d'école annule la vérification.
  IF OLD.verification_status = 'verified'
     AND (NEW.school IS DISTINCT FROM OLD.school OR NEW.full_name IS DISTINCT FROM OLD.full_name) THEN
    NEW.verification_status := 'unverified';
    NEW.verified_at         := NULL;
    NEW.verification_note   := 'Profil modifié : envoie un nouveau justificatif.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_verification ON public.profiles;
CREATE TRIGGER profiles_protect_verification
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_verification();

-- Les admins peuvent valider / refuser les dossiers des autres.
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Inscriptions et création d'événements réservées aux comptes vérifiés ---
CREATE OR REPLACE FUNCTION public.is_verified(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND verification_status = 'verified');
$$;
REVOKE EXECUTE ON FUNCTION public.is_verified(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_verified_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'account_not_verified'
      USING HINT = 'Le compte doit être vérifié avec un justificatif étudiant.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.require_verified_account() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_require_verified ON public.registrations;
CREATE TRIGGER registrations_require_verified
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_account();

DROP TRIGGER IF EXISTS events_require_verified ON public.events;
CREATE TRIGGER events_require_verified
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_account();

-- 4. Espace privé pour les justificatifs -------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-documents', 'student-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Chaque étudiant ne touche qu'à son dossier "<son id>/..." ; les admins voient tout.
DROP POLICY IF EXISTS "student_docs_insert_own" ON storage.objects;
CREATE POLICY "student_docs_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "student_docs_select_own_or_admin" ON storage.objects;
CREATE POLICY "student_docs_select_own_or_admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "student_docs_delete_own_or_admin" ON storage.objects;
CREATE POLICY "student_docs_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

-- 5. Contrôle : règles de stockage existantes ----------------------------------
-- Une règle SELECT sans "bucket_id = ..." exposerait aussi les justificatifs.
-- Toutes les lignes ci-dessous doivent mentionner un bucket précis.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
