import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { useEffect, useState, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { CHARTE } from "@/lib/charte";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, CheckCircle2, Clock, XCircle, Loader2, Download, ExternalLink, QrCode } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { isPastEvent } from "@/lib/event-dates";
import { notifyWaitlist } from "@/lib/waitlist";

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
    notifyWaitlist();
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
  <link rel="stylesheet" href="${CHARTE.fontsUrl}">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${CHARTE.fontTexte};background:${CHARTE.fond};color:${CHARTE.encre};display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px 16px}
    .ticket{width:100%;max-width:480px;background:${CHARTE.blanc};border:1px solid ${CHARTE.bordure};border-radius:16px;overflow:hidden;box-shadow:${CHARTE.ombreMenu}}
    .header{background:${CHARTE.bordeaux600};padding:36px 32px 28px;text-align:center;border-bottom:6px solid ${CHARTE.jaune300}}
    .brand{margin-bottom:14px}
    .event-title{font-family:${CHARTE.fontTitre};font-size:28px;font-weight:800;color:${CHARTE.blanc};line-height:1.2}
    .body{padding:24px 32px 0}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .detail-label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${CHARTE.grisChaud};margin-bottom:5px;font-weight:700}
    .detail-value{font-size:16px;font-weight:600;color:${CHARTE.encre};line-height:1.35}
    .tear{position:relative;margin:0 -32px;height:0;border-top:2px dashed ${CHARTE.bordure}}
    .tear::before,.tear::after{content:'';position:absolute;top:-14px;width:28px;height:28px;background:${CHARTE.fond};border-radius:50%}
    .tear::before{left:-14px}.tear::after{right:-14px}
    .qr-section{padding:28px 32px 24px;display:flex;flex-direction:column;align-items:center;gap:14px}
    .qr-wrap{background:${CHARTE.blanc};border:2px solid ${CHARTE.jaune300};border-radius:16px;padding:14px;box-shadow:${CHARTE.ombreCarte}}
    .qr-label{font-size:13px;color:${CHARTE.grisChaud};text-align:center;font-weight:600}
    .qr-code{font-family:monospace;font-size:12px;color:${CHARTE.grisChaud};text-align:center;max-width:260px;word-break:break-all;line-height:1.5}
    .instructions{font-size:13px;color:${CHARTE.grisChaud};text-align:center;line-height:1.5}
    .footer{background:${CHARTE.fond};border-top:1px solid ${CHARTE.bordure};padding:14px 32px;display:flex;align-items:center;justify-content:space-between}
    .footer-brand{display:flex;align-items:center}
    .footer-note{font-size:12px;color:${CHARTE.grisChaud};text-align:right;line-height:1.4}
    .btn{display:block;margin:24px auto 0;height:48px;padding:0 24px;background:${CHARTE.jaune300};color:${CHARTE.bordeaux600};border:none;border-radius:10px;font-family:${CHARTE.fontTexte};font-size:16px;font-weight:600;cursor:pointer}
    .btn:hover{background:${CHARTE.jaune400};color:${CHARTE.bordeaux700}}
    @media print{body{background:${CHARTE.blanc};padding:0}.ticket{box-shadow:none;border-radius:0;max-width:100%}.tear::before,.tear::after{background:${CHARTE.blanc}}.btn{display:none}}
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="brand"><img src="${window.location.origin}/plav-logotype-dark.svg" alt="Plav'" style="height:44px;object-fit:contain" /></div>
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
      <div class="footer-brand"><img src="${window.location.origin}/plav-logotype.svg" alt="Plav'" style="height:26px;object-fit:contain" /></div>
      <div class="footer-note">Billet officiel<br>Ne pas dupliquer</div>
    </div>
  </div>
  <button class="btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</body>
