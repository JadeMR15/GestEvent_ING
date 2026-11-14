import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Heart, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/likes")({
  component: () => <ProtectedLayout><LikesPage /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Événements likés — Plav'" }] }),
});

// La table event_likes n'est pas encore dans les types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface LikedEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  city: string | null;
  cover_image_url: string | null;
}

function LikesPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<LikedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await db
        .from("event_likes")
        .select("created_at, events(id, title, starts_at, location, city, cover_image_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) console.error("event_likes:", error.message);
      // Un événement supprimé ou devenu invisible n'apparaît pas.
      setEvents(((data ?? []) as { events: LikedEvent | null }[]).map((r) => r.events).filter((e): e is LikedEvent => !!e));
      setLoading(false);
    })();
  }, [user]);

  async function unlike(id: string) {
    if (!user) return;
    const before = events;
    setEvents((list) => list.filter((e) => e.id !== id));
    const { error } = await db.from("event_likes").delete().eq("event_id", id).eq("user_id", user.id);
    if (error) { setEvents(before); toast.error("Impossible de retirer ce like. Réessaie."); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Événements likés</h1>
        <p className="text-muted-foreground">
          Les événements que tu as likés, du plus récent au plus ancien. Clique sur le cœur pour retirer un like.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : events.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Heart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Tu n'as encore liké aucun événement.</p>
            <p className="mt-1 text-sm text-muted-foreground">Clique sur le cœur d'un événement pour le retrouver ici.</p>
            <Button asChild className="mt-4 bg-gradient-primary shadow-glow">
              <Link to="/events">Découvrir les événements</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const past = new Date(e.starts_at) < new Date();
            return (
              <Card key={e.id} className={`overflow-hidden border-2 ${past ? "opacity-60" : ""}`}>
                <CardContent className="flex items-center gap-4 p-4">
                  {e.cover_image_url
                    ? <img src={e.cover_image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                    : <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gradient-vibrant" />}
                  <Link to="/events/$eventId" params={{ eventId: e.id }} className="min-w-0 flex-1 hover:text-primary">
                    <p className="truncate text-lg font-semibold">{e.title}</p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4 flex-shrink-0" />
                      {format(new Date(e.starts_at), "PPP 'à' p", { locale: fr })}{past && " · passé"}
                    </p>
                    {(e.city || e.location) && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{e.city ? `${e.city}${e.location ? ` — ${e.location}` : ""}` : e.location}</span>
                      </p>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => unlike(e.id)}
                    aria-label={`Retirer le like de ${e.title}`}
                    title="Retirer mon like"
                    className="rounded-full p-2.5 text-[#6B1A2F] hover:bg-[#6B1A2F]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B1A2F]/40"
                  >
                    <Heart className="h-5 w-5 fill-current" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
