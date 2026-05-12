-- ============================================================
-- GestEvent — Migrations incrémentales (base existante)
-- À lancer dans Supabase SQL Editor à la place de setup.sql
-- setup.sql = installation fraîche uniquement (recrée tout)
-- ============================================================

-- Colonne price sur events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Colonnes école / association sur profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS association TEXT NOT NULL DEFAULT '';

-- Colonnes école / association sur events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS association TEXT NOT NULL DEFAULT '';

-- Mise à jour du trigger handle_new_user pour stocker school et association
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, school, association)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'school', ''),
    COALESCE(NEW.raw_user_meta_data->>'association', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    school    = EXCLUDED.school,
    association = EXCLUDED.association;

  BEGIN
    _role := (NEW.raw_user_meta_data->>'role')::public.app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    _role := 'participant';
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(_role, 'participant'))
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
