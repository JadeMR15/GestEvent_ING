-- ============================================================
-- Espace administration des écoles — ÉTAPE 2 / 2 (2026-11-13)
-- À lancer dans Supabase > SQL Editor, APRÈS school_admin_1_role.sql.
-- Peut être relancé sans risque.
--
-- - une école (schools) s'inscrit elle-même, avec ses domaines email ;
--   l'admin plateforme la valide (pending → active)
-- - une école a des associations ; chaque organisateur appartient à une
--   association, donc à une école
-- - rattachement automatique si l'email est sur un domaine de l'école,
--   sinon l'admin de l'école accepte le membre
-- - par association, l'école peut exiger de valider chaque événement
--   avant publication (approval_status)
-- - messagerie école ↔ association (motif de refus, échanges)
-- - un participant peut être non étudiant : pas de justificatif, mais
--   pas d'accès aux événements « privés » (réservés à l'école)
-- ============================================================


-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email_domains TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  status_note   TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_unique ON public.schools (lower(trim(name)));
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.school_admins (
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id)
);
CREATE INDEX IF NOT EXISTS school_admins_user_idx ON public.school_admins (user_id);
ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.associations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description       TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  -- true : chaque événement doit être validé par l'école avant d'être visible
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS associations_school_name_unique ON public.associations (school_id, lower(trim(name)));
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

-- Profils : rattachement école / association
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id         UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS association_id    UUID REFERENCES public.associations(id) ON DELETE SET NULL,
  -- none : pas d'école ; pending : en attente de l'école ; approved ; rejected
  ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_student        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_membership_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_membership_status_check
  CHECK (membership_status IN ('none', 'pending', 'approved', 'rejected'));
CREATE INDEX IF NOT EXISTS profiles_school_idx      ON public.profiles (school_id);
CREATE INDEX IF NOT EXISTS profiles_association_idx ON public.profiles (association_id);

-- Événements : école / association + validation
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS school_id       UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS association_id  UUID REFERENCES public.associations(id) ON DELETE SET NULL,
  -- not_required : visible dès publication ; pending : en attente de l'école ;
  -- approved : validé ; rejected : refusé (motif dans approval_note)
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_note   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at     TIMESTAMPTZ;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_approval_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_approval_status_check
  CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'));
CREATE INDEX IF NOT EXISTS events_school_idx      ON public.events (school_id);
CREATE INDEX IF NOT EXISTS events_association_idx ON public.events (association_id);
CREATE INDEX IF NOT EXISTS events_approval_idx    ON public.events (approval_status) WHERE approval_status = 'pending';

-- Messages école ↔ association
CREATE TABLE IF NOT EXISTS public.school_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES public.events(id) ON DELETE SET NULL,
  sender_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_school    BOOLEAN NOT NULL,
  body           TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_messages_assoc_idx ON public.school_messages (association_id, created_at DESC);
ALTER TABLE public.school_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. Fonctions utilitaires
-- ============================================================

-- Nettoie une liste de domaines : minuscules, sans "@", sans doublons.
-- Refuse les messageries grand public (gmail, outlook…) : n'importe qui y a un compte.
CREATE OR REPLACE FUNCTION public.normalize_school_domains(_domains TEXT[])
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  d      TEXT;
  result TEXT[] := '{}';
  public_domains CONSTANT TEXT[] := ARRAY[
    'gmail.com','googlemail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com',
    'outlook.fr','live.com','live.fr','msn.com','icloud.com','me.com','mac.com','orange.fr','wanadoo.fr',
    'free.fr','sfr.fr','neuf.fr','laposte.net','bbox.fr','aol.com','gmx.fr','gmx.com','proton.me',
    'protonmail.com','yandex.com','mail.com'];
BEGIN
  FOREACH d IN ARRAY COALESCE(_domains, '{}') LOOP
    d := regexp_replace(lower(trim(d)), '^@', '');
    CONTINUE WHEN d = '';
    IF d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR length(d) > 100 THEN
      RAISE EXCEPTION 'invalid_domain' USING DETAIL = d;
    END IF;
    IF d = ANY (public_domains) THEN
      RAISE EXCEPTION 'public_domain' USING DETAIL = d;
    END IF;
    IF NOT d = ANY (result) THEN result := result || d; END IF;
  END LOOP;
  IF coalesce(array_length(result, 1), 0) = 0 THEN RAISE EXCEPTION 'domain_required'; END IF;
  IF array_length(result, 1) > 10 THEN RAISE EXCEPTION 'too_many_domains'; END IF;
  RETURN result;
