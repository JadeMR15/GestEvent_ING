-- ============================================================
-- Plav' — Fermeture de la lecture publique des inscriptions et des bénévoles
-- 24/11/2026. Rejouable sans erreur. À lancer dans l'éditeur SQL de Supabase.
--
-- Constaté le 17/11/2026 : avec la seule clé publique (sans compte), on lisait
-- toute la table registrations (dont qr_code, guest_email, document_url) et toute
-- la table volunteers. Cause : deux règles de mai jamais supprimées
--   - "Registrations publicly readable" (setup.sql)
--   - "Volunteers readable by anyone"   (migration.sql)
--
-- Plus rien ne dépend de ces règles :
--   - l'accueil compte les places avec get_events_taken() (nombres seulement) ;
--   - la page bénévole passe par get_volunteer_by_token() / get_volunteer_event() ;
--   - les comptes connectés gardent leurs règles habituelles (ses propres
--     inscriptions, l'organisateur pour son événement, l'école, l'admin).
-- ============================================================

DROP POLICY IF EXISTS "Registrations publicly readable" ON public.registrations;
DROP POLICY IF EXISTS "Volunteers readable by anyone" ON public.volunteers;

-- Contrôle : plus aucune règle de lecture réservée aux visiteurs ou ouverte à tous
-- (« true ») sur ces deux tables. Doit renvoyer 0 ligne.
SELECT tablename, policyname, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('registrations', 'volunteers')
   AND cmd IN ('SELECT', 'ALL')
   AND ('anon' = ANY (roles) OR qual = 'true');
