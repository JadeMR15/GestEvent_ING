-- ============================================================
-- Notifications push (Web Push) — 2026-11-14
-- À lancer APRÈS school_admin_4.sql.
-- 1. Abonnements push des navigateurs / téléphones de chaque utilisateur.
-- 2. File d'envoi (push_outbox), remplie par des déclencheurs.
-- 3. Déclencheurs : messages, validations, places libérées…
-- 4. Envoi immédiat par la fonction send-push (pg_net), avec filet de sécurité pg_cron.
-- Clé privée VAPID : secret VAPID_PRIVATE_KEY des Edge Functions (jamais dans le dépôt).
-- ============================================================

-- 1. Abonnements ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subscriptions_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_own" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Enregistre l'abonnement de cet appareil pour l'utilisateur connecté (un appareil
-- partagé passe au dernier compte connecté).
CREATE OR REPLACE FUNCTION public.save_push_subscription(_endpoint TEXT, _p256dh TEXT, _auth TEXT, _user_agent TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _endpoint !~ '^https://' OR length(_endpoint) > 1000 THEN RAISE EXCEPTION 'invalid_endpoint'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, created_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(_endpoint TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;


-- 2. File d'envoi -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '/',
  tag        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_outbox_unsent_idx ON public.push_outbox (created_at) WHERE sent_at IS NULL;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;  -- aucune règle : serveur uniquement

-- Met une notification en file, seulement si l'utilisateur a un appareil abonné.
CREATE OR REPLACE FUNCTION public.enqueue_push(_user UUID, _title TEXT, _body TEXT, _url TEXT, _tag TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL OR _user = auth.uid() THEN RETURN; END IF;  -- pas de notification pour soi-même
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = _user) THEN RETURN; END IF;
  INSERT INTO public.push_outbox (user_id, title, body, url, tag)
  VALUES (_user, left(_title, 120),
          CASE WHEN length(coalesce(_body, '')) > 180 THEN left(_body, 179) || '…' ELSE coalesce(_body, '') END,
          _url, _tag);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_push(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Réserve les notifications à envoyer, avec les abonnements de chaque destinataire.
CREATE OR REPLACE FUNCTION public.claim_push_outbox(_limit INT DEFAULT 100)
RETURNS TABLE (id UUID, title TEXT, body TEXT, url TEXT, tag TEXT, subscriptions JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id FROM public.push_outbox o
    WHERE o.sent_at IS NULL AND o.created_at > now() - interval '1 day'
    ORDER BY o.created_at LIMIT _limit FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE public.push_outbox o SET sent_at = now() FROM picked WHERE o.id = picked.id
    RETURNING o.*
  )
  SELECT d.id, d.title, d.body, d.url, d.tag,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
       FROM public.push_subscriptions s WHERE s.user_id = d.user_id)
  FROM done d;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_push_outbox(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(INT) TO service_role;

-- Envoi immédiat : un appel HTTP (asynchrone, pg_net) par lot inséré.
CREATE OR REPLACE FUNCTION public.push_outbox_dispatch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret')),
    body    := '{}'::jsonb);
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push: envoi différé (%)', SQLERRM;  -- repris par la tâche planifiée
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_outbox_dispatch ON public.push_outbox;
CREATE TRIGGER push_outbox_dispatch AFTER INSERT ON public.push_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION public.push_outbox_dispatch();


-- 3. Déclencheurs -------------------------------------------------------------------
-- Une erreur de notification ne doit jamais bloquer l'action d'origine.

-- Messages école ↔ association.
CREATE OR REPLACE FUNCTION public.push_on_school_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _from TEXT;
  r     RECORD;
BEGIN
  IF NEW.from_school THEN
    SELECT name INTO _from FROM public.schools WHERE id = NEW.school_id;
    FOR r IN SELECT p.id FROM public.profiles p
             WHERE p.association_id = NEW.association_id AND p.membership_status = 'approved'
               AND p.id IS DISTINCT FROM NEW.sender_id LOOP
      PERFORM public.enqueue_push(r.id, coalesce(_from, 'Ton école'), NEW.body, '/messages', 'msg-' || NEW.association_id);
    END LOOP;
  ELSE
    SELECT name INTO _from FROM public.associations WHERE id = NEW.association_id;
    FOR r IN SELECT sa.user_id AS id FROM public.school_admins sa
             WHERE sa.school_id = NEW.school_id AND sa.user_id IS DISTINCT FROM NEW.sender_id LOOP
      PERFORM public.enqueue_push(r.id, coalesce(_from, 'Une association'), NEW.body,
        '/school-admin/messages?a=' || NEW.association_id, 'msg-' || NEW.association_id);
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push message: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_school_message ON public.school_messages;
CREATE TRIGGER push_on_school_message AFTER INSERT ON public.school_messages
  FOR EACH ROW EXECUTE FUNCTION public.push_on_school_message();

-- Événements : à valider (école) puis validé / refusé (organisateur).
CREATE OR REPLACE FUNCTION public.push_on_event_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.approval_status END;
  r    RECORD;
BEGIN
  IF NEW.approval_status IS NOT DISTINCT FROM _old THEN RETURN NULL; END IF;
  IF NEW.approval_status = 'pending' AND NEW.school_id IS NOT NULL THEN
    FOR r IN SELECT user_id FROM public.school_admins WHERE school_id = NEW.school_id LOOP
      PERFORM public.enqueue_push(r.user_id, 'Événement à valider',
        coalesce(NEW.association, 'Une association') || ' : ' || NEW.title, '/school-admin/reviews', 'reviews');
    END LOOP;
  ELSIF NEW.approval_status = 'approved' AND _old = 'pending' THEN
    PERFORM public.enqueue_push(NEW.organizer_id, 'Événement validé ✅',
      '« ' || NEW.title || ' » est publié.', '/events/' || NEW.id, 'event-' || NEW.id);
  ELSIF NEW.approval_status = 'rejected' THEN
    PERFORM public.enqueue_push(NEW.organizer_id, 'Événement refusé',
      '« ' || NEW.title || ' » a été refusé par ton école. Ouvre-le pour voir le motif.',
      '/events/' || NEW.id || '/edit', 'event-' || NEW.id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push event: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_event_review ON public.events;
CREATE TRIGGER push_on_event_review AFTER INSERT OR UPDATE OF approval_status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.push_on_event_review();

-- Rattachement à une école : demande (école) puis réponse (membre).
CREATE OR REPLACE FUNCTION public.push_on_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.membership_status IS NOT DISTINCT FROM OLD.membership_status
     AND NEW.association_id IS NOT DISTINCT FROM OLD.association_id THEN RETURN NULL; END IF;
  IF NEW.membership_status = 'pending' AND NEW.school_id IS NOT NULL THEN
    FOR r IN SELECT user_id FROM public.school_admins WHERE school_id = NEW.school_id LOOP
      PERFORM public.enqueue_push(r.user_id, 'Nouveau membre à valider',
        coalesce(nullif(NEW.full_name, ''), 'Un compte')
          || CASE WHEN coalesce(NEW.association, '') <> '' THEN ' (' || NEW.association || ')' ELSE '' END,
        '/school-admin/members', 'members');
    END LOOP;
  ELSIF NEW.membership_status = 'approved' AND OLD.membership_status = 'pending' THEN
    PERFORM public.enqueue_push(NEW.id, 'Rattachement validé ✅',
      CASE WHEN coalesce(NEW.association, '') <> ''
           THEN 'Ton école a validé ' || NEW.association || '. Tu peux créer des événements.'
           ELSE 'Ton école a validé ton rattachement.' END,
      '/settings', 'membership');
  ELSIF NEW.membership_status = 'rejected' AND OLD.membership_status IS DISTINCT FROM 'rejected' THEN
    PERFORM public.enqueue_push(NEW.id, 'Rattachement refusé',
      'Ton école n''a pas validé ton rattachement. Tu peux en choisir un autre dans Paramètres.', '/settings', 'membership');
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push membership: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_membership ON public.profiles;
CREATE TRIGGER push_on_membership AFTER UPDATE OF membership_status, association_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.push_on_membership();

-- Liste d'attente : une place est proposée.
CREATE OR REPLACE FUNCTION public.push_on_waitlist_offer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _title TEXT;
BEGIN
  IF NEW.status = 'offered' AND OLD.status IS DISTINCT FROM 'offered' THEN
    SELECT title INTO _title FROM public.events WHERE id = NEW.event_id;
    PERFORM public.enqueue_push(NEW.user_id, 'Une place s''est libérée ! 🎟️',
      coalesce(_title, 'Un événement') || ' : elle t''est réservée pour un temps limité.',
      '/events/' || NEW.event_id, 'waitlist-' || NEW.event_id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push waitlist: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_waitlist_offer ON public.waitlist;
CREATE TRIGGER push_on_waitlist_offer AFTER UPDATE OF status ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.push_on_waitlist_offer();

-- Nouvelle association créée par un organisateur → école.
CREATE OR REPLACE FUNCTION public.push_on_association()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'pending' THEN
    FOR r IN SELECT user_id FROM public.school_admins WHERE school_id = NEW.school_id LOOP
      PERFORM public.enqueue_push(r.user_id, 'Nouvelle association', NEW.name || ' demande à être validée.',
        '/school-admin', 'associations');
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push association: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_association ON public.associations;
CREATE TRIGGER push_on_association AFTER INSERT ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.push_on_association();

-- Admin Plav' : justificatif à vérifier, école à valider.
CREATE OR REPLACE FUNCTION public.push_to_admins(_title TEXT, _body TEXT, _url TEXT, _tag TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.enqueue_push(r.user_id, _title, _body, _url, _tag);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.push_to_admins(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.push_on_verification_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'review' AND OLD.verification_status IS DISTINCT FROM 'review' THEN
    PERFORM public.push_to_admins('Justificatif à vérifier',
      coalesce(nullif(NEW.full_name, ''), 'Un étudiant') || ' a envoyé son justificatif.', '/admin/verifications', 'verifications');
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push verification: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_verification_review ON public.profiles;
CREATE TRIGGER push_on_verification_review AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.push_on_verification_review();

CREATE OR REPLACE FUNCTION public.push_on_school_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.push_to_admins('École à valider', NEW.name || ' demande à rejoindre Plav''.', '/admin/schools', 'schools');
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'push school: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS push_on_school_request ON public.schools;
CREATE TRIGGER push_on_school_request AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.push_on_school_request();


-- 4. Filet de sécurité : reprise des envois manqués + ménage ---------------------------
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  PERFORM cron.schedule('plav-push-retry', '* * * * *', $job$
    SELECT net.http_post(
      url     := 'https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret')),
      body    := '{}'::jsonb)
    WHERE EXISTS (SELECT 1 FROM public.push_outbox
                   WHERE sent_at IS NULL AND created_at < now() - interval '30 seconds'
                     AND created_at > now() - interval '1 day')
  $job$);
  PERFORM cron.schedule('plav-push-cleanup', '17 3 * * *',
    $job$DELETE FROM public.push_outbox WHERE created_at < now() - interval '7 days'$job$);
EXCEPTION WHEN others THEN
  RAISE WARNING 'Planification impossible (%). Activez pg_cron et pg_net puis relancez ce script.', SQLERRM;
END
$cron$;
