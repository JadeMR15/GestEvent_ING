-- ============================================================
-- Supprime toutes les données de démo créées par seed_demo.sql
-- (comptes, écoles, domaines, associations, soirées, inscriptions en *.plav-demo.fr).
-- Attention : les inscriptions de vrais utilisateurs à des soirées de démo sont supprimées aussi.
-- ============================================================
BEGIN;

DELETE FROM public.events
WHERE school_id IN (SELECT id FROM public.schools WHERE email_domains[1] LIKE '%.plav-demo.fr')
   OR organizer_id IN (SELECT id FROM auth.users WHERE email LIKE '%.plav-demo.fr');

DELETE FROM auth.users WHERE email LIKE '%.plav-demo.fr';   -- profils, rôles, inscriptions, abonnements en cascade

DELETE FROM public.associations
WHERE school_id IN (SELECT id FROM public.schools WHERE email_domains[1] LIKE '%.plav-demo.fr');

DELETE FROM public.schools WHERE email_domains[1] LIKE '%.plav-demo.fr';
DELETE FROM public.school_domains WHERE domain LIKE '%.plav-demo.fr';

COMMIT;
