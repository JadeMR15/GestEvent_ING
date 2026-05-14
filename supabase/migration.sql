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

-- RPC : récupérer les emails des inscrits d'un événement (accès à auth.users via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_participant_emails(_event_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.user_id,
    u.email::TEXT,
    COALESCE(p.full_name, '')
  FROM public.registrations r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.event_id = _event_id
    AND r.status IN ('registered', 'attended');
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_participant_emails(UUID) TO authenticated;

-- Colonnes pour les places achetées pour des amis (guest) sur registrations
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- Autoriser plusieurs inscriptions par utilisateur (places pour amis)
-- L'ancienne contrainte UNIQUE(event_id, user_id) bloque les places guest
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_event_id_user_id_key;
-- Index partiel : une seule inscription personnelle par user/event, mais plusieurs places guest autorisées
CREATE UNIQUE INDEX IF NOT EXISTS registrations_personal_unique
  ON public.registrations(event_id, user_id)
  WHERE guest_email IS NULL;

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

-- ============================================================
-- Tarifs multiples par événement
-- ============================================================

-- Table ticket_types
CREATE TABLE IF NOT EXISTS public.ticket_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  capacity    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_types_select" ON public.ticket_types FOR SELECT USING (true);
CREATE POLICY "ticket_types_insert" ON public.ticket_types FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "ticket_types_update" ON public.ticket_types FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "ticket_types_delete" ON public.ticket_types FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- Colonne ticket_type_id sur registrations
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS ticket_type_id UUID REFERENCES public.ticket_types(id) ON DELETE SET NULL;

-- ============================================================
-- Statut "private" — événements réservés à une école
-- ============================================================

-- Mettre à jour la contrainte CHECK pour ajouter 'private'
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft', 'published', 'closed', 'private'));

-- Mise à jour de la politique RLS pour les événements (utilisateurs authentifiés)
DROP POLICY IF EXISTS "Events viewable by authenticated" ON public.events;
CREATE POLICY "Events viewable by authenticated" ON public.events
  FOR SELECT TO authenticated USING (
    status IN ('published', 'closed')
    OR (
      status = 'private' AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND lower(trim(p.school)) = lower(trim(events.school))
          AND p.school != ''
      )
    )
    OR auth.uid() = organizer_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- Recréer get_public_events pour inclure les événements privés accessibles
CREATE OR REPLACE FUNCTION public.get_public_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
  FROM public.events e
  WHERE
    e.status IN ('published', 'closed')
    OR (
      e.status = 'private'
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND lower(trim(p.school)) = lower(trim(e.school))
          AND p.school != ''
      )
    )
    OR (auth.uid() IS NOT NULL AND e.organizer_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
  ORDER BY e.starts_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_events() TO authenticated, anon;

-- ============================================================
-- Ville + coordonnées géographiques sur les événements
-- ============================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ============================================================
-- Galerie médias (photos & vidéos) par événement
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'image' CHECK (type IN ('image', 'video')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  caption     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_media_select" ON public.event_media;
CREATE POLICY "event_media_select" ON public.event_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "event_media_insert" ON public.event_media;
CREATE POLICY "event_media_insert" ON public.event_media FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "event_media_update" ON public.event_media;
CREATE POLICY "event_media_update" ON public.event_media FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "event_media_delete" ON public.event_media;
CREATE POLICY "event_media_delete" ON public.event_media FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- ============================================================
-- Table payouts (demandes de virement)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  iban         TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts_select" ON public.payouts;
CREATE POLICY "payouts_select" ON public.payouts FOR SELECT TO authenticated USING (
  organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "payouts_insert" ON public.payouts;
CREATE POLICY "payouts_insert" ON public.payouts FOR INSERT TO authenticated WITH CHECK (
  organizer_id = auth.uid()
);

DROP POLICY IF EXISTS "payouts_update" ON public.payouts;
CREATE POLICY "payouts_update" ON public.payouts FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
);

-- ============================================================
-- Document requis par les organisateurs
-- ============================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS required_document TEXT NOT NULL DEFAULT '';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS document_url TEXT;

-- Nombre maximum de places par personne (0 = illimité)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS max_per_person INTEGER NOT NULL DEFAULT 0;
