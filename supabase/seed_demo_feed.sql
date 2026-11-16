-- ============================================================
-- Fil d'actu de démo — 2026-11-16 (après seed_demo.sql et seed_demo_photos.sql)
-- - publications des 8 associations de démo (retours de soirées, annonces, actus)
-- - « j'aime » des étudiants de démo
-- - abonne TON compte (mon_email ci-dessous) aux 8 associations de démo
-- Aucune notification push : le déclencheur des publications est coupé le temps du script.
-- Peut être relancé : les anciennes publications de démo sont remplacées.
-- ============================================================

DO $$
DECLARE
  mon_email TEXT := 'olive.peret@gmail.com';   -- compte dont le fil est rempli
  me UUID;
  demo UUID[];
  a RECORD; e RECORD;
  general TEXT[];
  txt TEXT; post_at TIMESTAMPTZ; k INT;
  recaps TEXT[] := ARRAY[
    'Merci à tous d''être venus à la %s ! 🎉 Les photos arrivent très vite sur la page.',
    'Quelle soirée ! %s personnes à la %s, on n''en revient toujours pas. Merci à vous ❤️',
    '%s : c''était incroyable. Merci aux bénévoles et à tous ceux qui étaient là !',
    'Encore merci pour la %s. Dites-nous en commentaire ce que vous voulez pour la prochaine 👀'];
  teasers TEXT[] := ARRAY[
    'Les places pour la %s du %s sont en ligne ! Premier arrivé, premier servi 🔥',
    'Plus que quelques jours avant la %s… Vous êtes prêts ? 🕺',
    'J-%s avant la %s ! On vous attend nombreux.',
    'La %s approche : il reste encore des places, foncez !'];
