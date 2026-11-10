-- ============================================================
-- Vérification par email d'école + "Fait partie de [école]" (2026-11-10)
-- À lancer dans Supabase > SQL Editor, APRÈS student_verification.sql
-- et account_emails.sql. Peut être relancé sans risque.
--
-- - school_domains : domaines reconnus par école (gérés par les admins),
--   sous-domaines acceptés (etu.esme.fr → esme.fr) ;
-- - messageries grand public refusées comme preuve d'école (et seulement ici) ;
-- - jeton de confirmation : aléatoire, stocké haché, 24 h, usage unique ;
-- - domaine inconnu : demande d'ajout visible par les admins ;
-- - toute vérification (email ou justificatif) expire le 31 août ;
-- - contrôles au hasard des comptes validés automatiquement par justificatif.
--
-- ⚠️ Remplace deux fonctions de student_verification.sql :
--    protect_profile_verification() (nouvelles colonnes protégées, école
--    verrouillée pour les comptes vérifiés par email, date de fin de validité)
--    et is_verified() (tient compte de la date de fin de validité).
-- ============================================================

-- 1. Messageries grand public ------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_public_email_domain(_domain TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'gmail.com', 'googlemail.com',
      'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com',
      'yahoo.com', 'yahoo.fr', 'ymail.com',
      'icloud.com', 'me.com', 'mac.com',
      'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'bbox.fr', 'laposte.net',
      'aol.com', 'aol.fr', 'gmx.fr', 'gmx.com', 'gmx.de',
      'protonmail.com', 'proton.me', 'yandex.com', 'mail.com', 'zoho.com'
    ]) AS p
    WHERE lower(_domain) = p OR lower(_domain) LIKE '%.' || p
  );
$$;

-- Domaine d'une adresse email (NULL si l'adresse n'a pas un format valide).
CREATE OR REPLACE FUNCTION public.email_domain(_email TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(trim(_email)) ~ '^[a-z0-9._%+''-]+@([a-z0-9-]+\.)+[a-z]{2,}$'
    THEN split_part(lower(trim(_email)), '@', 2)
  END;
$$;

-- 2. Domaines des écoles ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL CHECK (length(trim(school_name)) BETWEEN 2 AND 120),
  domain      TEXT NOT NULL UNIQUE CHECK (domain ~ '^([a-z0-9-]+\.)+[a-z]{2,}$'),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_domains ENABLE ROW LEVEL SECURITY;

-- Domaine en minuscules, jamais une messagerie grand public.
CREATE OR REPLACE FUNCTION public.check_school_domain()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.domain := lower(trim(NEW.domain));
  NEW.school_name := trim(NEW.school_name);
  IF public.is_public_email_domain(NEW.domain) THEN
    RAISE EXCEPTION 'public_email_domain' USING HINT = 'Une messagerie grand public ne prouve pas l''appartenance à une école.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_domains_check ON public.school_domains;
CREATE TRIGGER school_domains_check
  BEFORE INSERT OR UPDATE ON public.school_domains
  FOR EACH ROW EXECUTE FUNCTION public.check_school_domain();

-- Gestion réservée aux admins (les étudiants passent par classify_school_email()).
DROP POLICY IF EXISTS "school_domains_admin" ON public.school_domains;
CREATE POLICY "school_domains_admin" ON public.school_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.school_domains (school_name, domain) VALUES ('ESME', 'esme.fr')
ON CONFLICT (domain) DO NOTHING;

-- known / unknown / public / invalid, et l'école correspondante.
CREATE OR REPLACE FUNCTION public.classify_school_email(_email TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _domain TEXT := public.email_domain(_email);
  _match  RECORD;
BEGIN
  IF _domain IS NULL THEN RETURN json_build_object('kind', 'invalid'); END IF;
  IF public.is_public_email_domain(_domain) THEN
    RETURN json_build_object('kind', 'public', 'domain', _domain);
  END IF;

  SELECT id, school_name, domain INTO _match
    FROM public.school_domains
   WHERE active AND (_domain = domain OR _domain LIKE '%.' || domain)
   ORDER BY length(domain) DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('kind', 'known', 'domain', _domain, 'school', _match.school_name, 'domain_id', _match.id);
  END IF;
  RETURN json_build_object('kind', 'unknown', 'domain', _domain);
END;
$$;

-- 3. Demandes d'ajout d'un domaine inconnu ------------------------------------
CREATE TABLE IF NOT EXISTS public.school_domain_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  domain      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  decided_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, domain)
);
CREATE INDEX IF NOT EXISTS school_domain_requests_pending_idx
  ON public.school_domain_requests (domain) WHERE status = 'pending';
ALTER TABLE public.school_domain_requests ENABLE ROW LEVEL SECURITY;

-- Lecture : ses propres demandes, ou toutes pour un admin. Écriture : fonction serveur school-email.
DROP POLICY IF EXISTS "school_domain_requests_select" ON public.school_domain_requests;
CREATE POLICY "school_domain_requests_select" ON public.school_domain_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.school_domain_requests FROM anon, authenticated;

