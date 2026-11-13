-- ============================================================
-- Espace « Paramètres » : photo de profil + infos personnelles (2026-11-09)
-- À lancer dans Supabase > SQL Editor. Peut être relancé sans risque.
-- ============================================================

-- 1. Colonnes du profil -------------------------------------------------------
-- avatar_path : chemin de la photo dans le stockage "avatars" (jamais une URL libre,
-- pour qu'on ne puisse pas afficher une image venant d'un autre site).
-- birth_date / gender : demandés à l'inscription, utilisés par la page Analyses.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date  DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender      TEXT;

-- La photo doit être rangée dans le dossier de son propriétaire.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_path_own;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_path_own
  CHECK (avatar_path IS NULL OR (avatar_path LIKE id::text || '/%' AND length(avatar_path) <= 200));

-- 2. Récupérer date de naissance et genre déjà saisis à l'inscription ----------
UPDATE public.profiles p
SET birth_date = (u.raw_user_meta_data->>'birth_date')::date
FROM auth.users u
WHERE u.id = p.id
  AND p.birth_date IS NULL
  AND u.raw_user_meta_data->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$';

UPDATE public.profiles p
SET gender = u.raw_user_meta_data->>'gender'
FROM auth.users u
WHERE u.id = p.id
  AND p.gender IS NULL
  AND u.raw_user_meta_data->>'gender' IN ('homme', 'femme', 'autre', 'non_renseigne');

-- 3. Inscription : enregistrer aussi date de naissance et genre ----------------
-- Même fonction que fix_signup_role.sql (rôle limité à participant/organizer),
-- avec en plus birth_date et gender.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role   public.app_role;
  _birth  TEXT := NEW.raw_user_meta_data->>'birth_date';
  _gender TEXT := NEW.raw_user_meta_data->>'gender';
BEGIN
  INSERT INTO public.profiles (id, full_name, school, association, birth_date, gender)
  VALUES (
    NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 160),
    left(COALESCE(NEW.raw_user_meta_data->>'school', ''), 120),
    left(COALESCE(NEW.raw_user_meta_data->>'association', ''), 120),
    CASE WHEN _birth ~ '^\d{4}-\d{2}-\d{2}$' THEN _birth::date END,
    CASE WHEN _gender IN ('homme', 'femme', 'autre', 'non_renseigne') THEN _gender END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    school      = EXCLUDED.school,
    association = EXCLUDED.association,
    birth_date  = EXCLUDED.birth_date,
    gender      = EXCLUDED.gender;

  -- Seuls participant et organizer peuvent être choisis à l'inscription.
  _role := CASE NEW.raw_user_meta_data->>'role'
    WHEN 'organizer' THEN 'organizer'::public.app_role
    ELSE 'participant'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Stockage des photos de profil ---------------------------------------------
-- Public en lecture (la photo s'affiche partout), 2 Mo max, images uniquement.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Chacun ne gère que son dossier "<son id>/...".
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_select_own" ON storage.objects;
CREATE POLICY "avatars_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Contrôle ------------------------------------------------------------------
SELECT count(*) AS profils,
       count(birth_date) AS avec_date_naissance,
       count(gender)     AS avec_genre
FROM public.profiles;
