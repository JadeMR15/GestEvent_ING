import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Users, CheckCircle2, PlusCircle, Clock, Download, Ticket, Bell } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedLayout>
      <DashboardPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Dashboard — GuestEvent" }] }),
});

interface Stats {
  total: number;
  upcoming: number;
  registrations: number;
  attended: number;
}

function DashboardPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, upcoming: 0, registrations: 0, attended: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (role === "participant") {
        const { data: regs } = await supabase
          .from("registrations")
          .select("*, events(*)")
          .eq("user_id", user.id);
        const list = regs ?? [];
        setStats({
          total: list.length,
          upcoming: list.filter((r) => r.events && new Date(r.events.starts_at) > new Date()).length,
          registrations: list.filter((r) => r.status === "registered" || r.status === "waitlisted").length,
          attended: list.filter((r) => r.status === "attended").length,
        });
        setRecent(list.slice(0, 5));
      } else {
        const { data: events } = await supabase
          .from("events")
          .select("*, registrations(id,status)")
          .eq("organizer_id", user.id)
          .order("starts_at", { ascending: false });
        const list = events ?? [];
        const allRegs = list.flatMap((e: any) => e.registrations ?? []);
        setStats({
          total: list.length,
          upcoming: list.filter((e) => new Date(e.starts_at) > new Date()).length,
          registrations: allRegs.filter((r: any) => r.status === "registered" || r.status === "pending").length,
          attended: allRegs.filter((r: any) => r.status === "attended").length,
        });
        setRecent(list.slice(0, 5));
      }
    })();
  }, [user, role]);

  async function sendReminders24h() {
    if (!user) return;
    setSendingReminders(true);
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data: events } = await supabase
      .from("events")
      .select("id, title")
      .eq("organizer_id", user.id)
      .eq("status", "published")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", in24h.toISOString());

    if (!events?.length) {
      setSendingReminders(false);
      toast.info("Aucun événement dans les prochaines 24h.");
      return;
    }

    let totalSent = 0;
    for (const ev of events) {
      const res = await fetch(
        "https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-event-emails",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "reminder", event_id: ev.id }) }
      );
      const data = await res.json().catch(() => ({}));
      totalSent += data.sent ?? 0;
    }
    setSendingReminders(false);
    toast.success(`Rappels envoyés à ${totalSent} participant(s) pour ${events.length} événement(s).`);
  }

  async function exportCSV() {
    if (!user) return;
    setExporting(true);

    const { data: events } = await supabase
      .from("events")
      .select("id,title")
      .eq("organizer_id", user.id);

    if (!events?.length) {
      setExporting(false);
      return;
    }

    const eventIds = events.map((e) => e.id);
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, events(title,starts_at,location)")
      .in("event_id", eventIds)
      .order("registered_at", { ascending: true });

    const regIds = (regs ?? []).map((r) => r.user_id);
    let profMap: Record<string, string> = {};
    if (regIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", regIds);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
    }

    const header = ["Événement", "Date", "Lieu", "Participant", "Statut", "QR Code", "Date inscription", "Scanné le"];
    const rows = (regs ?? []).map((r) => [
      r.events?.title ?? "",
      r.events?.starts_at ? format(new Date(r.events.starts_at), "yyyy-MM-dd HH:mm") : "",
      r.events?.location ?? "",
      profMap[r.user_id] ?? r.user_id,
      r.status,
      r.qr_code,
      r.registered_at ? format(new Date(r.registered_at), "yyyy-MM-dd HH:mm") : "",
      r.attended_at ? format(new Date(r.attended_at), "yyyy-MM-dd HH:mm") : "",
    ]);

    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuestEvent_participants_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  const cards = [
    {
      label: role === "participant" ? "Mes inscriptions" : "Événements",
      value: stats.total,
      icon: CalendarDays,
      color: "from-violet-500 to-fuchsia-500",
    },
    { label: "À venir", value: stats.upcoming, icon: Clock, color: "from-cyan-500 to-blue-500" },
    {
      label: role === "participant" ? "Actives" : "Inscrits",
      value: stats.registrations,
      icon: Users,
      color: "from-pink-500 to-rose-500",
    },
    { label: "Présences", value: stats.attended, icon: CheckCircle2, color: "from-emerald-500 to-teal-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Vue d'ensemble de votre activité.</p>
        </div>
        <div className="flex gap-2">
          {role === "participant" && (
            <Button asChild variant="outline">
              <Link to="/my-tickets"><Ticket className="mr-2 h-4 w-4" />Mes billets</Link>
            </Button>
          )}
          {(role === "organizer" || role === "admin") && (
            <>
              <Button variant="outline" onClick={sendReminders24h} disabled={sendingReminders}>
                <Bell className="mr-2 h-4 w-4" />
                {sendingReminders ? "Envoi…" : "Rappels 24h"}
              </Button>
              <Button variant="outline" onClick={exportCSV} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Export…" : "Export CSV"}
              </Button>
              <Button asChild className="bg-gradient-primary shadow-glow">
                <Link to="/events/new"><PlusCircle className="mr-2 h-4 w-4" />Nouvel événement</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="overflow-hidden border-2 shadow-elegant">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="mt-1 text-3xl font-bold">{c.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} shadow-glow`}>
                  <c.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent items */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle>
            {role === "participant" ? "Mes inscriptions récentes" : "Événements récents"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {role === "participant" ? "Aucune inscription pour l'instant." : "Aucun événement pour l'instant."}{" "}
              <Link to="/events" className="font-medium text-primary hover:underline">
                {role === "participant" ? "Découvrir les événements" : "Créer un événement"}
              </Link>
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((item: any) => {
                const ev = role === "participant" ? item.events : item;
                if (!ev) return null;
                const allRegs = item.registrations ?? [];
                const confirmed = allRegs.filter((r: any) => r.status === "registered" || r.status === "attended").length;
                const waitlisted = allRegs.filter((r: any) => r.status === "waitlisted").length;

                return (
                  <li key={item.id} className="flex items-center justify-between py-3">
                    <div>
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: ev.id }}
                        className="font-medium hover:text-primary"
                      >
                        {ev.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ev.starts_at), "PPP")} · {ev.location || "En ligne"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {role === "participant" ? (
                        <Badge
                          variant="secondary"
                          className={
                            item.status === "registered" ? "bg-emerald-100 text-emerald-700" :
                            item.status === "attended" ? "bg-violet-100 text-violet-700" :
                            item.status === "pending" ? "bg-orange-100 text-orange-700" :
                            item.status === "waitlisted" ? "bg-blue-100 text-blue-700" :
                            ""
                          }
                        >
                          {item.status === "registered" ? "Confirmé" :
                           item.status === "attended" ? "Présent" :
                           item.status === "pending" ? "En attente" :
                           item.status === "waitlisted" ? "Liste d'attente" :
                           item.status}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />{confirmed} inscrits
                          {waitlisted > 0 && <span>· {waitlisted} en attente</span>}
                          {ev.status === "draft" && <Badge variant="secondary" className="text-[10px]">Brouillon</Badge>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
