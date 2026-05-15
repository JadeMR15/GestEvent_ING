import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Ticket, CheckCircle2, Clock, XCircle,
  CalendarDays, MapPin, Loader2, Download, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/my-tickets")({
  component: () => <ProtectedLayout><MyTicketsPage /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Mes billets — Plav'" }] }),
});

const STATUS_CONFIG = {
  registered: { label: "Confirmé", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  pending:    { label: "En attente", icon: Clock, color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  attended:   { label: "Présent", icon: CheckCircle2, color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
  cancelled:  { label: "Annulé", icon: XCircle, color: "bg-muted text-muted-foreground" },
} as const;

function MyTicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("registrations")
      .select("*, events(*)")
      .eq("user_id", user.id)
      .order("registered_at", { ascending: false });
    setTickets(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function cancel(regId: string) {
    if (!confirm("Annuler cette inscription ?")) return;
    setCancelling(regId);
    const { error } = await supabase.from("registrations").delete().eq("id", regId);
    setCancelling(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Inscription annulée.");
    load();
  }

  function printTicket(reg: any) {
    const ev = reg.events;
    const win = window.open("", "_blank", "width=620,height=900");
    if (!win) { toast.error("Impossible d'ouvrir la fenêtre d'impression."); return; }
    const dateStr = ev?.starts_at
      ? new Date(ev.starts_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    const location = ev?.location || "En ligne";
    const title = ev?.title ?? "Événement";
    const qr = encodeURIComponent(reg.qr_code);

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Billet — ${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Arial,sans-serif;background:#F0EAE4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px 16px}
    .ticket{width:100%;max-width:480px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 48px rgba(114,36,62,.18)}
    .header{background:linear-gradient(135deg,#EED4D8 0%,#C87488 60%,#6B0F2C 100%);padding:36px 32px 28px;text-align:center}
    .brand{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:14px;font-weight:600}
    .event-title{font-family:Georgia,serif;font-size:26px;font-style:italic;color:#fff;line-height:1.25;text-shadow:0 1px 4px rgba(0,0,0,.15)}
    .body{padding:24px 32px 0}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .detail-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#B08090;margin-bottom:5px;font-weight:700}
    .detail-value{font-size:13px;font-weight:600;color:#2C2C2A;line-height:1.35}
    .tear{position:relative;margin:0 -32px;height:0;border-top:2px dashed #EED4D8}
    .tear::before,.tear::after{content:'';position:absolute;top:-14px;width:28px;height:28px;background:#F0EAE4;border-radius:50%}
    .tear::before{left:-14px}.tear::after{right:-14px}
    .qr-section{padding:28px 32px 24px;display:flex;flex-direction:column;align-items:center;gap:14px}
    .qr-wrap{background:#fff;border:2px solid #EED4D8;border-radius:14px;padding:14px;box-shadow:0 2px 12px rgba(114,36,62,.08)}
    .qr-label{font-size:11px;color:#B08090;text-align:center;font-weight:600;letter-spacing:.06em}
    .qr-code{font-family:monospace;font-size:9px;color:#C8B0B8;text-align:center;max-width:260px;word-break:break-all;line-height:1.5}
    .instructions{font-size:12px;color:#888;text-align:center;line-height:1.5}
    .footer{background:linear-gradient(135deg,#FDFAF7,#F5EEE8);border-top:1px solid #EED4D8;padding:14px 32px;display:flex;align-items:center;justify-content:space-between}
    .footer-brand{font-family:Georgia,serif;font-style:italic;font-size:15px;color:#6B0F2C;font-weight:600}
    .footer-note{font-size:10px;color:#B08090;text-align:right;line-height:1.4}
    .btn{display:block;margin:24px auto 0;padding:14px 40px;background:linear-gradient(135deg,#C87488,#6B0F2C);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:.02em;box-shadow:0 4px 16px rgba(114,36,62,.3)}
    .btn:hover{opacity:.92}
    @media print{body{background:#fff;padding:0}.ticket{box-shadow:none;border-radius:0;max-width:100%}.tear::before,.tear::after{background:#fff}.btn{display:none}}
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="brand">✦ Plav' ✦</div>
      <div class="event-title">${title}</div>
    </div>
    <div class="body">
      <div class="details">
        <div>
          <div class="detail-label">Date &amp; heure</div>
          <div class="detail-value">${dateStr}</div>
        </div>
        <div>
          <div class="detail-label">Lieu</div>
          <div class="detail-value">${location}</div>
        </div>
      </div>
      <div class="tear"></div>
    </div>
    <div class="qr-section">
      <div class="qr-label">QR code d'entrée</div>
      <div class="qr-wrap">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qr}" width="190" height="190" alt="QR code" />
      </div>
      <div class="qr-code">${reg.qr_code}</div>
      <div class="instructions">Présentez ce QR code à l'entrée de l'événement</div>
    </div>
    <div class="footer">
      <div class="footer-brand">Plav'</div>
      <div class="footer-note">Billet officiel<br>Ne pas dupliquer</div>
    </div>
  </div>
  <button class="btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</body>
</html>`);
    win.document.close();
  }

  const active = tickets.filter((t) => t.status !== "cancelled");
  const past = tickets.filter((t) => t.status === "cancelled");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mes billets</h1>
        <p className="text-muted-foreground">Consultez vos inscriptions et QR codes.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : active.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Aucun billet pour l'instant.</p>
            <Button asChild className="mt-4 bg-gradient-primary shadow-glow">
              <Link to="/events">Découvrir les événements</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {active.map((reg) => {
            const ev = reg.events;
            if (!ev) return null;
            const cfg = STATUS_CONFIG[reg.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.cancelled;
            const Icon = cfg.icon;
            const isExpanded = expanded === reg.id;
            const canCancel = reg.status === "registered" || reg.status === "pending";

            return (
              <Card key={reg.id} className="border-2 shadow-elegant overflow-hidden">
                {ev.cover_image_url && (
                  <div className="h-2 bg-gradient-vibrant" />
                )}
                {!ev.cover_image_url && <div className="h-2 bg-gradient-vibrant" />}
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{ev.title}</h3>
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                          <Icon className="h-3 w-3" />{cfg.label}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5" />{format(new Date(ev.starts_at), "PPP p", { locale: fr })}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />{ev.location || "En ligne"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {reg.status === "registered" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExpanded(isExpanded ? null : reg.id)}
                          >
                            <Ticket className="mr-1 h-3.5 w-3.5" />
                            {isExpanded ? "Masquer QR" : "Voir QR"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => printTicket(reg)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />PDF
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/events/$eventId" params={{ eventId: ev.id }}>
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />Voir
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {/* QR Code expanded */}
                  {isExpanded && reg.status === "registered" && (
                    <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border bg-muted/30 p-4">
                      <div className="rounded-xl bg-white p-4 shadow">
                        <QRCodeCanvas value={reg.qr_code} size={160} />
                      </div>
                      <p className="text-xs text-muted-foreground">Présentez ce code à l'entrée de l'événement.</p>
                      <code className="rounded bg-muted px-2 py-1 text-xs">{reg.qr_code}</code>
                    </div>
                  )}

                  {/* Actions */}
                  {canCancel && (
                    <div className="mt-3 border-t pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => cancel(reg.id)}
                        disabled={cancelling === reg.id}
                      >
                        {cancelling === reg.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                        Annuler l'inscription
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancelled tickets */}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Inscriptions annulées</p>
          {past.map((reg) => {
            const ev = reg.events;
            if (!ev) return null;
            return (
              <Card key={reg.id} className="border opacity-60">
                <CardContent className="flex items-center justify-between p-4 text-sm">
                  <span className="font-medium line-through">{ev.title}</span>
                  <span className="text-muted-foreground">{format(new Date(ev.starts_at), "PPP", { locale: fr })}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
