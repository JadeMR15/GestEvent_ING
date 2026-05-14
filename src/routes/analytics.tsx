import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Users, TrendingUp, Euro, CalendarDays, BarChart2, UserCircle, ArrowLeft } from "lucide-react";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <AnalyticsPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Analyses — GuestEvent" }] }),
});

const COLORS = ["#10b981", "#059669", "#a7f3d0", "#C87488", "#6366f1", "#f59e0b", "#888"];

function getAge(birth_date: string): number {
  const today = new Date();
  const birth = new Date(birth_date);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="border-2 shadow-elegant">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-[#d1fae5] flex items-center justify-center">
            <Icon className="h-6 w-6 text-[#059669]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function AnalyticsPage() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("global");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const evQuery = supabase.from("events").select("id, title, capacity, price, starts_at, status");
      if (role !== "admin") evQuery.eq("organizer_id", user.id);
      const { data: evs } = await evQuery.order("starts_at", { ascending: false });

      const ids = (evs ?? []).map((e) => e.id);
      let regs: any[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from("registrations")
          .select("id, event_id, user_id, status, registered_at")
          .in("event_id", ids);
        regs = data ?? [];
      }

      const userIds = [...new Set(regs.map((r) => r.user_id).filter(Boolean))];
      let profs: any[] = [];
      if (userIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, birth_date, gender, school")
          .in("id", userIds as string[]);
        profs = data ?? [];
      }

      setEvents(evs ?? []);
      setRegistrations(regs);
      setProfiles(profs);
      setLoading(false);
    })();
  }, [user, role]);

  const filteredRegs = selectedEventId === "all"
    ? registrations
    : registrations.filter((r) => r.event_id === selectedEventId);

  const filteredEvents = selectedEventId === "all"
    ? events
    : events.filter((e) => e.id === selectedEventId);

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  // ─── Stats globales ───
  const totalRegistrations = filteredRegs.filter((r) => ["registered", "attended", "pending"].includes(r.status)).length;
  const totalAttended = filteredRegs.filter((r) => r.status === "attended").length;
  const attendanceRate = totalRegistrations > 0 ? Math.round((totalAttended / totalRegistrations) * 100) : 0;
  const totalRevenue = filteredEvents.reduce((sum, ev) => {
    const n = filteredRegs.filter((r) => r.event_id === ev.id && ["registered", "attended"].includes(r.status)).length;
    return sum + n * (ev.price ?? 0);
  }, 0);

  // ─── Vue globale : graphes ───
  const regsByEvent = events.map((ev) => {
    const evRegs = registrations.filter((r) => r.event_id === ev.id);
    return {
      name: ev.title.length > 18 ? ev.title.slice(0, 18) + "…" : ev.title,
      Inscrits: evRegs.filter((r) => ["registered", "attended"].includes(r.status)).length,
      Présents: evRegs.filter((r) => r.status === "attended").length,
      Annulés: evRegs.filter((r) => r.status === "cancelled").length,
    };
  }).filter((d) => d.Inscrits + d.Annulés > 0).slice(0, 8);

  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });
  const timelineData = last30.map((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return { date: format(day, "dd/MM", { locale: fr }), Inscriptions: filteredRegs.filter((r) => r.registered_at?.startsWith(dayStr)).length };
  });

  const statusLabels: Record<string, string> = {
    registered: "Confirmé", attended: "Présent", cancelled: "Annulé",
    pending: "En attente", waitlisted: "Liste d'attente",
  };
  const statusData = Object.entries(
    filteredRegs.filter((r) => r.status !== "pending").reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([s, v]) => ({ name: statusLabels[s] ?? s, value: v }));

  const fillRateData = events.filter((ev) => ev.capacity > 0).map((ev) => {
    const n = registrations.filter((r) => r.event_id === ev.id && ["registered", "attended"].includes(r.status)).length;
    return { name: ev.title.length > 18 ? ev.title.slice(0, 18) + "…" : ev.title, "Taux (%)": Math.min(100, Math.round((n / ev.capacity) * 100)) };
  }).slice(0, 8);

  // ─── Par événement : cartes ───
  const eventCards = events.map((ev) => {
    const evRegs = registrations.filter((r) => r.event_id === ev.id);
    const inscrits = evRegs.filter((r) => ["registered", "attended"].includes(r.status)).length;
    const presents = evRegs.filter((r) => r.status === "attended").length;
    const tauxPresence = inscrits > 0 ? Math.round((presents / inscrits) * 100) : 0;
    const revenu = inscrits * (ev.price ?? 0);
    const fillRate = ev.capacity > 0 ? Math.min(100, Math.round((inscrits / ev.capacity) * 100)) : null;
    // Timeline inscriptions pour cet événement (30 jours)
    const evTimeline = last30.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      return { date: format(day, "dd/MM", { locale: fr }), count: evRegs.filter((r) => r.registered_at?.startsWith(dayStr)).length };
    });
    return { ev, inscrits, presents, tauxPresence, revenu, fillRate, evTimeline };
  });

  // ─── Démographie ───
  const attendeeProfiles = filteredRegs
    .filter((r) => ["registered", "attended"].includes(r.status))
    .map((r) => profileMap[r.user_id])
    .filter(Boolean);

  const ageGroups: Record<string, number> = { "<18": 0, "18-21": 0, "22-25": 0, "26-30": 0, ">30": 0 };
  const ageNA: number[] = [];
  attendeeProfiles.forEach((p) => {
    if (!p.birth_date) { ageNA.push(1); return; }
    const age = getAge(p.birth_date);
    if (age < 18) ageGroups["<18"]++;
    else if (age <= 21) ageGroups["18-21"]++;
    else if (age <= 25) ageGroups["22-25"]++;
    else if (age <= 30) ageGroups["26-30"]++;
    else ageGroups[">30"]++;
  });
  const ageData = [
    ...Object.entries(ageGroups).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
    ...(ageNA.length > 0 ? [{ name: "N/A", value: ageNA.length }] : []),
  ];

  const genderLabels: Record<string, string> = { homme: "Homme", femme: "Femme", autre: "Autre", non_renseigne: "Non renseigné" };
  const genderGroups: Record<string, number> = {};
  attendeeProfiles.forEach((p) => {
    const key = genderLabels[p.gender] ?? "Non renseigné";
    genderGroups[key] = (genderGroups[key] ?? 0) + 1;
  });
  const genderData = Object.entries(genderGroups).map(([name, value]) => ({ name, value }));

  const schoolGroups: Record<string, number> = {};
  attendeeProfiles.forEach((p) => { if (p.school) schoolGroups[p.school] = (schoolGroups[p.school] ?? 0) + 1; });
  const schoolData = Object.entries(schoolGroups).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value }));

  const hasDemoData = ageData.some((d) => d.name !== "N/A") || genderData.length > 0 || schoolData.length > 0;

  if (loading) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analyses</h1>
        <p className="text-muted-foreground">Visualisez les performances de vos événements.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Événements" value={filteredEvents.length} />
        <StatCard icon={Users} label="Inscrits" value={totalRegistrations} />
        <StatCard icon={TrendingUp} label="Taux de présence" value={`${attendanceRate}%`} sub={`${totalAttended} présents`} />
        <StatCard icon={Euro} label="Revenus estimés" value={`${totalRevenue} €`} />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "global") setSelectedEventId("all"); }} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global" className="gap-2"><BarChart2 className="h-4 w-4" />Vue globale</TabsTrigger>
          <TabsTrigger value="events" className="gap-2"><CalendarDays className="h-4 w-4" />Par événement</TabsTrigger>
          <TabsTrigger value="participants" className="gap-2"><UserCircle className="h-4 w-4" />Participants</TabsTrigger>
        </TabsList>

        {/* ═══════════ VUE GLOBALE ═══════════ */}
        <TabsContent value="global" className="space-y-4">
          {selectedEventId !== "all" && (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedEventId("all")}>
                <ArrowLeft className="h-4 w-4" />Tous les événements
              </Button>
              <span className="text-sm font-medium text-muted-foreground">
                {events.find((e) => e.id === selectedEventId)?.title}
              </span>
            </div>
          )}
          <Card className="border-2 shadow-elegant">
            <CardHeader><CardTitle>Inscriptions — 30 derniers jours</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Inscriptions" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-2 shadow-elegant">
              <CardHeader><CardTitle>Participants par événement</CardTitle></CardHeader>
              <CardContent>
                {regsByEvent.length === 0 ? <EmptyState message="Aucune donnée." /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={regsByEvent} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip /><Legend />
                      <Bar dataKey="Inscrits" fill="#10b981" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Présents" fill="#059669" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Annulés" fill="#C87488" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 shadow-elegant">
              <CardHeader><CardTitle>Répartition des statuts</CardTitle></CardHeader>
              <CardContent>
                {statusData.length === 0 ? <EmptyState message="Aucune donnée." /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3} labelLine={false} label={<PieLabel />}>
                        {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} inscription(s)`, n]} /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {fillRateData.length > 0 && (
            <Card className="border-2 shadow-elegant">
              <CardHeader><CardTitle>Taux de remplissage (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={fillRateData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, "Remplissage"]} />
                    <Bar dataKey="Taux (%)" radius={[4, 4, 0, 0]}>
                      {fillRateData.map((e, i) => <Cell key={i} fill={e["Taux (%)"] >= 90 ? "#059669" : e["Taux (%)"] >= 50 ? "#10b981" : "#a7f3d0"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ PAR ÉVÉNEMENT ═══════════ */}
        <TabsContent value="events" className="space-y-4">
          {eventCards.length === 0 ? (
            <Card className="border-2 shadow-elegant"><CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun événement.</CardContent></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventCards.map(({ ev, inscrits, presents, tauxPresence, revenu, fillRate, evTimeline }) => (
                <Card
                  key={ev.id}
                  className="border-2 shadow-elegant flex flex-col cursor-pointer transition-shadow hover:shadow-lg"
                  onClick={() => { setSelectedEventId(ev.id); setActiveTab("global"); }}
                >
                  <CardContent className="p-5 space-y-4 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold line-clamp-2 leading-snug">{ev.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(ev.starts_at), "d MMM yyyy", { locale: fr })}
                        </p>
                      </div>
                      <Badge variant={ev.status === "published" ? "default" : "secondary"} className="shrink-0 text-xs capitalize">
                        {ev.status}
                      </Badge>
                    </div>

                    {/* Mini graphe inscriptions */}
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={evTimeline}>
                        <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={1.5} dot={false} />
                        <Tooltip formatter={(v) => [`${v}`, "Inscriptions"]} labelFormatter={(l) => l} />
                      </LineChart>
                    </ResponsiveContainer>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold text-emerald-700">{inscrits}</p>
                        <p className="text-xs text-muted-foreground">Inscrits</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold text-emerald-800">{presents}</p>
                        <p className="text-xs text-muted-foreground">Présents</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold">{tauxPresence}%</p>
                        <p className="text-xs text-muted-foreground">Présence</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold">{revenu} €</p>
                        <p className="text-xs text-muted-foreground">Revenus</p>
                      </div>
                    </div>

                    {fillRate !== null && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Remplissage</span><span>{fillRate}%</span>
                        </div>
                        <Progress value={fillRate} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ PARTICIPANTS / DÉMOGRAPHIE ═══════════ */}
        <TabsContent value="participants" className="space-y-4">
          {!hasDemoData ? (
            <Card className="border-2 shadow-elegant">
              <CardContent className="py-16 text-center space-y-3">
                <UserCircle className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium">Aucune donnée démographique disponible</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Les données s'alimenteront automatiquement lors des prochaines inscriptions (genre, âge, école collectés dans le formulaire).
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Âge */}
                <Card className="border-2 shadow-elegant">
                  <CardHeader><CardTitle>Répartition par âge</CardTitle></CardHeader>
                  <CardContent>
                    {ageData.every((d) => d.name === "N/A") ? <EmptyState message="Aucune date de naissance renseignée." /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={ageData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [`${v} participant(s)`, "Effectif"]} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {ageData.map((_, i) => <Cell key={i} fill={COLORS[i % (COLORS.length - 1)]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Genre */}
                <Card className="border-2 shadow-elegant">
                  <CardHeader><CardTitle>Répartition par genre</CardTitle></CardHeader>
                  <CardContent>
                    {genderData.length === 0 ? <EmptyState message="Aucun genre renseigné." /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}
                            label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                            {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v, n) => [`${v} participant(s)`, n]} /><Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* École */}
              {schoolData.length > 0 && (
                <Card className="border-2 shadow-elegant">
                  <CardHeader><CardTitle>Top écoles / universités</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(160, schoolData.length * 38)}>
                      <BarChart data={schoolData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                        <Tooltip formatter={(v) => [`${v} participant(s)`, "Effectif"]} />
                        <Bar dataKey="value" fill="#059669" radius={[0, 4, 4, 0]}>
                          {schoolData.map((_, i) => <Cell key={i} fill={COLORS[i % (COLORS.length - 1)]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Données basées sur {attendeeProfiles.length} profil(s) inscrit(s) pour la sélection courante.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