</html>`);
    win.document.close();
  }

  // Dans l'app, la fenêtre d'impression PDF n'existe pas : on garde le QR en plein écran.
  const isNative = Capacitor.isNativePlatform();
  const withEvent = tickets.filter((t) => t.events);
  const active = withEvent.filter((t) => t.status !== "cancelled" && !isPastEvent(t.events.starts_at));
  // Anciens achats : billets d'événements passés (le plus récent en premier)
  const oldPurchases = withEvent
    .filter((t) => (t.status === "registered" || t.status === "attended") && isPastEvent(t.events.starts_at))
    .sort((a, b) => new Date(b.events.starts_at).getTime() - new Date(a.events.starts_at).getTime());
  const past = withEvent.filter((t) => t.status === "cancelled" && !isPastEvent(t.events.starts_at));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Mes billets</h1>
        <p className="text-sm text-muted-foreground md:text-base">Tes places et tes QR codes d'entrée.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : active.length === 0 ? (
        <Card>
          <EmptyState title="Aucun billet à venir pour l'instant.">
            <Button asChild variant="secondary">
              <Link to="/events">Découvrir les événements</Link>
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          {active.map((reg) => {
            const ev = reg.events;
            if (!ev) return null;
            const cfg = STATUS_CONFIG[reg.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.cancelled;
            const Icon = cfg.icon;
            const canCancel = reg.status === "registered" || reg.status === "pending";
            const hasQr = reg.status === "registered";

            return (
              <div key={reg.id} className="overflow-hidden rounded-3xl border bg-card shadow-elegant">
                {/* Haut du billet : l'événement */}
                <Link to="/events/$eventId" params={{ eventId: ev.id }} className="tap relative block bg-gradient-primary p-5 text-primary-foreground">
                  {ev.cover_image_url && <img src={ev.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
                  <img src="/plav-cocotte.svg" alt="" className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 opacity-15" />
                  <div className="relative">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                      <Icon className="h-3 w-3" />{cfg.label}
                    </span>
                    <h3 className="mt-2 font-display text-xl font-semibold leading-tight text-primary-foreground">{ev.title}</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="t-surtitre opacity-70">Date</p>
                        <p className="font-medium capitalize">{format(new Date(ev.starts_at), "EEE d MMM", { locale: fr })}</p>
                      </div>
                      <div>
                        <p className="t-surtitre opacity-70">Heure</p>
                        <p className="font-medium">{format(new Date(ev.starts_at), "HH'h'mm")}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="t-surtitre opacity-70">Lieu</p>
                        <p className="line-clamp-1 font-medium">{ev.location || "En ligne"}</p>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Pointillés de découpe */}
                <div className="ticket-notch h-0 border-t-2 border-dashed border-border" />

                {/* Bas du billet : actions */}
                <div className="flex items-center gap-2 p-4">
                  {hasQr ? (
                    <Drawer>
                      <DrawerTrigger asChild>
                        <Button className="tap h-11 flex-1 rounded-full bg-gradient-primary shadow-glow">
                          <QrCode className="mr-2 h-4 w-4" />Afficher mon QR
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="pb-safe">
                        <DrawerHeader className="text-center">
                          <DrawerTitle className="font-display text-xl">{ev.title}</DrawerTitle>
                          <p className="text-sm capitalize text-muted-foreground">{format(new Date(ev.starts_at), "EEEE d MMMM · HH'h'mm", { locale: fr })}</p>
                        </DrawerHeader>
                        <div className="flex flex-col items-center gap-3 px-4 pb-6">
                          <div className="rounded-3xl border-4 border-accent bg-white p-5 shadow-elegant">
                            <QRCodeCanvas value={reg.qr_code} size={240} />
                          </div>
                          <p className="text-sm text-muted-foreground">Présente ce code à l'entrée.</p>
                          <code className="max-w-full break-all rounded bg-muted px-2 py-1 text-xs">{reg.qr_code}</code>
                          {canCancel && (
                            <button
                              className="mt-2 text-sm font-medium text-destructive"
                              onClick={() => cancel(reg.id)}
                              disabled={cancelling === reg.id}
                            >
                              {cancelling === reg.id && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
                              Annuler mon inscription
                            </button>
                          )}
                        </div>
                      </DrawerContent>
                    </Drawer>
                  ) : (
                    <p className="flex-1 text-sm text-muted-foreground">
                      {reg.status === "pending" ? "Ta place est réservée, termine l'inscription." : "Billet indisponible."}
                    </p>
                  )}
                  {hasQr && !isNative && (
                    <Button size="icon" variant="outline" className="h-11 w-11 rounded-full" onClick={() => printTicket(reg)} aria-label="Télécharger en PDF">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {!hasQr && canCancel && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cancel(reg.id)} disabled={cancelling === reg.id}>
                      {cancelling === reg.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                      Annuler
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Anciens achats */}
      {!loading && oldPurchases.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Anciens achats</p>
          {oldPurchases.map((reg) => {
            const ev = reg.events;
            return (
              <Card key={reg.id} className="border">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-muted-foreground">
                      {format(new Date(ev.starts_at), "PPP", { locale: fr })} · {ev.location || "En ligne"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${reg.status === "attended" ? STATUS_CONFIG.attended.color : "bg-muted text-muted-foreground"}`}>
                      {reg.status === "attended" ? "Présent" : "Passé"}
                    </span>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/events/$eventId" params={{ eventId: ev.id }}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />Voir
                      </Link>
                    </Button>
                  </div>
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
