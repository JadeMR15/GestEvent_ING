-- ============================================================
-- Espace administration des écoles — ÉTAPE 4 (2026-11-14)
-- À lancer APRÈS school_admin_3.sql.
-- 1. Logo d'association par défaut = photo de profil de son organisateur.
-- 2. Compteurs de notifications (pastilles) en une requête.
-- 3. Messages en temps réel (Realtime).
-- 4. Email de relance quand un message reste non lu 2 h (comme Teams).
-- ============================================================

-- 1. Logo par défaut ----------------------------------------------------------
-- Une association sans logo affiche la photo de profil de son organisateur
-- (validé de préférence, puis le plus ancien). Les photos de profil sont publiques.
CREATE OR REPLACE FUNCTION public.association_avatar_fallbacks(_ids UUID[])
RETURNS TABLE (association_id UUID, avatar_path TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.association_id) p.association_id, p.avatar_path
  FROM public.profiles p
  WHERE p.association_id = ANY (_ids) AND p.avatar_path IS NOT NULL
    AND coalesce(p.membership_status, '') <> 'rejected'
    AND public.has_role(p.id, 'organizer')
  ORDER BY p.association_id, (p.membership_status = 'approved') DESC, p.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.association_avatar_fallbacks(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.association_avatar_fallbacks(UUID[]) TO authenticated;


-- 2. Compteurs de notifications -------------------------------------------------
-- Tout ce qui attend l'utilisateur connecté, selon ses rôles.
CREATE OR REPLACE FUNCTION public.my_notification_counts()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid     UUID := auth.uid();
  _assoc   UUID;
  _status  TEXT;
  _schools UUID[];
  _by      JSONB;
  r        JSONB := '{}'::jsonb;
BEGIN
  IF _uid IS NULL THEN RETURN r; END IF;

  -- Organisateur : messages de l'école non lus.
  SELECT association_id, membership_status INTO _assoc, _status FROM public.profiles WHERE id = _uid;
  IF _assoc IS NOT NULL AND _status = 'approved' THEN
    r := r || jsonb_build_object('association_messages',
      (SELECT count(*) FROM public.school_messages
        WHERE association_id = _assoc AND from_school AND read_at IS NULL));
  END IF;

  -- Administration d'école : messages des associations, événements et membres à valider.
  SELECT array_agg(sa.school_id) INTO _schools
  FROM public.school_admins sa JOIN public.schools s ON s.id = sa.school_id
  WHERE sa.user_id = _uid AND s.status = 'active';
  IF _schools IS NOT NULL THEN
    SELECT coalesce(jsonb_object_agg(m.association_id, m.n), '{}'::jsonb) INTO _by
    FROM (SELECT association_id, count(*) AS n FROM public.school_messages
           WHERE school_id = ANY (_schools) AND NOT from_school AND read_at IS NULL
           GROUP BY association_id) m;
    r := r || jsonb_build_object(
      'school_messages', (SELECT coalesce(sum(value::int), 0) FROM jsonb_each_text(_by)),
      'school_messages_by_association', _by,
      'school_reviews', (SELECT count(*) FROM public.events
                          WHERE school_id = ANY (_schools) AND approval_status = 'pending'),
      'school_members', (SELECT count(*) FROM public.profiles
                          WHERE school_id = ANY (_schools) AND membership_status = 'pending'));
  END IF;

  -- Admin Plav' : justificatifs, écoles et domaines à valider.
  IF public.has_role(_uid, 'admin') THEN
    r := r || jsonb_build_object(
      'admin_verifications', (SELECT count(*) FROM public.profiles WHERE verification_status = 'review'),
      'admin_schools', (SELECT count(*) FROM public.schools WHERE status = 'pending')
                     + (SELECT count(*) FROM public.school_domain_requests WHERE status = 'pending'));
  END IF;

  -- Participant : place libérée qui lui est proposée.
  r := r || jsonb_build_object('waitlist_offers',
    (SELECT count(*) FROM public.waitlist WHERE user_id = _uid AND status = 'offered'));

  RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_notification_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_notification_counts() TO authenticated;


-- 3. Temps réel -------------------------------------------------------------------
-- Les nouveaux messages arrivent sans recharger la page (les règles RLS s'appliquent).
DO $rt$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.school_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$rt$;


-- 4. Relance par email -----------------------------------------------------------
ALTER TABLE public.school_messages ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
-- Pas de relance pour les messages envoyés avant cette mise à jour.
UPDATE public.school_messages SET reminder_sent_at = now() WHERE reminder_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS school_messages_reminder_idx ON public.school_messages (created_at)
  WHERE read_at IS NULL AND reminder_sent_at IS NULL;

-- Réserve les messages non lus depuis _delay (une seule relance par message) et renvoie
-- une ligne par conversation et par sens, avec les destinataires.
CREATE OR REPLACE FUNCTION public.claim_message_reminders(_delay INTERVAL DEFAULT interval '2 hours')
RETURNS TABLE (
  association_id   UUID,
  association_name TEXT,
  school_name      TEXT,
  from_school      BOOLEAN,
  unread           INT,
  last_body        TEXT,
  last_at          TIMESTAMPTZ,
  recipients       JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE public.school_messages m SET reminder_sent_at = now()
    WHERE m.read_at IS NULL AND m.reminder_sent_at IS NULL
      AND m.created_at <= now() - _delay
      AND m.created_at > now() - interval '7 days'
    RETURNING m.association_id, m.school_id, m.from_school, m.body, m.created_at
  ), threads AS (
    SELECT d.association_id, d.school_id, d.from_school, count(*)::int AS unread,
           (array_agg(d.body ORDER BY d.created_at DESC))[1] AS last_body,
           max(d.created_at) AS last_at
    FROM due d GROUP BY d.association_id, d.school_id, d.from_school
  )
  SELECT t.association_id, a.name, s.name, t.from_school, t.unread, t.last_body, t.last_at,
    CASE WHEN t.from_school THEN
      -- Message de l'école → organisateurs validés de l'association.
      (SELECT coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', p.full_name)), '[]'::jsonb)
         FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.association_id = t.association_id AND p.membership_status = 'approved')
    ELSE
      -- Message de l'association → administrateurs de l'école.
      (SELECT coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', p.full_name)), '[]'::jsonb)
         FROM public.school_admins sa JOIN auth.users u ON u.id = sa.user_id
         LEFT JOIN public.profiles p ON p.id = sa.user_id
        WHERE sa.school_id = t.school_id)
    END
  FROM threads t
  JOIN public.associations a ON a.id = t.association_id
  JOIN public.schools s ON s.id = t.school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_message_reminders(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_reminders(INTERVAL) TO service_role;

-- Toutes les 10 minutes, seulement s'il y a une relance à faire.
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  PERFORM cron.schedule('plav-message-reminders', '*/10 * * * *', $job$
    SELECT net.http_post(
      url     := 'https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-message-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret')),
      body    := '{}'::jsonb)
    WHERE EXISTS (SELECT 1 FROM public.school_messages
                   WHERE read_at IS NULL AND reminder_sent_at IS NULL
                     AND created_at <= now() - interval '2 hours'
                     AND created_at > now() - interval '7 days')
  $job$);
EXCEPTION WHEN others THEN
  RAISE WARNING 'Planification impossible (%). Activez pg_cron et pg_net puis relancez ce script.', SQLERRM;
END
$cron$;
