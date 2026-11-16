-- ============================================================
-- Données de démo pour les statistiques — 2026-11-16
-- 4 écoles fictives · 8 associations (2 par école, chacune avec son organisateur)
-- 100 étudiants · 88 soirées (6 derniers mois + 2 prochains) · inscriptions et présences
--
-- À lancer dans Supabase > SQL Editor (une seule fois ; nettoyage : seed_demo_cleanup.sql).
-- Un seul bloc : tout est créé, ou rien en cas d'erreur.
-- Tout est reconnaissable : emails et domaines en *.plav-demo.fr.
-- Les comptes de démo n'ont pas de mot de passe : personne ne peut s'y connecter.
-- Les déclencheurs des tables public sont coupés pendant l'insertion : aucun email ni push.
-- Les soirées sont publiées : elles sont visibles par tous les utilisateurs.
-- ============================================================

DO $$
DECLARE
  s_names   TEXT[] := ARRAY['Sup''Rhône Ingénieurs', 'Garonne Business School', 'Atlantique Design School', 'Institut Vauban du Numérique'];
  s_slugs   TEXT[] := ARRAY['suprhone', 'garonne-bs', 'atlantique-design', 'vauban-num'];
  s_cities  TEXT[] := ARRAY['Lyon', 'Toulouse', 'Nantes', 'Lille'];
  s_lat     FLOAT8[] := ARRAY[45.764, 43.604, 47.218, 50.629];
  s_lng     FLOAT8[] := ARRAY[4.836, 1.444, -1.554, 3.057];
  a_names   TEXT[] := ARRAY['BDE Sup''Rhône', 'Rhône Sound System',
                            'BDE Garonne', 'Garonne Sports Club',
                            'BDE Atlantique', 'Atelier Nocturne',
                            'BDE Vauban', 'Vauban Gaming League'];
  a_desc    TEXT[] := ARRAY['Le bureau des élèves : intégration, soirées et gala.', 'Concerts, DJ sets et soirées électro.',
                            'Toutes les soirées et le gala de Garonne BS.', 'Tournois, afterworks sportifs et week-ends ski.',
                            'Soirées, voyages et vie étudiante de l''école.', 'Expos, vernissages et soirées créatives.',
                            'Le BDE de l''Institut Vauban : soirées et événements.', 'LAN parties, tournois e-sport et blind tests.'];
  f_first   TEXT[] := ARRAY['Emma','Léa','Chloé','Manon','Camille','Inès','Sarah','Jade','Louise','Zoé','Lina','Clara','Alice','Juliette','Lou','Anaïs','Maëlys','Nina','Rose','Yasmine'];
  m_first   TEXT[] := ARRAY['Lucas','Hugo','Louis','Nathan','Gabriel','Arthur','Jules','Adam','Raphaël','Tom','Théo','Noah','Mathis','Enzo','Yanis','Sacha','Paul','Maxime','Ilyes','Antoine'];
  lasts     TEXT[] := ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','André','Mercier','Dupont','Lambert','Bonnet','François','Martinez','Benali','Nguyen','Diallo','Rousseau','Blanc','Guerin'];
  titles    TEXT[] := ARRAY['Soirée d''intégration','Afterwork du jeudi','Gala d''hiver','Soirée Karaoké','Blind test géant','Soirée Années 80','Bar à jeux','Concert live','Soirée Casino','Apéro de rentrée','Soirée Halloween','Pub quiz','Soirée Erasmus','Silent party','Soirée Disco','Tournoi de pétanque','Soirée Blanche','Nuit de l''électro','Bal masqué','Soirée de fin de partiels'];
  venues    TEXT[] := ARRAY['Péniche Le Quai','Le Hangar','Salle des fêtes','Bar Le Comptoir','Rooftop Les Toits','Le Club 21','Foyer de l''école','La Brasserie du Port'];
  prices    NUMERIC[] := ARRAY[0, 0, 5, 5, 8, 10, 10, 12, 15, 20];

  school_ids  UUID[] := '{}';
  asso_ids    UUID[] := '{}';            -- index 1..8 ; école = (n + 1) / 2
  orga_ids    UUID[] := '{}';
  stu_ids     UUID[] := '{}';            -- index 1..100
  stu_school  INT[]  := '{}';
  stu_created TIMESTAMPTZ[] := '{}';
  stu_ok      BOOLEAN[] := '{}';

  uid UUID; sid UUID; aid UUID; eid UUID;
  i INT; j INT; k INT; s INT; n INT;
  g TEXT; fn TEXT; ln TEXT; mail TEXT; created TIMESTAMPTZ; is_verified BOOLEAN; is_orga BOOLEAN;
  ev_start TIMESTAMPTZ; ev_created TIMESTAMPTZ; cap INT; pop FLOAT8; taken INT;
  reg_at TIMESTAMPTZ; x FLOAT8; reg_status public.registration_status;
  nb_events INT := 0; nb_regs INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_domains WHERE domain LIKE '%.plav-demo.fr') THEN
    RAISE EXCEPTION 'Les données de démo existent déjà : lance d''abord seed_demo_cleanup.sql.';
  END IF;
  -- Coupe les déclencheurs (emails, push, contrôles) le temps de l'insertion.
  -- En cas d'erreur, tout est annulé, y compris cette désactivation.
  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  ALTER TABLE public.user_roles DISABLE TRIGGER USER;
  ALTER TABLE public.schools DISABLE TRIGGER USER;
  ALTER TABLE public.school_domains DISABLE TRIGGER USER;
  ALTER TABLE public.associations DISABLE TRIGGER USER;
  ALTER TABLE public.events DISABLE TRIGGER USER;
  ALTER TABLE public.registrations DISABLE TRIGGER USER;
  ALTER TABLE public.association_follows DISABLE TRIGGER USER;
  PERFORM setseed(0.42);

  -- 1. Écoles, domaines, associations --------------------------------------------
  FOR s IN 1..4 LOOP
    sid := gen_random_uuid();
    INSERT INTO public.schools (id, name, email_domains, status, created_at, updated_at)
    VALUES (sid, s_names[s], ARRAY[s_slugs[s] || '.plav-demo.fr'], 'active', now() - interval '210 days', now() - interval '210 days');
    school_ids := school_ids || sid;
    INSERT INTO public.school_domains (school_name, domain, active) VALUES (s_names[s], s_slugs[s] || '.plav-demo.fr', true);
    FOR k IN 1..2 LOOP
      n := (s - 1) * 2 + k;
      aid := gen_random_uuid();
      INSERT INTO public.associations (id, school_id, name, description, status, requires_approval, created_at, updated_at)
      VALUES (aid, sid, a_names[n], a_desc[n], 'active', false, now() - interval '200 days', now() - interval '200 days');
      asso_ids := asso_ids || aid;
    END LOOP;
  END LOOP;

  -- 2. Comptes : 8 organisateurs (un par asso) puis 100 étudiants (25 par école) ------
  FOR i IN 1..108 LOOP
    is_orga := i <= 8;
    IF is_orga THEN
      n := i; s := (i + 1) / 2;
      mail := 'orga' || i || '@' || s_slugs[s] || '.plav-demo.fr';
      created := now() - interval '200 days';
      is_verified := true;
    ELSE
      n := NULL; s := ((i - 9) % 4) + 1;
      mail := 'etudiant' || (i - 8) || '@' || s_slugs[s] || '.plav-demo.fr';
      -- Plus de comptes anciens (rentrée) que récents.
      created := now() - interval '185 days' * sqrt(random());
      is_verified := random() < 0.88;
    END IF;
    x := random();
    g := CASE WHEN NOT is_orga AND x < 0.05 THEN 'autre' WHEN x < 0.52 THEN 'femme' ELSE 'homme' END;
    fn := CASE WHEN g = 'femme' THEN f_first[1 + floor(random() * 20)::int] ELSE m_first[1 + floor(random() * 20)::int] END;
    ln := lasts[1 + floor(random() * array_length(lasts, 1))::int];
    uid := gen_random_uuid();

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, '', created,
      created, created, created + (now() - created) * (0.5 + random() * 0.5),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', fn || ' ' || ln, 'school', s_names[s], 'demo', true,
                         'role', CASE WHEN is_orga THEN 'organizer' ELSE 'participant' END),
      '', '', '', '');

    -- Le profil est déjà créé par le déclencheur d'inscription (handle_new_user) : on le complète.
    INSERT INTO public.profiles (id, full_name, school, association, created_at, updated_at, gender, birth_date,
      school_id, association_id, membership_status, is_student,
      verification_status, verification_method, verified_at, verification_expires_at, school_email)
    VALUES (uid, fn || ' ' || ln, s_names[s], CASE WHEN is_orga THEN a_names[n] ELSE '' END, created, created, g,
      date '2002-01-01' + (random() * 365 * 6)::int,
      school_ids[s], CASE WHEN is_orga THEN asso_ids[n] END, 'approved', true,
      (CASE WHEN is_verified THEN 'verified' ELSE 'unverified' END)::public.verification_status,
      CASE WHEN is_verified THEN 'school_email' END,
      CASE WHEN is_verified THEN created + interval '10 minutes' END,
      CASE WHEN is_verified THEN timestamptz '2027-08-31 23:59:59+02' END,
      CASE WHEN is_verified THEN mail END)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, school = EXCLUDED.school, association = EXCLUDED.association,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, gender = EXCLUDED.gender,
      birth_date = EXCLUDED.birth_date, school_id = EXCLUDED.school_id, association_id = EXCLUDED.association_id,
      membership_status = EXCLUDED.membership_status, is_student = EXCLUDED.is_student,
      verification_status = EXCLUDED.verification_status, verification_method = EXCLUDED.verification_method,
      verified_at = EXCLUDED.verified_at, verification_expires_at = EXCLUDED.verification_expires_at,
      school_email = EXCLUDED.school_email;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, (CASE WHEN is_orga THEN 'organizer' ELSE 'participant' END)::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    -- Un organisateur n'a pas besoin du rôle participant ajouté par défaut.
    IF is_orga THEN DELETE FROM public.user_roles WHERE user_id = uid AND role = 'participant'; END IF;

    IF is_orga THEN
      orga_ids := orga_ids || uid;
      UPDATE public.associations SET created_by = uid WHERE id = asso_ids[n];
    ELSE
      stu_ids := stu_ids || uid;
      stu_school := stu_school || s;
      stu_created := stu_created || created;
      stu_ok := stu_ok || is_verified;
    END IF;
  END LOOP;

  -- 3. Abonnements aux associations -------------------------------------------------
  FOR j IN 1..100 LOOP
    FOR n IN 1..8 LOOP
      IF random() < (CASE WHEN stu_school[j] = (n + 1) / 2 THEN 0.6 ELSE 0.05 END) THEN
        INSERT INTO public.association_follows (user_id, association_id, created_at)
        VALUES (stu_ids[j], asso_ids[n], stu_created[j] + interval '1 day' * random() * 20);
      END IF;
    END LOOP;
  END LOOP;

  -- 4. Soirées : 8 passées et 3 à venir par association, avec inscriptions -------------
  FOR n IN 1..8 LOOP
    s := (n + 1) / 2;
    FOR k IN 1..11 LOOP
      IF k <= 8 THEN
        ev_start := date_trunc('day', now() - interval '180 days' * random()) + interval '20 hours' + interval '30 minutes' * floor(random() * 5);
      ELSE
        ev_start := date_trunc('day', now() + interval '3 days' + interval '57 days' * random()) + interval '20 hours' + interval '30 minutes' * floor(random() * 5);
      END IF;
      ev_created := least(ev_start - interval '1 day' * (12 + floor(random() * 30)), now() - interval '2 hours');
      cap := (4 + floor(random() * 12)::int) * 10;   -- 40 à 150 places
      pop := 0.3 + random() * 0.5;                    -- popularité de la soirée
      eid := gen_random_uuid();

      INSERT INTO public.events (id, title, description, location, city, latitude, longitude, starts_at, capacity, price,
        organizer_id, status, school, association, school_id, association_id, approval_status,
        created_at, updated_at, followers_notified_at)
      VALUES (eid,
        titles[1 + floor(random() * array_length(titles, 1))::int],
        'Organisé par ' || a_names[n] || '. Ambiance garantie, venez nombreux !',
        venues[1 + floor(random() * array_length(venues, 1))::int] || ', ' || s_cities[s],
        s_cities[s], s_lat[s] + (random() - 0.5) * 0.04, s_lng[s] + (random() - 0.5) * 0.04,
        ev_start, cap, prices[1 + floor(random() * array_length(prices, 1))::int],
        orga_ids[n], 'published', s_names[s], a_names[n], school_ids[s], asso_ids[n], 'not_required',
        ev_created, ev_created, ev_created);
      nb_events := nb_events + 1;

      taken := 0;
      FOR j IN SELECT t FROM generate_series(1, 100) t ORDER BY random() LOOP
        EXIT WHEN taken >= cap;
        CONTINUE WHEN NOT stu_ok[j] OR stu_created[j] >= ev_start - interval '1 day';
        CONTINUE WHEN random() >= (CASE WHEN stu_school[j] = s THEN pop ELSE 0.04 END);
        reg_at := greatest(ev_created, stu_created[j])
                  + (least(ev_start, now()) - greatest(ev_created, stu_created[j])) * random();
        x := random();
        IF ev_start < now() THEN
          reg_status := (CASE WHEN x < 0.78 THEN 'attended' WHEN x < 0.86 THEN 'cancelled' ELSE 'registered' END)::public.registration_status;
        ELSE
          reg_status := (CASE WHEN x < 0.94 THEN 'registered' ELSE 'cancelled' END)::public.registration_status;
        END IF;
        INSERT INTO public.registrations (event_id, user_id, status, registered_at, attended_at)
        VALUES (eid, stu_ids[j], reg_status, reg_at,
                CASE WHEN reg_status = 'attended' THEN ev_start + interval '1 minute' * floor(random() * 150) END);
        nb_regs := nb_regs + 1;
        IF reg_status <> 'cancelled' THEN taken := taken + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  ALTER TABLE public.profiles ENABLE TRIGGER USER;
  ALTER TABLE public.user_roles ENABLE TRIGGER USER;
  ALTER TABLE public.schools ENABLE TRIGGER USER;
  ALTER TABLE public.school_domains ENABLE TRIGGER USER;
  ALTER TABLE public.associations ENABLE TRIGGER USER;
  ALTER TABLE public.events ENABLE TRIGGER USER;
  ALTER TABLE public.registrations ENABLE TRIGGER USER;
  ALTER TABLE public.association_follows ENABLE TRIGGER USER;
  RAISE NOTICE 'Démo créée : 4 écoles, 8 associations, 108 comptes, % soirées, % inscriptions.', nb_events, nb_regs;
END;
$$;

-- Récapitulatif
SELECT sc.name AS ecole,
  (SELECT count(*) FROM public.profiles p WHERE p.school_id = sc.id) AS comptes,
  (SELECT count(*) FROM public.associations a WHERE a.school_id = sc.id) AS assos,
  (SELECT count(*) FROM public.events e WHERE e.school_id = sc.id) AS soirees,
  (SELECT count(*) FROM public.registrations r JOIN public.events e ON e.id = r.event_id WHERE e.school_id = sc.id) AS inscriptions
FROM public.schools sc
WHERE sc.email_domains[1] LIKE '%.plav-demo.fr'
ORDER BY sc.name;
