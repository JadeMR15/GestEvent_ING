-- ============================================================
-- Correctifs de sécurité — 2026-11-14
-- 1. Abonnements aux associations : participants uniquement.
-- 2. Fuite « Lecture publique des événements » (USING true) : n'importe qui lisait tous
--    les événements, brouillons, en attente de validation et réservés à une école compris.
--    Les règles restantes : public = publiés/terminés et validés ; connectés = règles
--    habituelles (privés de son école, ses propres événements, école, admin).
--    La page bénévole (lien sans compte) lit son événement par son jeton.
-- ============================================================

-- 1. Abonnements -------------------------------------------------------------------------
DROP POLICY IF EXISTS "follows_insert_own" ON public.association_follows;
CREATE POLICY "follows_insert_own" ON public.association_follows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND public.has_role(auth.uid(), 'participant')
    AND NOT public.has_role(auth.uid(), 'organizer')
    AND NOT public.has_role(auth.uid(), 'school_admin')
    AND EXISTS (SELECT 1 FROM public.associations a WHERE a.id = association_id AND a.status = 'active'));

-- Abonnements déjà créés par des comptes qui ne sont pas participants.
DELETE FROM public.association_follows f
WHERE NOT public.has_role(f.user_id, 'participant')
   OR public.has_role(f.user_id, 'organizer')
   OR public.has_role(f.user_id, 'school_admin');


-- 2. Événements -------------------------------------------------------------------------
-- Page bénévole : l'événement du jeton, sans compte.
CREATE OR REPLACE FUNCTION public.get_volunteer_event(p_token TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at,
                            'location', e.location, 'cover_image_url', e.cover_image_url)
  FROM public.volunteers v JOIN public.events e ON e.id = v.event_id
  WHERE v.token::text = p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_volunteer_event(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Lecture publique des événements" ON public.events;
-- Doublon plus permissif (publié mais encore en attente de validation).
DROP POLICY IF EXISTS "Events publicly
  readable" ON public.events;
-- Public : publiés ou terminés, et validés (comme get_public_events).
DROP POLICY IF EXISTS "Events publicly readable" ON public.events;
CREATE POLICY "Events publicly readable" ON public.events FOR SELECT TO anon
  USING (status IN ('published', 'closed') AND approval_status IN ('not_required', 'approved'));

-- Contrôle : règles de lecture restantes.
SELECT policyname, roles::text FROM pg_policies WHERE tablename = 'events' AND cmd = 'SELECT';
