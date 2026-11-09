-- ============================================================
-- Emails automatiques liés à la vérification étudiante (2026-11-09)
-- À lancer dans Supabase > SQL Editor. Peut être relancé sans risque.
--
-- Quand le statut de vérification d'un profil passe à "verified", "rejected"
-- ou "review", la base appelle la fonction send-account-emails, qui prévient
-- l'étudiant (et les admins pour "review").
-- ============================================================

-- Permet à la base de faire des appels HTTP.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Secret partagé entre la base et la fonction -----------------------------
-- Généré ici et rangé dans le coffre (Vault) : il n'apparaît nulle part ailleurs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'email_webhook_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'email_webhook_secret',
      'Authentifie les appels de la base vers send-account-emails'
    );
  END IF;
END $$;

-- La fonction d'envoi vérifie le secret via cette fonction, réservée au serveur.
CREATE OR REPLACE FUNCTION public.check_email_webhook_secret(_secret TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'email_webhook_secret' AND decrypted_secret = _secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.check_email_webhook_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_webhook_secret(TEXT) TO service_role;

-- 2. Déclencheur sur le statut de vérification --------------------------------
CREATE OR REPLACE FUNCTION public.notify_verification_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _secret TEXT;
BEGIN
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret';
  IF _secret IS NULL THEN
    RETURN NEW; -- pas de secret : on n'envoie rien plutôt que de bloquer la mise à jour
  END IF;

  -- Appel asynchrone : la mise à jour du profil n'attend pas l'envoi de l'email.
  PERFORM net.http_post(
    url     := 'https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-account-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', _secret),
    body    := jsonb_build_object(
      'type',    'verification',
      'user_id', NEW.id,
      'status',  NEW.verification_status,
      'note',    NEW.verification_note
    )
  );
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_verification_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_notify_verification ON public.profiles;
CREATE TRIGGER profiles_notify_verification
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW
  WHEN (OLD.verification_status IS DISTINCT FROM NEW.verification_status
        AND NEW.verification_status IN ('verified', 'rejected', 'review'))
  EXECUTE FUNCTION public.notify_verification_change();
