import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cocotte, type CocotteState } from "@/components/mascot/Cocotte";
import { isPastEvent } from "@/lib/event-dates";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { APPROVAL_BADGE, APPROVAL_LABEL, type ApprovalStatus } from "@/lib/schools";
import { Calendar, CheckCircle2, CirclePlus, Clock, Ticket, Bell, Download, Users, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { invokeEmail } from "@/lib/emails";
import JSZip from "jszip";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedLayout>
      <DashboardPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Dashboard — Plav'" }] }),
});

interface Stats {
  total: number;
  upcoming: number;
  revenue: number;
}

interface NextEvent {
  event: any;
  /** Participant : statut de son inscription. */
  status?: string;
  /** Organisateur : nombre d'inscrits confirmés. */
  confirmed?: number;
}

function DashboardPage() {
  const { role } = useAuth();
  // L'admin Plav' n'organise pas de soirées : il a son propre espace.
  if (role === "admin") return <Navigate to="/admin" replace />;
  return <EventsDashboard />;
}

function EventsDashboard() {
  const { user, role, fullName } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, upcoming: 0, revenue: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  // Prochain événement (calculé à partir des données déjà chargées) : celui dont parle Cocotte.
  const [next, setNext] = useState<NextEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
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
        const upcomingRegs = list
          .filter((r: any) => r.events && (r.status === "registered" || r.status === "pending") && !isPastEvent(r.events.starts_at))
          .sort((a: any, b: any) => new Date(a.events.starts_at).getTime() - new Date(b.events.starts_at).getTime());
        setNext(upcomingRegs[0] ? { event: upcomingRegs[0].events, status: upcomingRegs[0].status } : null);
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
        const upcomingEvents = list
          .filter((e: any) => e.status !== "cancelled" && !isPastEvent(e.starts_at))
          .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        const ev = upcomingEvents[0];
        setNext(ev ? {
          event: ev,
          confirmed: (ev.registrations ?? []).filter((r: any) => r.status === "registered" || r.status === "attended").length,
        } : null);
      }
      setLoaded(true);
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
      const data = await invokeEmail("send-event-emails", { type: "reminder", event_id: ev.id });
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
    zip.file(`Plav_global_${dateStr}.csv`, toCSV([headerGlobal, ...globalRows]));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Plav_export_${dateStr}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    toast.success(`Export téléchargé — ${events.length} CSV + 1 global.`);
  }

  const cards = [
    {
      label: role === "participant" ? "Mes inscriptions" : "Événements",
      value: stats.total,
      icon: Calendar,
      color: "from-bordeaux-500 to-bordeaux-800",
      format: "number",
    },
    {
      label: "À venir",
      value: stats.upcoming,
      icon: Clock,
      color: "from-jaune-300 to-jaune-400",
      format: "number",
    },
    ...(role !== "participant" ? [{
      label: "Fonds récoltés",
      value: stats.revenue,
      icon: CheckCircle2,
      color: "from-bordeaux-500 to-bordeaux-600",
      format: "currency" as const,
    }] : []),
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="app-caps text-gris-chaud">{format(new Date(), "EEEE d MMMM", { locale: fr })}</p>
          <h1 className="not-italic mt-1">Dashboard</h1>
          <p className="text-muted-foreground">Vue d'ensemble de votre activité.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {role === "participant" && (
            <Button asChild variant="outline" className="bg-white/70 backdrop-blur">
              <Link to="/my-tickets"><Ticket className="mr-2 h-4 w-4" />Mes billets</Link>
            </Button>
          )}
          {(role === "organizer" || role === "admin") && (
            <>
              <Button variant="outline" className="bg-white/70 backdrop-blur" onClick={sendReminders24h} disabled={sendingReminders}>
                <Bell className="mr-2 h-4 w-4" />
                {sendingReminders ? "Envoi…" : "Rappels 24h"}
              </Button>
              <Button variant="outline" className="bg-white/70 backdrop-blur" onClick={exportCSV} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Export…" : "Exporter CSV"}
              </Button>
              <Button asChild className="bg-gradient-primary shadow-glow">
                <Link to="/events/new"><CirclePlus className="mr-2 h-4 w-4" />Nouvel événement</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cocotte annonce le prochain événement */}
      {loaded
        ? <NextEventHero next={next} organizer={role !== "participant"} firstName={(fullName ?? "").trim().split(/\s+/)[0]} />
        : <div className="h-[340px] animate-pulse rounded-[28px] bg-bordeaux-900/15 md:rounded-[40px]" />}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.label} className={`app-glass db-rise ${i === 0 ? "db-rise-3" : "db-rise-4"} rounded-3xl p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="app-caps text-gris-chaud">{c.label}</p>
                <p className="mt-3 font-display text-5xl leading-none tracking-tight text-encre">
                  {c.format === "currency"
                    ? `${c.value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
                    : c.value}
                </p>
              </div>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${c.color} shadow-glow`}>
                <c.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent items */}
      <section className="app-glass rounded-3xl p-5 md:p-7">
        <h2 className="t-titre-3 text-bordeaux-600">
          {role === "participant" ? "Mes inscriptions récentes" : "Événements récents"}
        </h2>
        {recent.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {role === "participant" ? "Aucune inscription pour l'instant." : "Aucun événement pour l'instant."}{" "}
            <Link to="/events" className="font-medium text-primary hover:underline">
              {role === "participant" ? "Découvrir les événements" : "Créer un événement"}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recent.map((item: any) => {
              const ev = role === "participant" ? item.events : item;
              if (!ev) return null;
              const allRegs = item.registrations ?? [];
              const confirmed = allRegs.filter((r: any) => r.status === "registered" || r.status === "attended").length;
              const d = new Date(ev.starts_at);
              return (
                <li key={item.id}>
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: ev.id }}
                    className="group flex items-center gap-4 rounded-2xl p-2.5 transition-colors hover:bg-white/80"
                  >
                    <span className="db-date" aria-hidden="true">
                      <span className="font-display text-xl leading-none">{format(d, "d")}</span>
                      <span className="app-caps mt-1 text-[10px]">{format(d, "MMM", { locale: fr }).replace(".", "")}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-encre group-hover:text-primary">{ev.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {format(d, "PPP", { locale: fr })} · {ev.location || "En ligne"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
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
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />{confirmed} inscrits
                          {ev.status === "draft" && <Badge variant="secondary" className="text-xs">Brouillon</Badge>}
                          {(ev.approval_status === "pending" || ev.approval_status === "rejected") && (
                            <Badge className={`text-xs ${APPROVAL_BADGE[ev.approval_status as ApprovalStatus]}`}>{APPROVAL_LABEL[ev.approval_status as ApprovalStatus]}</Badge>
                          )}
                        </span>
                      )}
                      <ArrowRight className="hidden h-4 w-4 text-gris-chaud transition-transform group-hover:translate-x-0.5 sm:block" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** « Dans 3 jours », « C'est demain ! »… */
function countdown(startsAt: string): string {
  const d = new Date(startsAt);
  if (d.getTime() <= Date.now()) return "C'est en cours !";
  if (isToday(d)) return d.getHours() >= 17 ? "C'est ce soir !" : "C'est aujourd'hui !";
  if (isTomorrow(d)) return "C'est demain !";
  return "Dans " + formatDistanceToNowStrict(d, { locale: fr, unit: "day", roundingMethod: "ceil" });
}

/**
 * Grand cadre bordeaux (comme sur l'accueil) : Cocotte apparaît, salue, puis annonce
 * le prochain événement dans une bulle — ou dit qu'il n'y en a pas encore.
 */
function NextEventHero({ next, organizer, firstName }: { next: NextEvent | null; organizer: boolean; firstName: string }) {
  const [pose, setPose] = useState<CocotteState>("apparition");
  useEffect(() => {
    const t1 = setTimeout(() => setPose("coucou"), 1000);
    const t2 = setTimeout(() => setPose("repos"), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const ev = next?.event;
  const hello = firstName ? `Coucou ${firstName} !` : "Coucou !";
  const cta = "inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold transition-transform hover:-translate-y-0.5";

  return (
    <section className="db-hero">
      <div aria-hidden="true" className="db-glow db-glow-1" />
      <div aria-hidden="true" className="db-glow db-glow-2" />

      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-6 p-6 md:gap-x-10 md:p-10 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:p-12">
        {/* Cocotte, sur son disque de lumière */}
        <div className="db-stage col-start-1 row-start-1 w-20 self-center md:row-span-2 md:w-40 lg:w-48">
          <div className="db-cocotte relative z-[1]">
            <Cocotte state={pose} className="h-auto w-full drop-shadow-[0_14px_24px_rgba(66,17,30,0.45)]" />
          </div>
        </div>

        {/* Bulle */}
        <div className="col-start-2 row-start-1 min-w-0 self-center md:self-end">
          <div className="db-bubble inline-block max-w-xl px-4 py-3 md:px-6 md:py-4">
            <p className="font-semibold text-bordeaux-600">{hello}</p>
            <p className="mt-0.5 text-sm text-encre/80 md:text-base">
              {ev
                ? "Ton prochain event, c'est…"
                : (organizer
                  ? "Aucun événement prévu pour l'instant. On en crée un ?"
                  : "Tu n'as pas de prochain événement pour l'instant… On t'en trouve un ?")}
            </p>
          </div>
        </div>

        {/* Infos du prochain événement */}
        <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-2 md:self-start">
          {ev ? (
            <>
              <div className="db-rise db-rise-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-jaune-300 px-3 py-1 text-sm font-semibold text-bordeaux-800">
                  <Sparkles className="h-3.5 w-3.5" />{countdown(ev.starts_at)}
                </span>
                <h2 className="mt-3 break-words font-display text-4xl leading-[1.05] tracking-tight text-blanc md:text-5xl">{ev.title}</h2>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-blanc/80">
                  <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" />
                    {format(new Date(ev.starts_at), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
                  </span>
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{ev.location || "En ligne"}</span>
                  {organizer && (
                    <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />
                      {next?.confirmed ?? 0}{ev.capacity > 0 ? ` / ${ev.capacity}` : ""} inscrits
                    </span>
                  )}
                </div>
              </div>
              <div className="db-rise db-rise-2 mt-7 flex flex-wrap items-center gap-3">
                <Link to="/events/$eventId" params={{ eventId: ev.id }} className={`${cta} bg-jaune-300 text-bordeaux-800`}>
                  {organizer ? "Gérer l'événement" : "Voir mon billet"}<ArrowRight className="h-4 w-4" />
                </Link>
                {!organizer && next?.status === "pending" && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-blanc/80">Inscription en attente</span>
                )}
              </div>
            </>
          ) : (
            <div className="db-rise db-rise-1">
              <Link to={organizer ? "/events/new" : "/events"} className={`${cta} bg-jaune-300 text-bordeaux-800`}>
                {organizer ? <><CirclePlus className="h-4 w-4" />Créer un événement</> : <>Découvrir les soirées<ArrowRight className="h-4 w-4" /></>}
              </Link>
            </div>
          )}
        </div>

        {/* Visuel de l'événement */}
        {ev?.cover_image_url && (
          <Link to="/events/$eventId" params={{ eventId: ev.id }} className="db-rise db-rise-2 hidden lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:block" aria-label={ev.title}>
            <img src={ev.cover_image_url} alt="" className="db-cover h-56 w-72 object-cover" />
          </Link>
        )}
      </div>
    </section>
  );
}
