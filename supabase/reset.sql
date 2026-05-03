-- ============================================================
-- GestEvent — RESET COMPLET (drop + recreate)
-- ⚠️  Efface toutes les données existantes !
-- ============================================================

-- Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS events_updated_at ON public.events;

-- Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.release_expired_reservations() CASCADE;

-- Drop tables
DROP TABLE IF EXISTS public.registrations CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop types
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.registration_status CASCADE;

-- ============================================================
-- RECREATION
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'participant', 'volunteer');
CREATE TYPE public.registration_status AS ENUM ('pending', 'registered', 'waitlisted', 'attended', 'cancelled');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 50,
  price NUMERIC NOT NULL DEFAULT 0,
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'closed')),
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.registration_status NOT NULL DEFAULT 'registered',
  qr_code TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-create profile + rôle à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  BEGIN
    _role := (NEW.raw_user_meta_data->>'role')::public.app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    _role := 'participant';
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(_role, 'participant'));

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- RLS Policies — Profiles
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- RLS Policies — User roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies — Events
CREATE POLICY "Events viewable by authenticated" ON public.events FOR SELECT TO authenticated USING (
  status = 'published' OR auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Organizers create events" ON public.events FOR INSERT TO authenticated WITH CHECK (
  (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin')) AND auth.uid() = organizer_id
);
CREATE POLICY "Organizers update own events" ON public.events FOR UPDATE TO authenticated USING (
  auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Organizers delete own events" ON public.events FOR DELETE TO authenticated USING (
  auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin')
);

-- RLS Policies — Registrations
CREATE POLICY "Users view own registrations" ON public.registrations FOR SELECT TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Users register themselves" ON public.registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own or organizer marks attendance" ON public.registrations FOR UPDATE TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Users delete own registration" ON public.registrations FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Storage bucket event-covers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-covers', 'event-covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload event covers" ON storage.objects;
CREATE POLICY "Authenticated upload event covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers');

DROP POLICY IF EXISTS "Public view event covers" ON storage.objects;
CREATE POLICY "Public view event covers" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'event-covers');

DROP POLICY IF EXISTS "Owners delete event covers" ON storage.objects;
CREATE POLICY "Owners delete event covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-covers' AND auth.uid()::text = owner_id);

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.registrations WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now();
$$;
