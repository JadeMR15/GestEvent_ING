-- ============================================================
-- Correctif sécurité inscription (2026-11-09)
-- À lancer dans Supabase > SQL Editor
--
-- Avant : le rôle envoyé par le navigateur était accepté tel quel,
-- donc n'importe qui pouvait s'inscrire en "admin" ou "volunteer".
-- Après : seuls "participant" et "organizer" sont possibles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, school, association)
  VALUES (
    NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 160),
    left(COALESCE(NEW.raw_user_meta_data->>'school', ''), 120),
    left(COALESCE(NEW.raw_user_meta_data->>'association', ''), 120)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    school      = EXCLUDED.school,
    association = EXCLUDED.association;

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

-- ------------------------------------------------------------
-- Vérification : comptes admin / volunteer existants.
-- Chaque ligne doit correspondre à quelqu'un que vous connaissez.
-- Un compte inconnu a pu profiter de la faille : retirez son rôle.
-- ------------------------------------------------------------
SELECT u.email, r.role, u.created_at
FROM public.user_roles r
JOIN auth.users u ON u.id = r.user_id
WHERE r.role IN ('admin', 'volunteer')
ORDER BY u.created_at DESC;
