-- ============================================================
-- Liste d'attente active (2026-11-10)
-- À lancer dans Supabase > SQL Editor. Peut être relancé sans risque.
--
-- Principe :
-- - un événement complet accepte des inscriptions sur liste d'attente
--   (une entrée par personne et par événement, ordre d'arrivée) ;
-- - dès qu'une place se libère (annulation, réservation "pending" expirée,
--   capacité augmentée), offer_next_spot() la propose à la personne suivante :
--   la place lui est gardée 2 h (15 min à moins de 24 h de l'événement) ;
-- - pour la prendre, elle passe par la réservation normale (panier + timer) ;
-- - une offre non prise expire et passe à la suivante (pg_cron, chaque minute) ;
-- - aucune écriture directe sur la table depuis le navigateur : tout passe
--   par les fonctions ci-dessous (position impossible à modifier via l'API).
--
-- ⚠️ Ce script remplace aussi check_registration_capacity() (migration.sql) :
--    elle compte désormais toutes les inscriptions (SECURITY DEFINER), verrouille
--    l'événement pendant le contrôle et tient compte des places gardées
--    pour la liste d'attente.
-- ============================================================

-- 1. Table ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.waitlist_status AS ENUM ('waiting', 'offered', 'accepted', 'expired', 'left');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.waitlist_position_seq;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Ordre d'arrivée (croissant, jamais modifiable par l'utilisateur).
  position          BIGINT NOT NULL DEFAULT nextval('public.waitlist_position_seq'),
  -- Réservé à l'option "priorité aux adhérents" (inactive par défaut).
  priority          SMALLINT NOT NULL DEFAULT 0,
  status            public.waitlist_status NOT NULL DEFAULT 'waiting',
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  offered_at        TIMESTAMPTZ,
  offer_expires_at  TIMESTAMPTZ,
  offer_notified_at TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS waitlist_queue_idx  ON public.waitlist (event_id, status, position);
CREATE INDEX IF NOT EXISTS waitlist_user_idx   ON public.waitlist (user_id);
CREATE INDEX IF NOT EXISTS waitlist_offers_idx ON public.waitlist (offer_expires_at) WHERE status = 'offered';

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Lecture : sa propre entrée, ou l'organisateur de l'événement / un admin.
DROP POLICY IF EXISTS "waitlist_select" ON public.waitlist;
CREATE POLICY "waitlist_select" ON public.waitlist FOR SELECT TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
-- Aucune règle INSERT / UPDATE / DELETE : seules les fonctions ci-dessous écrivent.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.waitlist FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.waitlist_position_seq FROM anon, authenticated;

-- Suivi en direct (Realtime) de sa position / de son offre.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- 2. Option "priorité aux adhérents" (préparée, désactivée) -----------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS waitlist_member_priority BOOLEAN NOT NULL DEFAULT false;

-- À brancher sur la future table des adhésions. Pour l'instant : personne n'est adhérent.
CREATE OR REPLACE FUNCTION public.is_association_member(_user_id UUID, _event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false;
$$;

-- 3. Places libres ----------------------------------------------------------
-- Places restantes sans compter les offres en cours. NULL = illimité.
CREATE OR REPLACE FUNCTION public.event_raw_free_spots(_event_id UUID)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _capacity    INTEGER;
  _taken       INTEGER;
  _event_left  INTEGER;
  _types_left  INTEGER;
  _type_count  INTEGER;
  _unlimited   BOOLEAN;
BEGIN
  SELECT capacity INTO _capacity FROM public.events WHERE id = _event_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT count(*) INTO _taken FROM public.registrations
   WHERE event_id = _event_id AND status IN ('pending', 'registered', 'attended');
  IF _capacity > 0 THEN _event_left := greatest(0, _capacity - _taken); END IF;

  SELECT count(*), coalesce(bool_or(capacity <= 0), false) INTO _type_count, _unlimited
    FROM public.ticket_types WHERE event_id = _event_id;
  IF _type_count > 0 AND NOT _unlimited THEN
    SELECT coalesce(sum(greatest(0, t.capacity - (
             SELECT count(*) FROM public.registrations r
              WHERE r.ticket_type_id = t.id AND r.status IN ('pending', 'registered', 'attended')
           ))), 0)::int
      INTO _types_left
      FROM public.ticket_types t WHERE t.event_id = _event_id;
  END IF;

  IF _event_left IS NULL THEN RETURN _types_left; END IF;
  IF _types_left IS NULL THEN RETURN _event_left; END IF;
  RETURN least(_event_left, _types_left);
END;
$$;

-- Rang dans la file (1 = prochain servi), uniquement pour les entrées "waiting".
CREATE OR REPLACE FUNCTION public.waitlist_rank(_entry_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN w.status <> 'waiting' THEN NULL ELSE (
    SELECT count(*)::int + 1 FROM public.waitlist o
     WHERE o.event_id = w.event_id AND o.status = 'waiting'
       AND (
         (CASE WHEN e.waitlist_member_priority THEN o.priority ELSE 0 END)
           > (CASE WHEN e.waitlist_member_priority THEN w.priority ELSE 0 END)
         OR (
           (CASE WHEN e.waitlist_member_priority THEN o.priority ELSE 0 END)
             = (CASE WHEN e.waitlist_member_priority THEN w.priority ELSE 0 END)
           AND o.position < w.position
         )
       )
  ) END
  FROM public.waitlist w JOIN public.events e ON e.id = w.event_id
  WHERE w.id = _entry_id;
$$;

-- 4. Attribution d'une place libérée ----------------------------------------
-- Propose autant de places qu'il y en a de libres, dans l'ordre de la file.
-- L'événement est verrouillé (FOR UPDATE) : deux libérations simultanées sont
-- traitées l'une après l'autre, jamais deux offres pour la même place.
CREATE OR REPLACE FUNCTION public.offer_next_spot(_event_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ev     RECORD;
  _free   INTEGER;
  _offers INTEGER;
  _made   INTEGER := 0;
  _next   UUID;
  _delay  INTERVAL;
BEGIN
  SELECT id, starts_at, status, waitlist_member_priority INTO _ev
    FROM public.events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _ev.starts_at <= now() OR _ev.status NOT IN ('published', 'private') THEN RETURN 0; END IF;

  _free := public.event_raw_free_spots(_event_id);
  SELECT count(*) INTO _offers FROM public.waitlist WHERE event_id = _event_id AND status = 'offered';
  IF _free IS NOT NULL THEN _free := _free - _offers; END IF;

  _delay := CASE WHEN _ev.starts_at - now() < interval '24 hours'
                 THEN interval '15 minutes' ELSE interval '2 hours' END;

  WHILE _free IS NULL OR _free > 0 LOOP
    SELECT w.id INTO _next
      FROM public.waitlist w
     WHERE w.event_id = _event_id AND w.status = 'waiting'
       AND NOT EXISTS (
         SELECT 1 FROM public.registrations r
          WHERE r.event_id = _event_id AND r.user_id = w.user_id AND r.guest_email IS NULL
            AND r.status IN ('pending', 'registered', 'attended'))
     ORDER BY (CASE WHEN _ev.waitlist_member_priority THEN w.priority ELSE 0 END) DESC, w.position
     LIMIT 1
     FOR UPDATE;
    EXIT WHEN NOT FOUND;

    UPDATE public.waitlist
       SET status = 'offered',
           offered_at = now(),
           offer_expires_at = least(now() + _delay, _ev.starts_at),
           offer_notified_at = NULL,
           responded_at = NULL
     WHERE id = _next;

    _made := _made + 1;
    IF _free IS NOT NULL THEN _free := _free - 1; END IF;
  END LOOP;

  RETURN _made;
END;
$$;

-- 5. Contrôle de capacité à l'inscription (remplace la version de migration.sql)
CREATE OR REPLACE FUNCTION public.check_registration_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event_capacity  INTEGER;
  _ticket_capacity INTEGER;
  _event_taken     INTEGER;
  _ticket_taken    INTEGER;
  _held            INTEGER;
  _free            INTEGER;
BEGIN
  IF NEW.status NOT IN ('pending', 'registered', 'attended') THEN RETURN NEW; END IF;

  -- Une réservation temporaire expire toujours (le navigateur ne choisit pas la durée).
  IF NEW.status = 'pending' THEN
    NEW.expires_at := now() + interval '16 minutes';
  END IF;

  -- Verrou : les inscriptions et offres d'un même événement passent une par une.
  SELECT capacity INTO _event_capacity FROM public.events WHERE id = NEW.event_id FOR UPDATE;

  IF _event_capacity > 0 THEN
    SELECT count(*) INTO _event_taken FROM public.registrations
     WHERE event_id = NEW.event_id AND status IN ('registered', 'attended', 'pending');
    IF _event_taken >= _event_capacity THEN RAISE EXCEPTION 'event_full'; END IF;
  END IF;

  IF NEW.ticket_type_id IS NOT NULL THEN
    SELECT capacity INTO _ticket_capacity FROM public.ticket_types WHERE id = NEW.ticket_type_id;
    IF _ticket_capacity > 0 THEN
      SELECT count(*) INTO _ticket_taken FROM public.registrations
       WHERE ticket_type_id = NEW.ticket_type_id AND status IN ('registered', 'attended', 'pending');
      IF _ticket_taken >= _ticket_capacity THEN RAISE EXCEPTION 'event_full'; END IF;
    END IF;
  END IF;

  -- Places gardées pour la liste d'attente (sauf celle proposée à cette personne).
  SELECT count(*) INTO _held FROM public.waitlist
   WHERE event_id = NEW.event_id AND status = 'offered' AND user_id <> NEW.user_id;
  IF _held > 0 THEN
    _free := public.event_raw_free_spots(NEW.event_id);
    IF _free IS NOT NULL AND _free - _held <= 0 THEN RAISE EXCEPTION 'event_full'; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_registration_capacity ON public.registrations;
CREATE TRIGGER enforce_registration_capacity
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_registration_capacity();

-- 6. Déclencheurs : place prise / place libérée ------------------------------
-- Une personne qui obtient une place sort de la liste (inscrit ET en attente impossible).
CREATE OR REPLACE FUNCTION public.waitlist_on_registration_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.guest_email IS NULL AND NEW.status IN ('pending', 'registered', 'attended') THEN
    UPDATE public.waitlist
       SET status = 'accepted', responded_at = now()
     WHERE event_id = NEW.event_id AND user_id = NEW.user_id AND status IN ('waiting', 'offered');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_registration_inserted ON public.registrations;
CREATE TRIGGER waitlist_registration_inserted
  AFTER INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_on_registration_insert();

-- Place libérée : suppression (annulation, panier abandonné, réservation expirée)
-- ou passage au statut "cancelled".
CREATE OR REPLACE FUNCTION public.waitlist_on_registration_released()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status NOT IN ('pending', 'registered', 'attended') THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IN ('pending', 'registered', 'attended') THEN RETURN NULL; END IF;

  -- Panier abandonné par quelqu'un venu de la liste d'attente : tant que son offre
  -- court encore, la place lui reste gardée.
  IF OLD.status = 'pending' AND OLD.guest_email IS NULL THEN
    UPDATE public.waitlist
       SET status = 'offered', responded_at = NULL
     WHERE event_id = OLD.event_id AND user_id = OLD.user_id
       AND status = 'accepted' AND offer_expires_at > now();
  END IF;

  PERFORM public.offer_next_spot(OLD.event_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_registration_deleted ON public.registrations;
CREATE TRIGGER waitlist_registration_deleted
  AFTER DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_on_registration_released();

DROP TRIGGER IF EXISTS waitlist_registration_cancelled ON public.registrations;
CREATE TRIGGER waitlist_registration_cancelled
  AFTER UPDATE OF status ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_on_registration_released();

-- Capacité augmentée ou événement republié par l'organisateur.
CREATE OR REPLACE FUNCTION public.waitlist_on_event_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.capacity IS DISTINCT FROM OLD.capacity OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.offer_next_spot(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_event_updated ON public.events;
CREATE TRIGGER waitlist_event_updated
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_on_event_update();

-- 7. Actions de l'étudiant ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_waitlist(_event_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _uid    UUID := auth.uid();
  _ev     RECORD;
  _free   INTEGER;
  _offers INTEGER;
  _entry  RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_verified(_uid) THEN RAISE EXCEPTION 'account_not_verified'; END IF;

  SELECT * INTO _ev FROM public.events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF _ev.status NOT IN ('published', 'private') THEN RAISE EXCEPTION 'event_closed'; END IF;
  IF _ev.starts_at <= now() THEN RAISE EXCEPTION 'event_started'; END IF;
  IF _ev.status = 'private' AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = _uid AND p.school <> '' AND lower(trim(p.school)) = lower(trim(_ev.school))) THEN
    RAISE EXCEPTION 'private_event';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations
              WHERE event_id = _event_id AND user_id = _uid AND guest_email IS NULL
                AND status IN ('pending', 'registered', 'attended')) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  _free := public.event_raw_free_spots(_event_id);
  SELECT count(*) INTO _offers FROM public.waitlist WHERE event_id = _event_id AND status = 'offered';
  IF _free IS NULL OR _free - _offers > 0 THEN RAISE EXCEPTION 'event_not_full'; END IF;

  -- Revenir après avoir quitté / laissé expirer : retour en fin de file.
  INSERT INTO public.waitlist AS w (event_id, user_id, priority)
  VALUES (_event_id, _uid, CASE WHEN public.is_association_member(_uid, _event_id) THEN 1 ELSE 0 END)
  ON CONFLICT (event_id, user_id) DO UPDATE
     SET status = 'waiting',
         position = nextval('public.waitlist_position_seq'),
         priority = EXCLUDED.priority,
         joined_at = now(),
         offered_at = NULL, offer_expires_at = NULL, offer_notified_at = NULL, responded_at = NULL
   WHERE w.status IN ('accepted', 'expired', 'left');

  SELECT id, status INTO _entry FROM public.waitlist WHERE event_id = _event_id AND user_id = _uid;
  RETURN json_build_object('status', _entry.status, 'rank', public.waitlist_rank(_entry.id));
END;
$$;

-- Quitter la liste (ou refuser l'offre) : si une place était gardée, elle passe à la suivante.
CREATE OR REPLACE FUNCTION public.leave_waitlist(_event_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _uid    UUID := auth.uid();
  _status public.waitlist_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM 1 FROM public.events WHERE id = _event_id FOR UPDATE;

  SELECT status INTO _status FROM public.waitlist
   WHERE event_id = _event_id AND user_id = _uid FOR UPDATE;
  IF NOT FOUND OR _status NOT IN ('waiting', 'offered') THEN RETURN; END IF;

  UPDATE public.waitlist SET status = 'left', responded_at = now()
   WHERE event_id = _event_id AND user_id = _uid;

  IF _status = 'offered' THEN PERFORM public.offer_next_spot(_event_id); END IF;
END;
$$;

-- Mes listes d'attente (toutes, ou celle d'un événement).
CREATE OR REPLACE FUNCTION public.get_my_waitlist(_event_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID, event_id UUID, status public.waitlist_status, rank INTEGER,
  joined_at TIMESTAMPTZ, offered_at TIMESTAMPTZ, offer_expires_at TIMESTAMPTZ,
  event_title TEXT, event_starts_at TIMESTAMPTZ, event_location TEXT, event_cover_image_url TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.event_id, w.status, public.waitlist_rank(w.id),
         w.joined_at, w.offered_at, w.offer_expires_at,
         e.title, e.starts_at, e.location, e.cover_image_url
    FROM public.waitlist w JOIN public.events e ON e.id = w.event_id
   WHERE w.user_id = auth.uid()
     AND (_event_id IS NULL OR w.event_id = _event_id)
   ORDER BY e.starts_at;
$$;

-- Disponibilités d'un événement (nombres uniquement, aucune donnée personnelle).
CREATE OR REPLACE FUNCTION public.get_event_availability(_event_id UUID)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _taken   INTEGER;
  _free    INTEGER;
  _offers  INTEGER;
  _waiting INTEGER;
  _types   JSON;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = _event_id) THEN RETURN NULL; END IF;

  SELECT count(*) INTO _taken FROM public.registrations
   WHERE event_id = _event_id AND status IN ('pending', 'registered', 'attended');
  SELECT count(*) FILTER (WHERE status = 'offered'), count(*) FILTER (WHERE status = 'waiting')
    INTO _offers, _waiting FROM public.waitlist WHERE event_id = _event_id;
  _free := public.event_raw_free_spots(_event_id);
  IF _free IS NOT NULL THEN _free := greatest(0, _free - _offers); END IF;

  SELECT coalesce(json_object_agg(t.id, (
           SELECT count(*) FROM public.registrations r
            WHERE r.ticket_type_id = t.id AND r.status IN ('pending', 'registered', 'attended'))), '{}'::json)
    INTO _types FROM public.ticket_types t WHERE t.event_id = _event_id;

  RETURN json_build_object('taken', _taken, 'free', _free, 'offers', _offers,
                           'waiting', _waiting, 'ticket_taken', _types);
END;
$$;

-- 8. Vue organisateur ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_waitlist(_event_id UUID)
RETURNS TABLE (
  user_id UUID, full_name TEXT, status public.waitlist_status, rank INTEGER,
  joined_at TIMESTAMPTZ, offer_expires_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.organizer_id = auth.uid())
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT w.user_id, coalesce(p.full_name, ''), w.status, public.waitlist_rank(w.id),
         w.joined_at, w.offer_expires_at
    FROM public.waitlist w LEFT JOIN public.profiles p ON p.id = w.user_id
   WHERE w.event_id = _event_id AND w.status IN ('waiting', 'offered')
   ORDER BY (w.status = 'offered') DESC, public.waitlist_rank(w.id);
END;
$$;

-- 9. Tâches périodiques ------------------------------------------------------
-- Offres expirées → statut "expired" et passage à la personne suivante.
CREATE OR REPLACE FUNCTION public.expire_waitlist_offers()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row   RECORD;
  _n     INTEGER;
  _total INTEGER := 0;
BEGIN
  FOR _row IN
    SELECT DISTINCT event_id FROM public.waitlist
     WHERE status = 'offered' AND offer_expires_at <= now()
  LOOP
    PERFORM 1 FROM public.events WHERE id = _row.event_id FOR UPDATE;
    UPDATE public.waitlist SET status = 'expired', responded_at = now()
     WHERE event_id = _row.event_id AND status = 'offered' AND offer_expires_at <= now();
    GET DIAGNOSTICS _n = ROW_COUNT;
    _total := _total + _n;
    PERFORM public.offer_next_spot(_row.event_id);
  END LOOP;
  RETURN _total;
END;
$$;

-- Lancée chaque minute par pg_cron.
CREATE OR REPLACE FUNCTION public.process_waitlist()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row RECORD;
BEGIN
  -- Réservations "pending" expirées : supprimées (le déclencheur propose la place).
  PERFORM public.release_expired_reservations();

  PERFORM public.expire_waitlist_offers();

  -- Événement commencé : la liste d'attente est close.
  UPDATE public.waitlist w SET status = 'expired', responded_at = now()
    FROM public.events e
   WHERE e.id = w.event_id AND w.status IN ('waiting', 'offered') AND e.starts_at <= now();

  -- Rattrapage (ex. tarifs modifiés) : places libres non encore proposées.
  FOR _row IN
    SELECT DISTINCT w.event_id FROM public.waitlist w JOIN public.events e ON e.id = w.event_id
     WHERE w.status = 'waiting' AND e.starts_at > now()
  LOOP
    PERFORM public.offer_next_spot(_row.event_id);
  END LOOP;
END;
$$;

-- Emails "Une place s'est libérée" : réserve les offres à notifier (une seule fois).
-- Appelée uniquement par la fonction serveur send-waitlist-offers (clé service).
CREATE OR REPLACE FUNCTION public.claim_waitlist_notifications(_limit INTEGER DEFAULT 50)
RETURNS TABLE (id UUID, event_id UUID, user_id UUID, offer_expires_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.waitlist w SET offer_notified_at = now()
   WHERE w.id IN (
     SELECT x.id FROM public.waitlist x
      WHERE x.status = 'offered' AND x.offer_notified_at IS NULL AND x.offer_expires_at > now()
      ORDER BY x.offered_at
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING w.id, w.event_id, w.user_id, w.offer_expires_at;
$$;

-- La suppression des réservations expirées est réservée au serveur.
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.registrations WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now();
$$;

-- 10. Droits d'exécution -----------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.event_raw_free_spots(UUID)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.waitlist_rank(UUID)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_association_member(UUID, UUID)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.offer_next_spot(UUID)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_registration_capacity()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.waitlist_on_registration_insert()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.waitlist_on_registration_released()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.waitlist_on_event_update()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_waitlist_offers()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_waitlist()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_waitlist_notifications(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_expired_reservations()        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_waitlist_notifications(INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.join_waitlist(UUID)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_waitlist(UUID)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_waitlist(UUID)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_event_waitlist(UUID)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_waitlist(UUID)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.leave_waitlist(UUID)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_waitlist(UUID)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_event_waitlist(UUID)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_event_availability(UUID) TO anon, authenticated;

-- 11. Planification (pg_cron + pg_net) -----------------------------------------
-- Chaque minute : expirations + offres, puis envoi des emails s'il y en a à faire.
-- L'appel HTTP s'authentifie avec un secret rangé dans le coffre Supabase (Vault),
-- à créer une fois (voir les instructions de la tâche) — jamais écrit dans le dépôt.
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  PERFORM cron.schedule('plav-waitlist', '* * * * *', 'SELECT public.process_waitlist()');

  PERFORM cron.schedule('plav-waitlist-emails', '* * * * *', $job$
    SELECT net.http_post(
      url     := 'https://cicjhxgsxcwficnjoukc.supabase.co/functions/v1/send-waitlist-offers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'plav_waitlist_cron_secret')),
      body    := '{}'::jsonb)
    WHERE EXISTS (SELECT 1 FROM public.waitlist WHERE status = 'offered' AND offer_notified_at IS NULL)
  $job$);

  RAISE NOTICE 'Liste d''attente : % tâche(s) planifiée(s).',
    (SELECT count(*) FROM cron.job WHERE jobname LIKE 'plav-waitlist%');
EXCEPTION WHEN others THEN
  RAISE WARNING 'Planification impossible (%). Activez pg_cron et pg_net dans Database > Extensions puis relancez ce script.', SQLERRM;
END
$cron$;
