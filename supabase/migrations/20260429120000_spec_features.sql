
-- ===== GestEvent Spec v1.0 — schema additions =====

-- 1. Add 'pending' to registration_status (before 'registered')
ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'registered';

-- 2. Add expires_at to registrations (for 15-min reservation timer)
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. Add status and cover image to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'closed')),
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 4. Create event-covers storage bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-covers',
  'event-covers',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: organizers can upload, public can view
CREATE POLICY IF NOT EXISTS "Authenticated upload event covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers');

CREATE POLICY IF NOT EXISTS "Public view event covers"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'event-covers');

CREATE POLICY IF NOT EXISTS "Owners delete event covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-covers' AND auth.uid()::text = owner);

-- 5. Update events RLS: non-organizers only see published events
DROP POLICY IF EXISTS "Events viewable by authenticated" ON public.events;
CREATE POLICY "Events viewable by authenticated" ON public.events
  FOR SELECT TO authenticated USING (
    status = 'published'
    OR auth.uid() = organizer_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- 6. Helper to clean up expired pending reservations (call from client or cron)
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.registrations
  WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now();
$$;
