import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CameraOff, CheckCircle2, XCircle, ScanLine, WifiOff, Wifi, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/scanner")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin", "volunteer"]}>
      <ScannerPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "QR Scanner — Plav'" }] }),
});

const CACHE_KEY = "gestevent_qr_cache";
const OFFLINE_KEY = "gestevent_offline_scans";

type CachedReg = { id: string; user_id: string; event_id: string; full_name: string; event_title: string; attended: boolean };
type OfflineScan = { reg_id: string; scanned_at: string };
type ScanEntry = { name: string; at: string; ok: boolean };

function loadCache(): Record<string, CachedReg> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function loadOffline(): OfflineScan[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]"); } catch { return []; }
}

function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [scanFlash, setScanFlash] = useState<"success" | "error" | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cacheSize, setCacheSize] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  // Événements & suivi
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [stats, setStats] = useState({ attended: 0, total: 0 });
  const [dbHistory, setDbHistory] = useState<ScanEntry[]>([]);

  // Connectivité
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    setPendingSync(loadOffline().length);
    setCacheSize(Object.keys(loadCache()).length);
  }, []);

  // Charger la liste des événements
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at")
        .order("starts_at", { ascending: false })
        .limit(30);
      setEvents(data ?? []);
    })();
  }, []);

  // Charger stats & historique depuis la DB
  const loadStatsAndHistory = useCallback(async (eventId: string) => {
    if (!eventId) return;

    const [{ count: attended }, { count: total }, { data: regs }] = await Promise.all([
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "attended"),
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["pending", "registered", "attended"]),
      supabase.from("registrations").select("user_id, attended_at").eq("event_id", eventId).eq("status", "attended").order("attended_at", { ascending: false }).limit(50),
    ]);

    setStats({ attended: attended ?? 0, total: total ?? 0 });

    if (regs?.length) {
      const ids = regs.map((r) => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
      setDbHistory(regs.map((r) => ({
        name: profMap[r.user_id] || "Participant",
        at: r.attended_at ? format(new Date(r.attended_at), "HH:mm:ss") : "",
        ok: true,
      })));
    } else {
      setDbHistory([]);
    }
  }, []);

  // Realtime : mise à jour automatique quand un scan arrive
  useEffect(() => {
    if (!selectedEventId) return;
    loadStatsAndHistory(selectedEventId);

    const channel = supabase
      .channel(`scanner-live-${selectedEventId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "registrations",
        filter: `event_id=eq.${selectedEventId}`,
      }, () => {
        loadStatsAndHistory(selectedEventId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedEventId, loadStatsAndHistory]);

  // Cache QR
  const refreshCache = useCallback(async () => {
    if (!navigator.onLine) return;
    const { data: regs } = await supabase
      .from("registrations")
      .select("id, user_id, event_id, status, qr_code, attended_at, events(title)")
      .eq("status", "registered");

    if (!regs) return;
    const ids = [...new Set(regs.map((r) => r.user_id))];
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
    }

    const cache: Record<string, CachedReg> = {};
    for (const r of regs) {
      cache[r.qr_code] = {
        id: r.id,
        user_id: r.user_id,
        event_id: r.event_id,
        full_name: profMap[r.user_id] || "Participant",
        event_title: (r.events as any)?.title || "Événement",
        attended: !!r.attended_at,
      };
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    setCacheSize(Object.keys(cache).length);
  }, []);

  useEffect(() => { refreshCache(); }, [refreshCache]);

  // Sync hors-ligne
  async function syncOfflineScans() {
    const pending = loadOffline();
    if (!pending.length || !navigator.onLine) return;
    setSyncing(true);
    let synced = 0;
    for (const scan of pending) {
      const { error } = await supabase
        .from("registrations")
        .update({ status: "attended", attended_at: scan.scanned_at })
        .eq("id", scan.reg_id);
      if (!error) synced++;
    }
    localStorage.setItem(OFFLINE_KEY, JSON.stringify([]));
    setPendingSync(0);
    setSyncing(false);
    toast.success(`${synced} scan(s) synchronisé(s).`);
    refreshCache();
  }

  useEffect(() => {
    if (isOnline && loadOffline().length > 0) syncOfflineScans();
  }, [isOnline]);

  async function processCode(code: string) {
    if (lockRef.current) return;
    lockRef.current = true;
    setTimeout(() => { lockRef.current = false; }, 1500);

    const trimmed = code.trim();
    const cache = loadCache();
    const cached = cache[trimmed];

    const flash = (type: "success" | "error") => {
      setScanFlash(type);
      setTimeout(() => setScanFlash(null), 800);
    };

    if (!navigator.onLine) {
      if (!cached) { flash("error"); toast.error("QR invalide"); return; }
      if (cached.attended) { flash("error"); toast.info("Déjà scanné"); return; }
      cached.attended = true;
      cache[trimmed] = cached;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      const offline = loadOffline();
      offline.push({ reg_id: cached.id, scanned_at: new Date().toISOString() });
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
      setPendingSync(offline.length);
      flash("success");
      toast.success(`Entrée validée (hors-ligne) : ${cached.full_name}`);
      return;
    }

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("*, events(title)")
      .eq("qr_code", trimmed)
      .maybeSingle();

    let name = cached?.full_name || "Participant";
    if (reg) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", reg.user_id).maybeSingle();
      if (prof?.full_name) name = prof.full_name;
    }

    if (error || !reg) { flash("error"); toast.error("QR invalide"); return; }
    if (reg.status === "attended") { flash("error"); toast.info(`Déjà scanné — ${name}`); return; }
    if (reg.status !== "registered") { flash("error"); toast.error("Billet non valide"); return; }

    const now = new Date().toISOString();
    await supabase.from("registrations").update({ status: "attended", attended_at: now }).eq("id", reg.id);
    flash("success");
    toast.success(`✓ Entrée validée : ${name}`);
    if (cached) { cached.attended = true; cache[trimmed] = cached; localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }

    // Mise à jour instantanée du compteur et de l'historique
    if (reg.event_id === selectedEventId) {
      setStats((s) => ({ ...s, attended: s.attended + 1 }));
      setDbHistory((h) => [{ name, at: format(new Date(now), "HH:mm:ss"), ok: true }, ...h].slice(0, 50));
    }
  }

  async function startCamera() {
    try {
      const el = document.getElementById("qr-reader");
      if (!el) return;
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 240 }, (decoded) => processCode(decoded), () => {});
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

  const pct = stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scanner QR</h1>
          <p className="text-muted-foreground">Validez les entrées par QR code.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "En ligne" : "Hors-ligne"}
          </Badge>
          {pendingSync > 0 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700">{pendingSync} en attente</Badge>
          )}
        </div>
      </div>

      {!isOnline && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="flex items-center gap-3 p-4">
            <WifiOff className="h-5 w-5 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">Mode hors-ligne actif</p>
              <p className="text-xs text-orange-600">{cacheSize} billets en cache · {pendingSync} scan(s) à synchroniser</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={refreshCache} disabled={!isOnline}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />Actualiser cache ({cacheSize})
        </Button>
        {pendingSync > 0 && isOnline && (
          <Button size="sm" onClick={syncOfflineScans} disabled={syncing} className="bg-gradient-primary shadow-glow">
            {syncing && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Synchroniser ({pendingSync})
          </Button>
        )}
      </div>

      {/* Sélecteur d'événement + stats en direct */}
      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Suivi en direct
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un événement…" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedEventId && (
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold text-primary">{stats.attended}</p>
                  <p className="text-sm text-muted-foreground">sur {stats.total} inscrits</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{pct}%</p>
                  <p className="text-xs text-muted-foreground">présents</p>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#C87488] to-[#6B0F2C] transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scanner */}
      <Card className="border-2 shadow-elegant">
        <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" />Scan</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="camera">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="camera">Caméra</TabsTrigger>
              <TabsTrigger value="manual">Manuel</TabsTrigger>
            </TabsList>
            <TabsContent value="camera" className="mt-4 space-y-3">
              <div className="relative">
                <div id="qr-reader" className="overflow-hidden rounded-lg border bg-muted" style={{ minHeight: scanning ? 280 : 0 }} />
                {scanFlash && (
                  <div className={`absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-300 flex items-center justify-center ${scanFlash === "success" ? "bg-emerald-500/40" : "bg-red-500/40"}`}>
                    {scanFlash === "success"
                      ? <CheckCircle2 className="h-20 w-20 text-white drop-shadow-lg" />
                      : <XCircle className="h-20 w-20 text-white drop-shadow-lg" />}
                  </div>
                )}
              </div>
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
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Coller ou saisir le code QR" />
              <Button onClick={() => { if (manual.trim()) { processCode(manual.trim()); setManual(""); } }} className="w-full bg-gradient-primary shadow-glow">
                Valider l'entrée
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Historique en direct */}
      {selectedEventId && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Historique des entrées</span>
              {dbHistory.length > 0 && (
                <Badge variant="secondary">{dbHistory.length} entrée{dbHistory.length > 1 ? "s" : ""}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dbHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune entrée validée pour le moment.</p>
            ) : (
              <ul className="divide-y">
                {dbHistory.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <p className="flex-1 font-medium truncate">{h.name}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{h.at}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
