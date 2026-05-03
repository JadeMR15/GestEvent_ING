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
import { Camera, CameraOff, CheckCircle2, XCircle, ScanLine, WifiOff, Wifi, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/scanner")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin", "volunteer"]}>
      <ScannerPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "QR Scanner — GestEvent" }] }),
});

const CACHE_KEY = "gestevent_qr_cache";
const OFFLINE_KEY = "gestevent_offline_scans";

type CachedReg = { id: string; user_id: string; event_id: string; full_name: string; event_title: string; attended: boolean };
type OfflineScan = { reg_id: string; scanned_at: string };

function loadCache(): Record<string, CachedReg> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function loadOffline(): OfflineScan[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]"); } catch { return []; }
}

function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [history, setHistory] = useState<{ ok: boolean; name: string; event: string; text: string; at: string }[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cacheSize, setCacheSize] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  // Suivi connectivité
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

  // Charger le cache QR depuis Supabase (mode online)
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
    toast.success(`Cache mis à jour — ${Object.keys(cache).length} billets chargés.`);
  }, []);

  useEffect(() => { refreshCache(); }, [refreshCache]);

  // Sync des scans hors-ligne
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

  // Sync auto quand connexion revient
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

    // Mode hors-ligne : utiliser le cache
    if (!navigator.onLine) {
      if (!cached) {
        addHistory(false, "Inconnu", "", "QR invalide (hors-ligne)");
        toast.error("QR invalide");
        return;
      }
      if (cached.attended) {
        addHistory(true, cached.full_name, cached.event_title, "Déjà validé");
        toast.info("Déjà scanné");
        return;
      }
      // Marquer comme attendu localement
      cached.attended = true;
      cache[trimmed] = cached;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      const offline = loadOffline();
      offline.push({ reg_id: cached.id, scanned_at: new Date().toISOString() });
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
      setPendingSync(offline.length);
      addHistory(true, cached.full_name, cached.event_title, "✓ Validé (hors-ligne)");
      toast.success(`Entrée validée (hors-ligne) : ${cached.full_name}`);
      return;
    }

    // Mode en ligne : appel DB
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

    if (error || !reg) {
      addHistory(false, "", "", "QR invalide");
      toast.error("QR invalide");
      return;
    }
    if (reg.status === "attended") {
      addHistory(true, name, reg.events?.title || "", "Déjà validé");
      toast.info("Déjà scanné");
      return;
    }
    if (reg.status !== "registered") {
      addHistory(false, name, reg.events?.title || "", `Statut : ${reg.status}`);
      toast.error("Billet non valide");
      return;
    }

    await supabase.from("registrations").update({ status: "attended", attended_at: new Date().toISOString() }).eq("id", reg.id);
    const label = `${name} → ${reg.events?.title || ""}`;
    addHistory(true, name, reg.events?.title || "", `✓ ${label}`);
    toast.success(`Entrée validée : ${label}`);

    // Mettre à jour le cache local
    if (cached) { cached.attended = true; cache[trimmed] = cached; localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  }

  function addHistory(ok: boolean, name: string, event: string, text: string) {
    setHistory((h) => [{ ok, name, event, text, at: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
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
            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
              {pendingSync} en attente
            </Badge>
          )}
        </div>
      </div>

      {/* Barre statut offline */}
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

      {/* Boutons cache */}
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
              <div id="qr-reader" className="overflow-hidden rounded-lg border bg-muted" style={{ minHeight: scanning ? 280 : 0 }} />
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

      {/* Historique */}
      {history.length > 0 && (
        <Card className="border-2 shadow-elegant">
          <CardHeader><CardTitle>Historique des scans</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {history.map((h, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  {h.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                  <div className="flex-1 min-w-0">
                    {h.name && <p className="font-medium truncate">{h.name}</p>}
                    {h.event && <p className="text-xs text-muted-foreground truncate">{h.event}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{h.at}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
