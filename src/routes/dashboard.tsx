import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, PlusCircle, Clock, Ticket, Bell, Download, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import JSZip from "jszip";

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
  revenue: number;
}

function DashboardPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, upcoming: 0, revenue: 0 });
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
        const spent = list
          .filter((r: any) => r.status === "registered" || r.status === "attended")
          .reduce((acc: number, r: any) => acc + (r.events?.price ?? 0), 0);
        setStats({
          total: list.length,
          upcoming: list.filter((r: any) => r.events && new Date(r.events.starts_at) > new Date()).length,
          revenue: spent,
        });
        setRecent(list.slice(0, 5));
      } else {
        const { data: events } = await supabase
          .from("events")
          .select("*, registrations(id,status)")
          .eq("organizer_id", user.id)
          .order("starts_at", { ascending: false });
        const list = events ?? [];
        const revenue = list.reduce((acc: number, e: any) => {
          const confirmed = (e.registrations ?? []).filter((r: any) => r.status === "registered" || r.status === "attended").length;
          return acc + (e.price ?? 0) * confirmed;
        }, 0);
        setStats({
          total: list.length,
          upcoming: list.filter((e: any) => new Date(e.starts_at) > new Date()).length,
          revenue,
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
      .select("id,title,starts_at,location")
      .eq("organizer_id", user.id)
      .order("starts_at", { ascending: true });

    if (!events?.length) { setExporting(false); toast.info("Aucun événement à exporter."); return; }

    const eventIds = events.map((e) => e.id);
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, events(title,starts_at,location)")
      .in("event_id", eventIds)
      .order("registered_at", { ascending: true });

    const regIds = Array.from(new Set((regs ?? []).map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (regIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", regIds);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
    }

    const header = ["Participant", "Statut", "QR Code", "Date inscription", "Scanné le"];
    const headerGlobal = ["Événement", "Date", "Lieu", ...header];
    const dateStr = format(new Date(), "yyyy-MM-dd");

    function toCSV(rows: (string | null | undefined)[][]): string {
      return "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    }

    const zip = new JSZip();

    for (const ev of events) {
      const evRegs = (regs ?? []).filter((r) => r.event_id === ev.id);
      const rows = evRegs.map((r) => [
        profMap[r.user_id] ?? r.user_id,
        r.status === "registered" ? "Confirmé" : r.status === "attended" ? "Présent" : r.status,
        r.qr_code ?? "",
        r.registered_at ? format(new Date(r.registered_at), "yyyy-MM-dd HH:mm") : "",
        r.attended_at ? format(new Date(r.attended_at), "yyyy-MM-dd HH:mm") : "",
      ]);
      const name = ev.title.replace(/[^a-zA-Z0-9À-ɏ\s_-]/g, "").trim().slice(0, 50) || "evenement";
      zip.file(`${name}_${format(new Date(ev.starts_at), "yyyy-MM-dd")}.csv`, toCSV([header, ...rows]));
    }

    const globalRows = (regs ?? []).map((r) => [
      r.events?.title ?? "",
      r.events?.starts_at ? format(new Date(r.events.starts_at), "yyyy-MM-dd HH:mm") : "",
      r.events?.location ?? "",
      profMap[r.user_id] ?? r.user_id,
      r.status === "registered" ? "Confirmé" : r.status === "attended" ? "Présent" : r.status,
      r.qr_code ?? "",
      r.registered_at ? format(new Date(r.registered_at), "yyyy-MM-dd HH:mm") : "",
      r.attended_at ? format(new Date(r.attended_at), "yyyy-MM-dd HH:mm") : "",
    ]);
    zip.file(`GuestEvent_global_${dateStr}.csv`, toCSV([headerGlobal, ...globalRows]));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuestEvent_export_${dateStr}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    toast.success(`Export téléchargé — ${events.length} CSV + 1 global.`);
  }

  const cards = [
    {
      label: role === "participant" ? "Mes inscriptions" : "Événements",
      value: stats.total,
      icon: CalendarDays,
      color: "from-[#2D5A27] to-[#3D7A35]",
      format: "number",
    },
    {
      label: "À venir",
      value: stats.upcoming,
      icon: Clock,
      color: "from-[#2D5A27] to-[#3D7A35]",
      format: "number",
    },
    ...(role !== "participant" ? [{
      label: "Fonds récoltés",
      value: stats.revenue,
      icon: CheckCircle2,
      color: "from-[#2D5A27] to-[#3D7A35]",
      format: "currency" as const,
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight not-italic">Dashboard</h1>
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
                {exporting ? "Export…" : "Exporter CSV"}
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
                  <p className="mt-1 text-3xl font-bold">
                    {c.format === "currency"
                      ? `${c.value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
                      : c.value}
                  </p>
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
                        {format(new Date(ev.starts_at), "PPP", { locale: fr })} · {ev.location || "En ligne"}
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
                            ""
                          }
                        >
                          {item.status === "registered" ? "Confirmé" :
                           item.status === "attended" ? "Présent" :
                           item.status === "pending" ? "En attente" :
                           item.status}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />{confirmed} inscrits
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
