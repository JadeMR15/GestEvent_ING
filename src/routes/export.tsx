import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/export")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <ExportPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Export — GuestEvent" }] }),
});

const HEADER = ["Participant", "Statut", "QR Code", "Date inscription", "Scanné le"];
const HEADER_GLOBAL = ["Événement", "Date", "Lieu", ...HEADER];

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9À-ɏ\s_-]/g, "").trim().slice(0, 50) || "evenement";
}

function toCSV(rows: (string | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function statusLabel(s: string) {
  return s === "registered" ? "Confirmé" : s === "attended" ? "Présent" : s;
}

function buildRow(r: any, profMap: Record<string, string>) {
  return [
    profMap[r.user_id] ?? r.user_id,
    statusLabel(r.status),
    r.qr_code ?? "",
    r.registered_at ? format(new Date(r.registered_at), "yyyy-MM-dd HH:mm") : "",
    r.attended_at ? format(new Date(r.attended_at), "yyyy-MM-dd HH:mm") : "",
  ];
}

function ExportPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("events")
      .select("id,title,starts_at,location")
      .eq("organizer_id", user.id)
      .order("starts_at", { ascending: false })
      .then(({ data }) => setEvents(data ?? []));
  }, [user]);

  async function fetchRegs(eventIds: string[]) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, events(title,starts_at,location)")
      .in("event_id", eventIds)
      .order("registered_at", { ascending: true });

    const regIds = Array.from(new Set((regs ?? []).map((r: any) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (regIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", regIds);
      profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    }
    return { regs: regs ?? [], profMap };
  }

  async function exportSingle(ev: any) {
    setLoadingId(ev.id);
    const { regs, profMap } = await fetchRegs([ev.id]);
    const rows = regs.map((r: any) => buildRow(r, profMap));
    const csv = "﻿" + toCSV([HEADER, ...rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(ev.title)}_${format(new Date(ev.starts_at), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLoadingId(null);
    toast.success(`Export téléchargé — ${rows.length} participant(s).`);
  }

  async function exportAll() {
    if (!user) return;
    setLoadingAll(true);

    const { regs, profMap } = await fetchRegs(events.map((e) => e.id));
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const zip = new JSZip();

    for (const ev of events) {
      const evRegs = regs.filter((r: any) => r.event_id === ev.id);
      const rows = evRegs.map((r: any) => buildRow(r, profMap));
      const csv = "﻿" + toCSV([HEADER, ...rows]);
      const filename = `${safeName(ev.title)}_${format(new Date(ev.starts_at), "yyyy-MM-dd")}.csv`;
      zip.file(filename, csv);
    }

    const globalRows = regs.map((r: any) => [
      r.events?.title ?? "",
      r.events?.starts_at ? format(new Date(r.events.starts_at), "yyyy-MM-dd HH:mm") : "",
      r.events?.location ?? "",
      ...buildRow(r, profMap),
    ]);
    zip.file(`GuestEvent_global_${dateStr}.csv`, "﻿" + toCSV([HEADER_GLOBAL, ...globalRows]));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GuestEvent_export_${dateStr}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setLoadingAll(false);
    toast.success(`Export téléchargé — ${events.length} CSV + 1 global.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exporter</h1>
          <p className="text-muted-foreground">Téléchargez les données de vos événements en CSV.</p>
        </div>
        <Button onClick={exportAll} disabled={loadingAll || events.length === 0} className="bg-gradient-primary shadow-glow">
          <Download className="mr-2 h-4 w-4" />
          {loadingAll ? "Export…" : "Exporter tout (ZIP)"}
        </Button>
      </div>

      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle>Événements</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Aucun événement à exporter.</p>
          ) : (
            <ul className="divide-y">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.starts_at), "PPP", { locale: fr })} · {ev.location || "En ligne"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportSingle(ev)}
                    disabled={loadingId === ev.id}
                  >
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    {loadingId === ev.id ? "Export…" : "CSV"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
