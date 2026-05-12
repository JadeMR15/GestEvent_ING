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

-- Table volunteers (bénévoles sans compte)
CREATE TABLE IF NOT EXISTS public.volunteers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Volunteers readable by anyone" ON public.volunteers;
CREATE POLICY "Volunteers readable by anyone" ON public.volunteers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organizers manage volunteers" ON public.volunteers;
CREATE POLICY "Organizers manage volunteers" ON public.volunteers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- RPC : check-in par bénévole (sans auth, via token)
CREATE OR REPLACE FUNCTION public.volunteer_checkin(_token UUID, _qr_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event_id UUID;
  _reg      RECORD;
  _name     TEXT;
BEGIN
  -- Valider le token
  SELECT event_id INTO _event_id FROM public.volunteers WHERE token = _token;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Token invalide');
  END IF;

  -- Trouver la registration
  SELECT r.*, e.title AS event_title
  INTO _reg
  FROM public.registrations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.qr_code = _qr_code AND r.event_id = _event_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'QR invalide pour cet événement');
  END IF;

  IF _reg.status = 'attended' THEN
    SELECT full_name INTO _name FROM public.profiles WHERE id = _reg.user_id;
    RETURN json_build_object('ok', true, 'already', true, 'name', COALESCE(_name, 'Participant'), 'event', _reg.event_title);
  END IF;

  IF _reg.status != 'registered' THEN
    RETURN json_build_object('ok', false, 'error', 'Billet non valide (statut : ' || _reg.status || ')');
  END IF;

  -- Marquer présent
  UPDATE public.registrations SET status = 'attended', attended_at = now() WHERE id = _reg.id;
  SELECT full_name INTO _name FROM public.profiles WHERE id = _reg.user_id;
  RETURN json_build_object('ok', true, 'already', false, 'name', COALESCE(_name, 'Participant'), 'event', _reg.event_title);
END;
$$;
GRANT EXECUTE ON FUNCTION public.volunteer_checkin(UUID, TEXT) TO anon, authenticated;

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
