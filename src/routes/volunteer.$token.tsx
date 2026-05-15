import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays, MapPin, Camera, CameraOff, CheckCircle2,
  XCircle, ScanLine, Loader2, AlertTriangle, Users,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/volunteer/$token")({
  component: VolunteerPage,
  head: () => ({ meta: [{ title: "Accès bénévole — Plav'" }] }),
});

type ScanResult = { ok: boolean; already?: boolean; name?: string; event?: string; error?: string };
type HistoryItem = { ok: boolean; name: string; text: string; at: string };

function VolunteerPage() {
  const { token } = useParams({ from: "/volunteer/$token" });

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [debugMsg, setDebugMsg] = useState("");
  const [volunteer, setVolunteer] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);

  const [stats, setStats] = useState<{ attended: number; total: number }>({ attended: 0, total: 0 });
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: vol, error } = await (supabase as any)
        .rpc("get_volunteer_by_token", { p_token: token });

      if (error) { setDebugMsg(`RPC error: ${JSON.stringify(error)}`); setInvalid(true); setLoading(false); return; }
      if (!vol) { setDebugMsg(`Token not found: ${token}`); setInvalid(true); setLoading(false); return; }

      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id, title, starts_at, location, cover_image_url")
        .eq("id", vol.event_id)
        .maybeSingle();

      if (!ev) { setDebugMsg(`Event not found: ${vol.event_id} | err: ${JSON.stringify(evErr)}`); setInvalid(true); setLoading(false); return; }
      setVolunteer(vol);
      setEvent(ev);

      const { data: s } = await (supabase as any).rpc("get_event_checkin_stats", { p_event_id: vol.event_id });
      if (s) setStats({ attended: s.attended ?? 0, total: s.total ?? 0 });

      setLoading(false);
    })();
  }, [token]);

  const processCode = useCallback(async (code: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setTimeout(() => { lockRef.current = false; }, 1500);

    const { data, error } = await (supabase as any).rpc("volunteer_checkin", {
      _token: token,
      _qr_code: code.trim(),
    });

    const result = data as ScanResult | null;

    if (error || !result) {
      addHistory(false, "", "Erreur serveur");
      toast.error("Erreur serveur");
      return;
    }

    if (!result.ok) {
      addHistory(false, "", result.error ?? "QR invalide");
      toast.error(result.error ?? "QR invalide");
      return;
    }

    if (result.already) {
      addHistory(true, result.name ?? "", "Déjà scanné");
      toast.info(`Déjà scanné : ${result.name}`);
      return;
    }

    addHistory(true, result.name ?? "", "✓ Entrée validée");
    toast.success(`Entrée validée : ${result.name}`);
    setStats((prev) => ({ ...prev, attended: prev.attended + 1 }));
  }, [token]);

  function addHistory(ok: boolean, name: string, text: string) {
    setHistory((h) => [{ ok, name, text, at: new Date().toLocaleTimeString() }, ...h].slice(0, 30));
  }

  async function startCamera() {
    try {
      const scanner = new Html5Qrcode("vol-qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => processCode(decoded),
        () => {},
      );
      setScanning(true);
    } catch (e: any) {
      toast.error("Caméra indisponible : " + (e?.message ?? "refusée"));
    }
  }

  async function stopCamera() {
    try { await scannerRef.current?.stop(); } catch {}
    scannerRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalid || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
        <Card className="w-full max-w-sm text-center border-2 shadow-elegant">
          <CardContent className="py-10 space-y-3">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="text-xl font-bold">Lien invalide</h1>
            <p className="text-sm text-muted-foreground">Ce lien bénévole est invalide ou a expiré.</p>
            {debugMsg && <p className="text-xs text-red-500 break-all mt-2">{debugMsg}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-mesh p-4">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 py-2">
          <img src="/logo2.png" alt="Plav'" className="h-10 w-10 object-contain" />
          <div>
            <p className="text-xs text-muted-foreground">Accès bénévole</p>
            <p className="font-semibold">{volunteer.name || "Bénévole"}</p>
          </div>
        </div>

        {/* Event info */}
        <Card className="border-2 shadow-elegant overflow-hidden">
          {event.cover_image_url && (
            <div className="h-32 w-full overflow-hidden">
              <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
            </div>
          )}
          {!event.cover_image_url && <div className="h-2 bg-gradient-vibrant" />}
          <CardContent className="p-4 space-y-2">
            <h1 className="text-xl font-bold">{event.title}</h1>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                {format(new Date(event.starts_at), "PPP à p", { locale: fr })}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                {event.location || "En ligne"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avancée des entrées */}
        <Card className="border-2 shadow-elegant">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-primary" />
                Avancée des entrées
              </div>
              <span className="text-2xl font-bold tabular-nums">
                {stats.attended}
                <span className="text-base font-normal text-muted-foreground"> / {stats.total}</span>
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: stats.total > 0 ? `${Math.round((stats.attended / stats.total) * 100)}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 text-right">
              {stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0}% des inscrits présents
            </p>
          </CardContent>
        </Card>

        {/* Scanner */}
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />Scanner les billets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="camera">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="camera">Caméra</TabsTrigger>
                <TabsTrigger value="manual">Manuel</TabsTrigger>
              </TabsList>

              <TabsContent value="camera" className="mt-4 space-y-3">
                <div id="vol-qr-reader" className="overflow-hidden rounded-lg border bg-muted" style={{ minHeight: scanning ? 280 : 0 }} />
                {!scanning ? (
                  <Button onClick={startCamera} className="w-full bg-gradient-primary shadow-glow">
                    <Camera className="mr-2 h-4 w-4" />Démarrer la caméra
                  </Button>
                ) : (
                  <Button onClick={stopCamera} variant="outline" className="w-full">
                    <CameraOff className="mr-2 h-4 w-4" />Arrêter
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-4 space-y-3">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Coller ou saisir le code QR"
                  onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { processCode(manual.trim()); setManual(""); } }}
                />
                <Button
                  onClick={() => { if (manual.trim()) { processCode(manual.trim()); setManual(""); } }}
                  className="w-full bg-gradient-primary shadow-glow"
                >
                  Valider l'entrée
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Historique */}
        {history.length > 0 && (
          <Card className="border-2 shadow-elegant">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Historique</span>
                <Badge variant="secondary">{history.filter((h) => h.ok && !h.text.includes("Déjà")).length} validé(s)</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {history.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    {h.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                    <div className="flex-1 min-w-0">
                      {h.name && <p className="font-medium truncate">{h.name}</p>}
                      <p className="text-xs text-muted-foreground">{h.text}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{h.at}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
