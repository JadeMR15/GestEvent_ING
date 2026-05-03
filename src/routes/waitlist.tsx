import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Trash2, Users, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/waitlist")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <WaitlistPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Waitlist — GestEvent" }] }),
});

function WaitlistPage() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("events")
      .select("*, registrations(id,user_id,status,registered_at)")
      .order("starts_at", { ascending: true });
    if (role !== "admin") q = q.eq("organizer_id", user.id);
    const { data } = await q;
    const evs = data ?? [];
    const allUserIds = Array.from(new Set(evs.flatMap((e: any) => (e.registrations ?? []).map((r: any) => r.user_id))));
    let profMap: Record<string, string> = {};
    if (allUserIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", allUserIds);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
    }
    const enriched = evs.map((e: any) => ({
      ...e,
      registrations: (e.registrations ?? []).map((r: any) => ({ ...r, full_name: profMap[r.user_id] })),
    }));
    setEvents(enriched);
    setLoading(false);
  }, [user, role]);

  useEffect(() => { load(); }, [load]);

  async function promote(regId: string, eventId: string, capacity: number, registrations: any[]) {
    const active = registrations.filter((r) => r.status === "registered" || r.status === "attended");
    if (active.length >= capacity) {
      toast.error("Event is full — increase capacity first.");
      return;
    }
    const { error } = await supabase.from("registrations").update({ status: "registered" }).eq("id", regId);
    if (error) { toast.error(error.message); return; }
    toast.success("Promoted from waitlist!");
    load();
  }

  async function remove(regId: string) {
    const { error } = await supabase.from("registrations").delete().eq("id", regId);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const eventsWithWaitlist = events.filter((e) => (e.registrations ?? []).some((r: any) => r.status === "waitlisted"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Waitlist management</h1>
        <p className="text-muted-foreground">Promote waitlisted attendees as spots open up.</p>
      </div>

      {eventsWithWaitlist.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-10 w-10 opacity-50" />
            No events have a waitlist right now.
          </CardContent>
        </Card>
      ) : (
        eventsWithWaitlist.map((e) => {
          const waitlist = (e.registrations ?? []).filter((r: any) => r.status === "waitlisted");
          const active = (e.registrations ?? []).filter((r: any) => r.status === "registered" || r.status === "attended");
          return (
            <Card key={e.id} className="border-2 shadow-elegant">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span>{e.title}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {format(new Date(e.starts_at), "PPP")} · {active.length}/{e.capacity} active · {waitlist.length} waiting
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {waitlist.map((r: any, idx: number) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{r.full_name || "Participant"}</p>
                          <p className="text-xs text-muted-foreground">Joined {format(new Date(r.registered_at), "PPp")}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => promote(r.id, e.id, e.capacity, e.registrations)} className="bg-gradient-primary">
                          <ArrowUpCircle className="mr-1 h-4 w-4" />Promote
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