BEGIN
  SELECT id INTO me FROM auth.users WHERE lower(email) = lower(mon_email);
  IF me IS NULL THEN RAISE EXCEPTION 'Aucun compte avec l''email %', mon_email; END IF;
  SELECT array_agg(id) INTO demo FROM public.schools WHERE email_domains[1] LIKE '%.plav-demo.fr';
  IF demo IS NULL THEN RAISE EXCEPTION 'Aucune école de démo : lance d''abord seed_demo.sql.'; END IF;

  -- Pas de notification push à chaque publication.
  ALTER TABLE public.association_posts DISABLE TRIGGER USER;

  -- Repart de zéro pour les associations de démo.
  DELETE FROM public.association_posts p USING public.associations x
  WHERE x.id = p.association_id AND x.school_id = ANY (demo);

  -- Mon compte suit les 8 associations de démo.
  INSERT INTO public.association_follows (user_id, association_id, created_at)
  SELECT me, x.id, now() - interval '60 days' FROM public.associations x WHERE x.school_id = ANY (demo)
  ON CONFLICT DO NOTHING;

  FOR a IN SELECT x.* FROM public.associations x WHERE x.school_id = ANY (demo) LOOP
    general := CASE
      WHEN a.name ~* 'sound' THEN ARRAY[
        'Le replay du DJ set de vendredi est dispo, lien en bio 🎧',
        'Appel aux artistes : tu mixes ou tu joues d''un instrument ? Viens jouer à notre prochaine soirée !',
        'Nouvelle playlist de la semaine : 25 sons validés par le bureau 🔊',
        'On cherche des bénévoles pour la technique (son, lumières). Écris-nous !']
      WHEN a.name ~* 'sport' THEN ARRAY[
        'Victoire 3-1 de l''équipe de foot ce week-end ⚽ Bravo à tous !',
        'Les inscriptions pour le week-end ski de janvier sont ouvertes ⛷️',
        'Footing collectif tous les mardis à 18 h devant l''école, tous niveaux bienvenus 🏃',
        'Tournoi de volley inter-écoles : on monte une équipe, qui est chaud ?']
      WHEN a.name ~* 'atelier' THEN ARRAY[
        'L''expo des étudiants de 2e année est visible tout le mois au foyer 🎨',
        'Atelier croquis ouvert à tous mardi soir, le matériel est fourni ✏️',
        'Appel à projets : envoie-nous tes créations pour la prochaine expo !',
        'Visite du musée des Beaux-Arts samedi, gratuit pour les adhérents.']
      WHEN a.name ~* 'gaming' THEN ARRAY[
        'Résultats du tournoi Rocket League : bravo à l''équipe « Les Vaubanais » 🏆',
        'Soirée jeux de société jeudi, ramenez vos jeux préférés 🎲',
        'On ouvre une équipe Valorant pour la ligue étudiante, essais la semaine prochaine 🎮',
        'Nouveau : la salle gaming est ouverte tous les soirs jusqu''à 22 h.']
      ELSE ARRAY[
        'Les inscriptions pour le week-end d''intégration ouvrent lundi ! 🏕️',
        'Nouveau : la carte BDE donne -20 % au foyer et chez nos partenaires.',
        'On recrute ! Rejoins le bureau pour l''année prochaine, candidatures ouvertes jusqu''à la fin du mois.',
        'Petit rappel : le foyer est ouvert tous les midis, venez vous poser ☕',
        'Merci pour vos réponses au sondage : le thème du gala sera dévoilé la semaine prochaine 👀']
    END;

    -- Retours sur les soirées des 2 derniers mois
    FOR e IN SELECT * FROM public.events WHERE association_id = a.id AND starts_at < now() AND starts_at > now() - interval '60 days' LOOP
      k := 1 + floor(random() * array_length(recaps, 1))::int;
      txt := CASE k
        WHEN 2 THEN format(recaps[2], (SELECT count(*) FROM public.registrations r WHERE r.event_id = e.id AND r.status = 'attended'), e.title)
        ELSE format(recaps[k], e.title) END;
      INSERT INTO public.association_posts (association_id, author_id, body, event_id, created_at)
      VALUES (a.id, a.created_by, txt, e.id, e.starts_at + interval '14 hours' + interval '1 hour' * floor(random() * 10));
    END LOOP;

    -- Annonces des soirées à venir
    FOR e IN SELECT * FROM public.events WHERE association_id = a.id AND starts_at >= now() LOOP
      post_at := greatest(e.created_at, now() - interval '20 days') + (now() - greatest(e.created_at, now() - interval '20 days')) * random();
      k := 1 + floor(random() * array_length(teasers, 1))::int;
      txt := CASE k
        WHEN 1 THEN format(teasers[1], e.title, to_char(e.starts_at, 'DD/MM'))
        WHEN 3 THEN format(teasers[3], greatest(1, extract(day FROM e.starts_at - post_at)::int), e.title)
        ELSE format(teasers[k], e.title) END;
      INSERT INTO public.association_posts (association_id, author_id, body, event_id, created_at)
      VALUES (a.id, a.created_by, txt, e.id, post_at);
    END LOOP;

    -- Actus de l'association (3 sur les 45 derniers jours)
    FOR k IN SELECT t FROM generate_series(1, array_length(general, 1)) t ORDER BY random() LIMIT 3 LOOP
      INSERT INTO public.association_posts (association_id, author_id, body, created_at)
      VALUES (a.id, a.created_by, general[k], now() - interval '45 days' * random());
    END LOOP;
  END LOOP;

  -- « J'aime » des étudiants de démo abonnés
  INSERT INTO public.post_likes (post_id, user_id, created_at)
  SELECT p.id, f.user_id, p.created_at + interval '1 hour' * random() * 48
  FROM public.association_posts p
  JOIN public.association_follows f ON f.association_id = p.association_id
  JOIN auth.users u ON u.id = f.user_id AND u.email LIKE '%.plav-demo.fr'
  JOIN public.associations x ON x.id = p.association_id AND x.school_id = ANY (demo)
  WHERE random() < 0.35
  ON CONFLICT DO NOTHING;

  ALTER TABLE public.association_posts ENABLE TRIGGER USER;
END;
$$;

SELECT x.name AS association, count(p.id) AS publications,
  (SELECT count(*) FROM public.post_likes l JOIN public.association_posts q ON q.id = l.post_id WHERE q.association_id = x.id) AS likes
FROM public.associations x
JOIN public.schools s ON s.id = x.school_id AND s.email_domains[1] LIKE '%.plav-demo.fr'
LEFT JOIN public.association_posts p ON p.association_id = x.id
GROUP BY x.id, x.name ORDER BY x.name;
