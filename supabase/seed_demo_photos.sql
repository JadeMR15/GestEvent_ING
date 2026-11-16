-- ============================================================
-- Photos des données de démo (seed_demo.sql) — 2026-11-16
-- Couvertures des soirées + bannières des associations, photos libres Unsplash.
-- Ne touche qu'aux écoles de démo (*.plav-demo.fr). Peut être relancé (nouveau tirage).
-- ============================================================

DO $$
DECLARE
  party   TEXT[] := ARRAY['1429962714451-bb934ecdc4ec', '1478147427282-58a87a120781', '1492684223066-81342ee5ff30', '1496024840928-4c417adf211d', '1501386761578-eac5c94b800a', '1505236858219-8359eb29e329', '1514525253161-7a46d19cd819', '1533174072545-7a4b6ad7a6c3', '1566737236500-c8ac43014a67'];
  concert TEXT[] := ARRAY['1459749411175-04bf5292ceea', '1470225620780-dba8ba36b745', '1493225457124-a3eb161ffa5f', '1501281668745-f7f57925c3b4', '1504680177321-2e6a879aac86', '1506157786151-b8491531f063', '1516450360452-9312f5e86fc7', '1524368535928-5b5e00ddc76b', '1574391884720-bbc3740c59d1'];
  sport   TEXT[] := ARRAY['1461896836934-ffe607ba8211', '1517649763962-0c623066013b', '1518611012118-696072aa579a', '1551698618-1dfe5d97d256', '1552674605-db6ffd4facb5', '1574629810360-7efbbe195018'];
  art     TEXT[] := ARRAY['1460661419201-fd4cecdf8a8b', '1513364776144-60967b0f800f', '1531913764164-f85c52e6e654', '1547891654-e66ed7ebb968'];
  gaming  TEXT[] := ARRAY['1511512578047-dfb367046420', '1538481199705-c710c4e965fc', '1542751371-adc38448a05e', '1550745165-9bc0b252726f', '1593305841991-05c297ba4575', '1600861194942-f883de0dfe96'];
  gala    TEXT[] := ARRAY['1508997449629-303059a039c0', '1511795409834-ef04bbd61622', '1527529482837-4698179dc6ce'];
  bar     TEXT[] := ARRAY['1485872299829-c673f5194813', '1514933651103-005eec06c04b', '1519671482749-fd09be7ccebf', '1610890716171-6b1bb98ffd09'];
  demo    UUID[];
BEGIN
  SELECT array_agg(id) INTO demo FROM public.schools WHERE email_domains[1] LIKE '%.plav-demo.fr';
  IF demo IS NULL THEN RAISE EXCEPTION 'Aucune école de démo : lance d''abord seed_demo.sql.'; END IF;

  -- Couvertures : d'après le titre, sinon d'après le thème de l'association.
  WITH x AS (
    SELECT id, CASE
      WHEN title ~* 'gala|blanche|bal masqué' THEN gala
      WHEN title ~* 'bar à jeux|pub quiz|afterwork|apéro' THEN bar
      WHEN title ~* 'concert|électro|disco|silent|karaoké' THEN concert
      WHEN title ~* 'pétanque' THEN sport
      WHEN association ~* 'sound' THEN concert
      WHEN association ~* 'sport' THEN sport
      WHEN association ~* 'atelier' THEN art
      WHEN association ~* 'gaming' THEN gaming
      ELSE party
    END AS pool
    FROM public.events WHERE school_id = ANY (demo))
  UPDATE public.events e
  SET cover_image_url = 'https://images.unsplash.com/photo-'
    || x.pool[1 + floor(random() * array_length(x.pool, 1))::int]
    || '?auto=format&fit=crop&w=1200&h=675&q=80'
  FROM x WHERE x.id = e.id;

  -- Bannières des associations (format 3:1).
  UPDATE public.associations a
  SET cover_path = 'https://images.unsplash.com/photo-' || (CASE a.name
    WHEN 'BDE Sup''Rhône' THEN '1505236858219-8359eb29e329'
    WHEN 'Rhône Sound System' THEN '1470225620780-dba8ba36b745'
    WHEN 'BDE Garonne' THEN '1492684223066-81342ee5ff30'
    WHEN 'Garonne Sports Club' THEN '1517649763962-0c623066013b'
    WHEN 'BDE Atlantique' THEN '1514525253161-7a46d19cd819'
    WHEN 'Atelier Nocturne' THEN '1531913764164-f85c52e6e654'
    WHEN 'BDE Vauban' THEN '1429962714451-bb934ecdc4ec'
    WHEN 'Vauban Gaming League' THEN '1542751371-adc38448a05e'
    END) || '?auto=format&fit=crop&w=1500&h=500&q=80'
  WHERE a.school_id = ANY (demo);
END;
$$;

SELECT e.title, e.association, e.cover_image_url FROM public.events e
JOIN public.schools s ON s.id = e.school_id
WHERE s.email_domains[1] LIKE '%.plav-demo.fr'
ORDER BY e.starts_at DESC LIMIT 10;
