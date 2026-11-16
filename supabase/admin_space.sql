-- ============================================================
-- Espace administration Plav' (admin plateforme) — 2026-11-16
-- À lancer dans Supabase > SQL Editor, APRÈS school_admin_*.sql et school_email.sql.
-- Peut être relancé sans risque.
--
-- 1. Blocage d'un compte (profiles.blocked_at / blocked_reason + auth.users.banned_until)
-- 2. admin_platform_stats()  : chiffres de la plateforme et des écoles
-- 3. admin_list_users()      : recherche dans les comptes
-- 4. admin_set_role()        : changer le rôle d'un compte
-- 5. admin_set_blocked()     : bloquer / débloquer un compte
-- Toutes les fonctions refusent les comptes qui ne sont pas admin.
-- ============================================================


-- 1. Blocage ------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
CREATE INDEX IF NOT EXISTS profiles_blocked_idx ON public.profiles (blocked_at) WHERE blocked_at IS NOT NULL;

-- Un utilisateur ne peut pas se débloquer lui-même en modifiant son profil.
CREATE OR REPLACE FUNCTION public.protect_profile_block()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.blocked_at IS DISTINCT FROM OLD.blocked_at OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason)
     AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.blocked_at := OLD.blocked_at;
    NEW.blocked_reason := OLD.blocked_reason;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_block ON public.profiles;
CREATE TRIGGER profiles_protect_block BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_block();


-- Rôle principal d'un compte (le plus élevé, comme dans l'app).
CREATE OR REPLACE FUNCTION public.main_role(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT role::text FROM public.user_roles WHERE user_id = _user_id
    ORDER BY array_position(ARRAY['admin','school_admin','organizer','volunteer','participant'], role::text)
    LIMIT 1), 'participant')
$$;
REVOKE EXECUTE ON FUNCTION public.main_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.main_role(UUID) TO authenticated;


-- 2. Statistiques -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'users_total',        (SELECT count(*) FROM public.profiles),
    'users_new_7d',       (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'users_new_30d',      (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'users_blocked',      (SELECT count(*) FROM public.profiles WHERE blocked_at IS NOT NULL),
    'users_by_role',      (SELECT coalesce(jsonb_object_agg(role, n), '{}'::jsonb) FROM (
                             SELECT public.main_role(p.id) AS role, count(*) AS n
                             FROM public.profiles p GROUP BY 1) x),
    'students_verified',  (SELECT count(*) FROM public.profiles WHERE verification_status = 'verified'
                             AND (verification_expires_at IS NULL OR verification_expires_at > now())),
    'schools_active',     (SELECT count(*) FROM public.schools WHERE status = 'active'),
    'schools_pending',    (SELECT count(*) FROM public.schools WHERE status = 'pending'),
    'domains_active',     (SELECT count(*) FROM public.school_domains WHERE active),
    'domains_pending',    (SELECT count(DISTINCT domain) FROM public.school_domain_requests WHERE status = 'pending'),
    'verifications_review', (SELECT count(*) FROM public.profiles WHERE verification_status = 'review'),
    'associations_active', (SELECT count(*) FROM public.associations WHERE status = 'active'),
    'associations_total', (SELECT count(*) FROM public.associations),
    'events_total',       (SELECT count(*) FROM public.events),
    'events_upcoming',    (SELECT count(*) FROM public.events WHERE starts_at > now() AND status = 'published'),
    'tickets_total',      (SELECT count(*) FROM public.registrations WHERE status IN ('registered', 'attended')),
    'tickets_30d',        (SELECT count(*) FROM public.registrations WHERE status IN ('registered', 'attended')
                             AND registered_at > now() - interval '30 days'),
    'schools', (SELECT coalesce(jsonb_agg(s ORDER BY s.users DESC, s.name), '[]'::jsonb) FROM (
      SELECT sc.id, sc.name, sc.status,
        (SELECT count(*) FROM public.profiles p WHERE p.school_id = sc.id) AS users,
        (SELECT count(*) FROM public.associations a WHERE a.school_id = sc.id AND a.status = 'active') AS associations,
        (SELECT count(*) FROM public.events e WHERE e.school_id = sc.id AND e.starts_at > now() AND e.status = 'published') AS events_upcoming
      FROM public.schools sc WHERE sc.status = 'active') s)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_platform_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;


-- 3. Liste des comptes ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_users(TEXT, TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search TEXT DEFAULT NULL, _role TEXT DEFAULT NULL, _limit INT DEFAULT 30, _offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, full_name TEXT, email TEXT, avatar_path TEXT, role TEXT,
  school_name TEXT, association_name TEXT, verification_status TEXT,
  created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ, blocked_reason TEXT, total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q TEXT := nullif(lower(trim(coalesce(_search, ''))), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT x.* , count(*) OVER () AS total_count FROM (
    SELECT p.id, p.full_name, u.email::text, p.avatar_path, public.main_role(p.id) AS role,
      coalesce(sc.name, nullif(p.school, '')) AS school_name,
      coalesce(a.name, nullif(p.association, '')) AS association_name,
      p.verification_status::text, p.created_at, u.last_sign_in_at,
      p.blocked_at, p.blocked_reason
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.schools sc ON sc.id = p.school_id
    LEFT JOIN public.associations a ON a.id = p.association_id
    WHERE q IS NULL
       OR lower(p.full_name) LIKE '%' || q || '%'
       OR lower(u.email) LIKE '%' || q || '%'
       OR lower(coalesce(sc.name, p.school, '')) LIKE '%' || q || '%'
  ) x
  WHERE _role IS NULL OR _role = '' OR (_role = 'blocked' AND x.blocked_at IS NOT NULL) OR x.role = _role
  ORDER BY x.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 30), 1), 100) OFFSET greatest(coalesce(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, INT, INT) TO authenticated;


-- 4. Changer de rôle --------------------------------------------------------------------
-- Les comptes école (school_admin) se gèrent par l'inscription de l'école : on n'y touche pas ici.
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id UUID, _role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_change_self'; END IF;
  IF _role NOT IN ('participant', 'organizer', 'volunteer', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF public.has_role(_user_id, 'school_admin') THEN RAISE EXCEPTION 'school_admin_locked'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role::text <> _role;
  INSERT INTO public.user_roles (user_id, role)
  SELECT _user_id, _role::public.app_role
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(UUID, TEXT) TO authenticated;


-- 5. Bloquer / débloquer -----------------------------------------------------------------
-- Bloqué : connexion refusée (banned_until), sessions fermées, et l'app déconnecte le compte
-- dès qu'elle voit blocked_at.
CREATE OR REPLACE FUNCTION public.admin_set_blocked(_user_id UUID, _blocked BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_change_self'; END IF;
  IF _blocked AND public.has_role(_user_id, 'admin') THEN RAISE EXCEPTION 'cannot_block_admin'; END IF;
  IF _blocked AND nullif(trim(coalesce(_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.profiles
  SET blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
      blocked_reason = CASE WHEN _blocked THEN left(trim(_reason), 300) ELSE NULL END
  WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  BEGIN
    UPDATE auth.users SET banned_until = CASE WHEN _blocked THEN 'infinity'::timestamptz ELSE NULL END
    WHERE id = _user_id;
    IF _blocked THEN DELETE FROM auth.sessions WHERE user_id = _user_id; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Sans droit sur auth.users : le blocage reste appliqué par l'app (blocked_at).
    NULL;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_blocked(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_blocked(UUID, BOOLEAN, TEXT) TO authenticated;