END;
$$;

-- L'email est-il sur un des domaines (ou sous-domaine : etu.ecole.fr pour ecole.fr) ?
CREATE OR REPLACE FUNCTION public.email_matches_school(_email TEXT, _domains TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(COALESCE(_domains, '{}')) d
    WHERE lower(split_part(_email, '@', 2)) = d
       OR lower(split_part(_email, '@', 2)) LIKE '%.' || d
  );
$$;

-- L'utilisateur connecté administre-t-il cette école (validée) ?
CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _school_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_admins sa
    JOIN public.schools s ON s.id = sa.school_id
    WHERE sa.user_id = auth.uid() AND sa.school_id = _school_id AND s.status = 'active'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_school_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_admin(UUID) TO authenticated;

-- Événement « privé » (réservé à l'école) : qui peut le voir ?
-- Membres de l'école (domaine email reconnu ou validés par l'école, ou étudiant vérifié).
-- Ancien fonctionnement conservé pour les événements pas encore rattachés : nom d'école identique.
CREATE OR REPLACE FUNCTION public.can_see_private_event(_school_id UUID, _school TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        (_school_id IS NOT NULL AND p.school_id = _school_id
          AND (p.membership_status = 'approved' OR p.verification_status = 'verified'))
        OR (_school_id IS NULL AND coalesce(p.school, '') <> ''
          AND lower(trim(p.school)) = lower(trim(coalesce(_school, ''))))
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_private_event(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_private_event(UUID, TEXT) TO authenticated;

-- Infos école / association d'un organisateur (lecture sans passer par les règles RLS).
CREATE OR REPLACE FUNCTION public.organizer_scope(_user_id UUID)
RETURNS TABLE (school_id UUID, school_name TEXT, association_id UUID, association_name TEXT,
               association_status TEXT, membership_status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.school_id, s.name, p.association_id, a.name, a.status, p.membership_status
  FROM public.profiles p
  LEFT JOIN public.schools s      ON s.id = p.school_id AND s.status = 'active'
  LEFT JOIN public.associations a ON a.id = p.association_id
  WHERE p.id = _user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.organizer_scope(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organizer_scope(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.association_requires_approval(_association_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT requires_approval FROM public.associations WHERE id = _association_id), false);
$$;
REVOKE EXECUTE ON FUNCTION public.association_requires_approval(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.association_requires_approval(UUID) TO authenticated;


-- ============================================================
-- 3. Garde-fous (triggers)
-- ============================================================
-- Principe : une modification venant directement du navigateur s'exécute en
-- rôle "authenticated". Les fonctions serveur ci-dessous (SECURITY DEFINER)
-- s'exécutent en rôle propriétaire : ce sont les seules à pouvoir toucher aux
-- champs sensibles (rattachement, validation).

-- 3a. Écoles : domaines nettoyés ; statut modifiable uniquement par l'admin plateforme.
CREATE OR REPLACE FUNCTION public.schools_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name          := trim(NEW.name);
  NEW.email_domains := public.normalize_school_domains(NEW.email_domains);
  NEW.updated_at    := now();
  IF TG_OP = 'UPDATE' AND current_user IN ('authenticated', 'anon')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status      := OLD.status;
    NEW.status_note := OLD.status_note;
    NEW.created_by  := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS schools_before_write ON public.schools;
CREATE TRIGGER schools_before_write BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.schools_before_write();

-- Renommage d'école : on met à jour le nom affiché sur ses événements.
CREATE OR REPLACE FUNCTION public.schools_after_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.events SET school = NEW.name WHERE school_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.schools_after_rename() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS schools_after_rename ON public.schools;
CREATE TRIGGER schools_after_rename AFTER UPDATE OF name ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.schools_after_rename();

-- 3b. Associations : école figée ; renommage répercuté ; levée de la validation.
CREATE OR REPLACE FUNCTION public.associations_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name       := trim(NEW.name);
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.school_id  := OLD.school_id;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS associations_before_write ON public.associations;
CREATE TRIGGER associations_before_write BEFORE INSERT OR UPDATE ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.associations_before_write();

CREATE OR REPLACE FUNCTION public.associations_after_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.events   SET association = NEW.name WHERE association_id = NEW.id;
    UPDATE public.profiles SET association = NEW.name WHERE association_id = NEW.id;
  END IF;
  -- L'école ne demande plus de validation : les événements en attente sont publiés.
  IF OLD.requires_approval AND NOT NEW.requires_approval THEN
    UPDATE public.events SET approval_status = 'not_required'
    WHERE association_id = NEW.id AND approval_status = 'pending';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.associations_after_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS associations_after_update ON public.associations;
CREATE TRIGGER associations_after_update AFTER UPDATE ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.associations_after_update();

-- 3c. Profils : l'utilisateur ne peut pas changer seul son école / association /
-- statut de membre (il passe par join_school). Le nom d'école suit l'école rattachée.
CREATE OR REPLACE FUNCTION public.protect_profile_school()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.school_id         := NULL;
    NEW.association_id    := NULL;
    NEW.membership_status := 'none';
    RETURN NEW;
  END IF;
  NEW.school_id         := OLD.school_id;
  NEW.association_id    := OLD.association_id;
  NEW.membership_status := OLD.membership_status;
  IF OLD.school_id      IS NOT NULL THEN NEW.school      := OLD.school;      END IF;
  IF OLD.association_id IS NOT NULL THEN NEW.association := OLD.association; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_school ON public.profiles;
CREATE TRIGGER profiles_protect_school BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_school();

-- 3d. Événements : école / association imposées par le profil de l'organisateur,
-- champs de validation réservés à l'école, passage en attente si l'asso l'exige.
CREATE OR REPLACE FUNCTION public.events_school_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  -- Fonctions serveur (validation par l'école, etc.) et admin plateforme : libres.
  IF current_user NOT IN ('authenticated', 'anon') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO r FROM public.organizer_scope(NEW.organizer_id);
    IF r.school_id IS NOT NULL THEN
      IF r.association_id IS NULL THEN
        RAISE EXCEPTION 'association_required' USING HINT = 'Choisis ton association dans Paramètres.';
      END IF;
      IF r.membership_status <> 'approved' THEN
        RAISE EXCEPTION 'membership_pending' USING HINT = 'Ton école doit d''abord valider ton rattachement.';
      END IF;
      IF r.association_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'association_inactive' USING HINT = 'Ton association doit être validée par l''école.';
      END IF;
      NEW.school_id      := r.school_id;
      NEW.association_id := r.association_id;
      NEW.school         := r.school_name;
      NEW.association    := r.association_name;
    ELSE
      NEW.school_id      := NULL;
      NEW.association_id := NULL;
    END IF;
    NEW.approval_status := 'not_required';
    NEW.approval_note   := NULL;
    NEW.reviewed_by     := NULL;
    NEW.reviewed_at     := NULL;
  ELSE
    NEW.school_id       := OLD.school_id;
    NEW.association_id  := OLD.association_id;
    IF OLD.school_id IS NOT NULL THEN
      NEW.school      := OLD.school;
      NEW.association := OLD.association;
    END IF;
    NEW.approval_status := OLD.approval_status;
    NEW.approval_note   := OLD.approval_note;
    NEW.reviewed_by     := OLD.reviewed_by;
    NEW.reviewed_at     := OLD.reviewed_at;
  END IF;

  IF NEW.association_id IS NOT NULL AND public.association_requires_approval(NEW.association_id) THEN
    -- Publier (public ou privé) un événement non validé → en attente de l'école.
    -- Un événement refusé puis republié repart en validation.
    IF NEW.status IN ('published', 'private') AND NEW.approval_status <> 'approved' THEN
      NEW.approval_status := 'pending';
    ELSIF NEW.status = 'draft' AND NEW.approval_status = 'pending' THEN
      NEW.approval_status := 'not_required';
    END IF;
  ELSIF NEW.approval_status IN ('pending', 'rejected') THEN
    NEW.approval_status := 'not_required';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_school_scope ON public.events;
CREATE TRIGGER events_school_scope BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_school_scope();

-- 3e. Inscriptions aux événements (remplace la règle « compte vérifié obligatoire ») :
-- - événement en attente / refusé : impossible
-- - événement privé : membre de l'école ET étudiant vérifié
-- - autre événement : étudiant vérifié, ou personne ayant indiqué ne pas être étudiante
CREATE OR REPLACE FUNCTION public.check_registration_allowed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me RECORD;
  ev RECORD;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT is_student, verification_status INTO me FROM public.profiles WHERE id = auth.uid();
  SELECT status, approval_status, school_id, school INTO ev FROM public.events WHERE id = NEW.event_id;

  IF ev.approval_status NOT IN ('not_required', 'approved') THEN
    RAISE EXCEPTION 'event_not_available';
  END IF;
  IF ev.status = 'private' THEN
    IF NOT public.can_see_private_event(ev.school_id, ev.school)
       OR coalesce(me.verification_status::text, '') <> 'verified' THEN
      RAISE EXCEPTION 'event_private' USING HINT = 'Événement réservé aux étudiants vérifiés de l''école.';
    END IF;
  ELSIF coalesce(me.is_student, true) AND coalesce(me.verification_status::text, '') <> 'verified' THEN
    RAISE EXCEPTION 'account_not_verified'
      USING HINT = 'Le compte doit être vérifié avec un justificatif étudiant.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_registration_allowed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_require_verified ON public.registrations;
CREATE TRIGGER registrations_require_verified
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_registration_allowed();


-- ============================================================
-- 4. Rattachement à une école + inscription
-- ============================================================

-- Rattache un utilisateur à une école (et, pour un organisateur, à une association
-- existante ou nouvelle). Membre validé d'office si l'email est sur un domaine de l'école.
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
    membership_status = CASE WHEN public.email_matches_school(_email, s.email_domains) THEN 'approved' ELSE 'pending' END
  WHERE id = _uid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._attach_to_school(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Inscription. Métadonnées envoyées par le navigateur :
--   account_type : 'school' | 'organizer' | 'participant'
--   école : school_name, school_domains (séparés par des virgules)
--   sinon : school_id, association_id | new_association, is_student
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _meta       JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  _type       TEXT  := COALESCE(_meta->>'account_type', _meta->>'role', 'participant');
  _role       public.app_role;
  _birth      TEXT := _meta->>'birth_date';
  _gender     TEXT := _meta->>'gender';
  _is_student BOOLEAN;
  _school_id  UUID;
  _assoc_id   UUID;
  _domains    TEXT[];
  _uuid_re    CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  INSERT INTO public.profiles (id, full_name, school, association, birth_date, gender)
  VALUES (
    NEW.id,
    left(COALESCE(_meta->>'full_name', ''), 160),
    left(COALESCE(_meta->>'school', ''), 120),
    left(COALESCE(_meta->>'association', ''), 120),
    CASE WHEN _birth ~ '^\d{4}-\d{2}-\d{2}$' THEN _birth::date END,
    CASE WHEN _gender IN ('homme', 'femme', 'autre', 'non_renseigne') THEN _gender END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    school      = EXCLUDED.school,
    association = EXCLUDED.association,
    birth_date  = EXCLUDED.birth_date,
    gender      = EXCLUDED.gender;

  -- Compte école : l'école est créée « en attente », l'admin plateforme la valide.
  IF _type = 'school' THEN
    _domains := public.normalize_school_domains(string_to_array(COALESCE(_meta->>'school_domains', ''), ','));
    IF NOT public.email_matches_school(NEW.email, _domains) THEN
      RAISE EXCEPTION 'school_email_domain_mismatch';
    END IF;
    INSERT INTO public.schools (name, email_domains, created_by)
    VALUES (left(trim(COALESCE(_meta->>'school_name', '')), 120), _domains, NEW.id)
    RETURNING id INTO _school_id;
    INSERT INTO public.school_admins (school_id, user_id) VALUES (_school_id, NEW.id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'school_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles
    SET school_id = _school_id, school = left(trim(_meta->>'school_name'), 120),
        association = '', is_student = false
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Seuls participant et organizer peuvent être choisis à l'inscription.
  _role := CASE WHEN _type = 'organizer' THEN 'organizer'::public.app_role ELSE 'participant'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Un organisateur est étudiant ; un participant l'indique (par défaut : oui).
  _is_student := _role = 'organizer' OR COALESCE(_meta->>'is_student', 'true') <> 'false';
  UPDATE public.profiles SET is_student = _is_student WHERE id = NEW.id;

  IF _meta->>'school_id' ~ _uuid_re THEN _school_id := (_meta->>'school_id')::uuid; END IF;
  IF _meta->>'association_id' ~ _uuid_re THEN _assoc_id := (_meta->>'association_id')::uuid; END IF;

  -- École pas choisie dans la liste : on la reconnaît par le domaine email si possible.
  IF _school_id IS NULL AND (_role = 'organizer' OR _is_student) THEN
    SELECT id INTO _school_id FROM public.schools
    WHERE status = 'active' AND public.email_matches_school(NEW.email, email_domains)
    LIMIT 1;
  END IF;

  IF _school_id IS NOT NULL AND _role = 'organizer' THEN
    -- Erreur bloquante : un organisateur doit être rattaché correctement.
    PERFORM public._attach_to_school(NEW.id, _school_id, _assoc_id,
      COALESCE(NULLIF(_meta->>'new_association', ''), _meta->>'association'), true);
  ELSIF _school_id IS NOT NULL AND _is_student THEN
    BEGIN
      PERFORM public._attach_to_school(NEW.id, _school_id, NULL, NULL, false);
    EXCEPTION WHEN OTHERS THEN NULL; -- il pourra choisir son école plus tard
    END;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 5. Actions (appelées depuis l'app)
-- ============================================================

-- Un utilisateur déjà inscrit choisit / change son école (et son asso s'il organise).
CREATE OR REPLACE FUNCTION public.join_school(_school_id UUID, _association_id UUID DEFAULT NULL, _new_association TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.has_role(auth.uid(), 'school_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public._attach_to_school(auth.uid(), _school_id, _association_id, _new_association,
                                   public.has_role(auth.uid(), 'organizer'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_school(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_school(UUID, UUID, TEXT) TO authenticated;

-- Admin plateforme : valide / refuse une école. À la validation, les comptes et
-- événements existants dont le nom d'école correspond sont rattachés.
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
    AND NOT public.has_role(p.id, 'school_admin');

  -- Associations déjà utilisées par ces organisateurs (actives : elles existaient avant).
  INSERT INTO public.associations (school_id, name, status)
  SELECT DISTINCT ON (lower(trim(p.association))) s.id, left(trim(p.association), 120), 'active'
  FROM public.profiles p
  WHERE p.school_id = s.id AND length(trim(coalesce(p.association, ''))) >= 2
    AND public.has_role(p.id, 'organizer')
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

-- École : valide ou refuse un événement. Le message (obligatoire en cas de refus)
-- est envoyé à l'association.
CREATE OR REPLACE FUNCTION public.review_event(_event_id UUID, _approve BOOLEAN, _message TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e    RECORD;
  _msg TEXT := NULLIF(left(trim(coalesce(_message, '')), 4000), '');
BEGIN
  SELECT id, school_id, association_id, approval_status INTO e FROM public.events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT (public.is_school_admin(e.school_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF e.approval_status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT _approve AND _msg IS NULL THEN RAISE EXCEPTION 'message_required'; END IF;

  UPDATE public.events
  SET approval_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      approval_note   = _msg,
      reviewed_by     = auth.uid(),
      reviewed_at     = now()
  WHERE id = _event_id;

  IF _msg IS NOT NULL AND e.association_id IS NOT NULL THEN
    INSERT INTO public.school_messages (school_id, association_id, event_id, sender_id, from_school, body)
    VALUES (e.school_id, e.association_id, e.id, auth.uid(), true, _msg);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_event(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_event(UUID, BOOLEAN, TEXT) TO authenticated;

-- École : accepte / refuse le rattachement d'un membre (email hors domaine).
CREATE OR REPLACE FUNCTION public.review_membership(_profile_id UUID, _approve BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _school UUID;
BEGIN
  SELECT school_id INTO _school FROM public.profiles WHERE id = _profile_id;
  IF NOT (public.is_school_admin(_school) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
  SET membership_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
  WHERE id = _profile_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_membership(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_membership(UUID, BOOLEAN) TO authenticated;

-- Message école ↔ association. L'expéditeur est l'école si l'appelant l'administre,
-- sinon un membre validé de l'association.
CREATE OR REPLACE FUNCTION public.send_school_message(_association_id UUID, _body TEXT, _event_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a            RECORD;
  _from_school BOOLEAN;
  _id          UUID;
  _text        TEXT := left(trim(coalesce(_body, '')), 4000);
BEGIN
  SELECT id, school_id INTO a FROM public.associations WHERE id = _association_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'association_not_found'; END IF;
  _from_school := public.is_school_admin(a.school_id);
  IF NOT _from_school AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND association_id = a.id AND membership_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _text = '' THEN RAISE EXCEPTION 'message_required'; END IF;
  IF _event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.events WHERE id = _event_id AND association_id = a.id
  ) THEN
    _event_id := NULL;
  END IF;
  INSERT INTO public.school_messages (school_id, association_id, event_id, sender_id, from_school, body)
  VALUES (a.school_id, a.id, _event_id, auth.uid(), _from_school, _text)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_school_message(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_school_message(UUID, TEXT, UUID) TO authenticated;

-- Marque comme lus les messages reçus dans une conversation.
CREATE OR REPLACE FUNCTION public.mark_school_messages_read(_association_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _school UUID;
BEGIN
  SELECT school_id INTO _school FROM public.associations WHERE id = _association_id;
  IF public.is_school_admin(_school) THEN
    UPDATE public.school_messages SET read_at = now()
    WHERE association_id = _association_id AND NOT from_school AND read_at IS NULL;
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                AND association_id = _association_id AND membership_status = 'approved') THEN
    UPDATE public.school_messages SET read_at = now()
    WHERE association_id = _association_id AND from_school AND read_at IS NULL;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_school_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_school_messages_read(UUID) TO authenticated;

-- Statistiques par association pour l'école.
CREATE OR REPLACE FUNCTION public.school_association_stats(_school_id UUID)
RETURNS TABLE (
  association_id  UUID,
  events_total    INT,
  events_upcoming INT,
  events_pending  INT,
  registrations   INT,
  attended        INT,
  capacity        INT,
  revenue         NUMERIC,
  members         INT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_school_admin(_school_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    a.id,
    (SELECT count(*) FROM public.events e WHERE e.association_id = a.id)::int,
    (SELECT count(*) FROM public.events e WHERE e.association_id = a.id AND e.starts_at >= now())::int,
    (SELECT count(*) FROM public.events e WHERE e.association_id = a.id AND e.approval_status = 'pending')::int,
    (SELECT count(*) FROM public.registrations r JOIN public.events e ON e.id = r.event_id
      WHERE e.association_id = a.id AND r.status IN ('registered', 'attended'))::int,
    (SELECT count(*) FROM public.registrations r JOIN public.events e ON e.id = r.event_id
      WHERE e.association_id = a.id AND (r.status = 'attended' OR r.attended_at IS NOT NULL))::int,
    (SELECT coalesce(sum(e.capacity), 0) FROM public.events e
      WHERE e.association_id = a.id AND e.status <> 'draft')::int,
    (SELECT coalesce(sum(coalesce(t.price, e.price)), 0) FROM public.registrations r
      JOIN public.events e ON e.id = r.event_id
      LEFT JOIN public.ticket_types t ON t.id = r.ticket_type_id
      WHERE e.association_id = a.id AND r.status IN ('registered', 'attended'))::numeric,
    (SELECT count(*) FROM public.profiles p
      WHERE p.association_id = a.id AND p.membership_status = 'approved')::int
  FROM public.associations a
  WHERE a.school_id = _school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.school_association_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_association_stats(UUID) TO authenticated;

-- Membres de l'école, avec leur email (contact), pour l'admin de l'école.
CREATE OR REPLACE FUNCTION public.school_members(_school_id UUID)
RETURNS TABLE (
  id                UUID,
  full_name         TEXT,
  email             TEXT,
  role              TEXT,
  association_id    UUID,
  membership_status TEXT,
  verification_status TEXT,
  created_at        TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_school_admin(_school_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, u.email::text,
         CASE WHEN public.has_role(p.id, 'organizer') THEN 'organizer' ELSE 'participant' END,
         p.association_id, p.membership_status, p.verification_status::text, p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.school_id = _school_id
    AND NOT public.has_role(p.id, 'school_admin')
  ORDER BY p.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.school_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_members(UUID) TO authenticated;


-- ============================================================
-- 6. Règles d'accès (RLS)
-- ============================================================

-- Écoles : les écoles validées sont publiques (liste à l'inscription).
DROP POLICY IF EXISTS "schools_select_public" ON public.schools;
CREATE POLICY "schools_select_public" ON public.schools FOR SELECT TO anon
  USING (status = 'active');
DROP POLICY IF EXISTS "schools_select_auth" ON public.schools;
CREATE POLICY "schools_select_auth" ON public.schools FOR SELECT TO authenticated
  USING (
    status = 'active'
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.school_admins sa WHERE sa.school_id = schools.id AND sa.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "schools_update" ON public.schools;
CREATE POLICY "schools_update" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_school_admin(id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_school_admin(id) OR public.has_role(auth.uid(), 'admin'));

-- Admins d'école : chacun voit son rattachement ; l'admin plateforme voit tout.
DROP POLICY IF EXISTS "school_admins_select" ON public.school_admins;
CREATE POLICY "school_admins_select" ON public.school_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Associations : les actives sont publiques ; l'école gère les siennes.
DROP POLICY IF EXISTS "associations_select_public" ON public.associations;
CREATE POLICY "associations_select_public" ON public.associations FOR SELECT TO anon
  USING (status = 'active');
DROP POLICY IF EXISTS "associations_select_auth" ON public.associations;
CREATE POLICY "associations_select_auth" ON public.associations FOR SELECT TO authenticated
  USING (
    status = 'active'
    OR created_by = auth.uid()
    OR public.is_school_admin(school_id)
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.association_id = associations.id)
  );
DROP POLICY IF EXISTS "associations_insert" ON public.associations;
CREATE POLICY "associations_insert" ON public.associations FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(school_id) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "associations_update" ON public.associations;
CREATE POLICY "associations_update" ON public.associations FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_school_admin(school_id) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "associations_delete" ON public.associations;
CREATE POLICY "associations_delete" ON public.associations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Messages : visibles par l'école et les membres validés de l'association.
-- Envoi uniquement via send_school_message.
DROP POLICY IF EXISTS "school_messages_select" ON public.school_messages;
CREATE POLICY "school_messages_select" ON public.school_messages FOR SELECT TO authenticated
  USING (
    public.is_school_admin(school_id)
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.association_id = school_messages.association_id
                 AND p.membership_status = 'approved')
  );

-- Événements : un événement en attente / refusé n'est visible que par son
-- organisateur, l'école et l'admin plateforme.
DROP POLICY IF EXISTS "Events viewable by authenticated" ON public.events;
CREATE POLICY "Events viewable by authenticated" ON public.events FOR SELECT TO authenticated USING (
  (status IN ('published', 'closed') AND approval_status IN ('not_required', 'approved'))
  OR (status = 'private' AND approval_status IN ('not_required', 'approved')
      AND public.can_see_private_event(school_id, school))
  OR auth.uid() = organizer_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_school_admin(school_id)
);

DROP POLICY IF EXISTS "Events publicly readable" ON public.events;
CREATE POLICY "Events publicly readable" ON public.events FOR SELECT TO anon
  USING (status = 'published' AND approval_status IN ('not_required', 'approved'));

-- Inscriptions : l'école voit celles des événements de ses associations.
DROP POLICY IF EXISTS "School admins view registrations" ON public.registrations;
CREATE POLICY "School admins view registrations" ON public.registrations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e
                 WHERE e.id = registrations.event_id AND public.is_school_admin(e.school_id)));

-- Liste publique des événements (page d'accueil / Explorer).
CREATE OR REPLACE FUNCTION public.get_public_events()
RETURNS SETOF public.events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.*
  FROM public.events e
  WHERE
    (e.status IN ('published', 'closed') AND e.approval_status IN ('not_required', 'approved'))
    OR (e.status = 'private' AND e.approval_status IN ('not_required', 'approved')
        AND public.can_see_private_event(e.school_id, e.school))
    OR (auth.uid() IS NOT NULL AND e.organizer_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
  ORDER BY e.starts_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_events() TO authenticated, anon;


-- ============================================================
-- 7. Contrôle
-- ============================================================
SELECT 'schools' AS t, count(*) FROM public.schools
UNION ALL SELECT 'associations', count(*) FROM public.associations
UNION ALL SELECT 'events en attente', count(*) FROM public.events WHERE approval_status = 'pending';