-- 4. Jetons de confirmation (jamais lisibles depuis le navigateur) ------------
CREATE TABLE IF NOT EXISTS public.school_email_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,  -- SHA-256 du jeton, le jeton lui-même n'est jamais stocké
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_email_tokens_user_idx ON public.school_email_tokens (user_id, created_at);
ALTER TABLE public.school_email_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_email_tokens FROM anon, authenticated;

-- 5. Profil : méthode, validité, adresse d'école, contrôles -------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_method     TEXT CHECK (verification_method IN ('school_email', 'document')),
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_auto       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS school_email            TEXT,
  ADD COLUMN IF NOT EXISTS verification_audited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_audited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Une adresse d'école ne vérifie qu'un seul compte à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_school_email_unique
  ON public.profiles (lower(school_email)) WHERE verification_method = 'school_email';

-- Fin de l'année scolaire : le 31 août suivant (heure de Paris).
CREATE OR REPLACE FUNCTION public.school_year_end(_at TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT make_timestamptz(
    extract(year FROM _at AT TIME ZONE 'Europe/Paris')::int
      + CASE WHEN extract(month FROM _at AT TIME ZONE 'Europe/Paris') >= 9 THEN 1 ELSE 0 END,
    8, 31, 23, 59, 59, 'Europe/Paris');
$$;

-- 6. Protection du profil (remplace la version de student_verification.sql) ----
CREATE OR REPLACE FUNCTION public.protect_profile_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- auth.uid() est vide pour le serveur (clé service), le SQL Editor et pg_cron.
  _trusted BOOLEAN := auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin');
BEGIN
  IF NOT _trusted THEN
    IF TG_OP = 'INSERT' THEN
      NEW.verification_status     := 'unverified';
      NEW.verification_note       := NULL;
      NEW.verification_checks     := NULL;
      NEW.verification_attempts   := 0;
      NEW.verified_at             := NULL;
      NEW.student_doc_path        := NULL;
      NEW.verification_method     := NULL;
      NEW.verification_expires_at := NULL;
      NEW.verification_auto       := false;
      NEW.school_email            := NULL;
      NEW.verification_audited_at := NULL;
      NEW.verification_audited_by := NULL;
    ELSE
      NEW.verification_status     := OLD.verification_status;
      NEW.verification_note       := OLD.verification_note;
      NEW.verification_checks     := OLD.verification_checks;
      NEW.verification_attempts   := OLD.verification_attempts;
      NEW.verified_at             := OLD.verified_at;
      NEW.student_doc_path        := OLD.student_doc_path;
      NEW.verification_method     := OLD.verification_method;
      NEW.verification_expires_at := OLD.verification_expires_at;
      NEW.verification_auto       := OLD.verification_auto;
      NEW.school_email            := OLD.school_email;
      NEW.verification_audited_at := OLD.verification_audited_at;
      NEW.verification_audited_by := OLD.verification_audited_by;

      IF OLD.verification_status = 'verified' THEN
        IF OLD.verification_method = 'school_email' THEN
          -- École déduite du domaine de l'adresse : pas de saisie libre.
          NEW.school := OLD.school;
        ELSIF NEW.school IS DISTINCT FROM OLD.school OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
          -- Justificatif : changer de nom ou d'école annule la vérification.
          NEW.verification_status := 'unverified';
          NEW.verified_at         := NULL;
          NEW.verification_note   := 'Profil modifié : envoie un nouveau justificatif.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Méthode et date de fin de validité, quelle que soit la façon dont le compte est vérifié.
  IF NEW.verification_status = 'verified' THEN
    IF TG_OP = 'INSERT' OR OLD.verification_status IS DISTINCT FROM 'verified' THEN
      NEW.verification_method     := coalesce(NEW.verification_method, 'document');
      -- Validé par la machine (fonction serveur) et non par un admin.
      NEW.verification_auto       := auth.uid() IS NULL AND NEW.verification_method = 'document';
      NEW.verification_audited_at := NULL;
      NEW.verification_audited_by := NULL;
      NEW.verified_at             := coalesce(NEW.verified_at, now());
    END IF;
    NEW.verification_method     := coalesce(NEW.verification_method, 'document');
    NEW.verification_expires_at := coalesce(NEW.verification_expires_at, public.school_year_end(now()));
  ELSE
    NEW.verification_method     := NULL;
    NEW.verification_expires_at := NULL;
    NEW.verification_auto       := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_verification ON public.profiles;
CREATE TRIGGER profiles_protect_verification
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_verification();

-- Vérifié = statut "verified" ET date de fin de validité non dépassée.
CREATE OR REPLACE FUNCTION public.is_verified(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = _user_id AND verification_status = 'verified'
                    AND (verification_expires_at IS NULL OR verification_expires_at > now()));
$$;

-- Comptes déjà vérifiés : méthode "document", valables jusqu'au 31 août prochain.
UPDATE public.profiles
   SET verification_method     = 'document',
       verification_expires_at = public.school_year_end(now()),
       verification_auto       = verification_checks IS NOT NULL
                                 AND verification_note IS DISTINCT FROM 'Compte vérifié par un admin.'
 WHERE verification_status = 'verified' AND verification_expires_at IS NULL;

-- 7. Confirmation du lien (appelée par la fonction serveur school-email) -------
CREATE OR REPLACE FUNCTION public.consume_school_email_token(_token_hash TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tok   RECORD;
  _class JSON;
BEGIN
  SELECT * INTO _tok FROM public.school_email_tokens WHERE token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND OR _tok.used_at IS NOT NULL OR _tok.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  UPDATE public.school_email_tokens SET used_at = now() WHERE id = _tok.id;

  -- Le domaine est revérifié au moment du clic (il a pu être désactivé entre-temps).
  _class := public.classify_school_email(_tok.email);
  IF _class->>'kind' <> 'known' THEN
    RETURN json_build_object('ok', false, 'error', 'domain_not_recognized');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id <> _tok.user_id AND verification_method = 'school_email'
                AND lower(school_email) = lower(_tok.email)) THEN
    RETURN json_build_object('ok', false, 'error', 'email_in_use');
  END IF;

  UPDATE public.profiles
     SET verification_status     = 'verified',
         verification_method     = 'school_email',
         verification_note       = 'Vérifié avec ton adresse ' || _tok.email,
         verified_at             = now(),
         verification_expires_at = public.school_year_end(now()),
         school                  = _class->>'school',
         school_email            = lower(_tok.email),
         student_doc_path        = NULL
   WHERE id = _tok.user_id;

  RETURN json_build_object('ok', true, 'school', _class->>'school', 'user_id', _tok.user_id);
END;
$$;

-- 8. Expiration annuelle -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_student_verifications()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.profiles
     SET verification_status = 'unverified',
         verified_at         = NULL,
         verification_note   = 'Ta vérification étudiante a expiré (fin de l''année scolaire). Refais la démarche pour continuer à t''inscrire aux événements.'
   WHERE verification_status = 'verified'
     AND verification_expires_at IS NOT NULL AND verification_expires_at <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- 9. Contrôles au hasard (admins) --------------------------------------------
-- Tire au sort des comptes validés automatiquement par justificatif, pas encore contrôlés.
CREATE OR REPLACE FUNCTION public.pick_verification_audits(_count INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID, full_name TEXT, school TEXT, verified_at TIMESTAMPTZ,
  verification_checks JSONB, verification_note TEXT
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.school, p.verified_at, p.verification_checks, p.verification_note
    FROM public.profiles p
   WHERE p.verification_status = 'verified' AND p.verification_method = 'document'
     AND p.verification_auto AND p.verification_audited_at IS NULL
   ORDER BY random()
   LIMIT least(greatest(coalesce(_count, 5), 1), 50);
END;
$$;

CREATE OR REPLACE FUNCTION public.verification_audit_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (
    SELECT json_build_object(
      'to_check', count(*) FILTER (WHERE verification_audited_at IS NULL),
      'checked',  count(*) FILTER (WHERE verification_audited_at IS NOT NULL))
      FROM public.profiles
     WHERE verification_status = 'verified' AND verification_method = 'document' AND verification_auto);
END;
$$;

-- Conforme → marqué contrôlé. Non conforme → justificatif redemandé (email "refusé" avec le motif).
CREATE OR REPLACE FUNCTION public.record_verification_audit(_user_id UUID, _ok BOOLEAN, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _ok THEN
    UPDATE public.profiles
       SET verification_audited_at = now(), verification_audited_by = auth.uid()
     WHERE id = _user_id AND verification_status = 'verified';
  ELSE
    IF coalesce(trim(_note), '') = '' THEN RAISE EXCEPTION 'note_required'; END IF;
    UPDATE public.profiles
       SET verification_status = 'rejected',
           verified_at         = NULL,
           verification_note   = 'Contrôle aléatoire : ' || left(trim(_note), 200),
           verification_audited_at = now(),
           verification_audited_by = auth.uid()
     WHERE id = _user_id;
  END IF;
END;
$$;

-- 10. Droits d'exécution -----------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.check_school_domain()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_verification()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_school_email_token(TEXT)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_student_verifications()       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_school_email_token(TEXT)     TO service_role;

REVOKE EXECUTE ON FUNCTION public.classify_school_email(TEXT)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_verified(UUID)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pick_verification_audits(INTEGER)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verification_audit_stats()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_verification_audit(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.classify_school_email(TEXT)               TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_verified(UUID)                         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.pick_verification_audits(INTEGER)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.verification_audit_stats()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.record_verification_audit(UUID, BOOLEAN, TEXT) TO authenticated;

-- 11. Tâche quotidienne (pg_cron) : comptes expirés → non vérifiés --------------
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  PERFORM cron.schedule('plav-verification-expiry', '5 0 * * *', 'SELECT public.expire_student_verifications()');
EXCEPTION WHEN others THEN
  RAISE WARNING 'Planification impossible (%). Activez pg_cron dans Database > Extensions puis relancez ce script.', SQLERRM;
END
$cron$;
