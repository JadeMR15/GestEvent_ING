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
import { toast } from "sonner";

export const Route = createFileRoute("/my-tickets")({
  component: () => <ProtectedLayout><MyTicketsPage /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Mes billets — GuestEvent" }] }),
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
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) { toast.error("Impossible d'ouvrir la fenêtre d'impression."); return; }
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Billet — ${ev?.title ?? "Événement"}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          p { margin: 4px 0; color: #555; }
          .qr { margin: 24px auto; text-align: center; }
          .footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: center; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>${ev?.title ?? "Événement"}</h1>
        <p>📅 ${ev?.starts_at ? format(new Date(ev.starts_at), "PPP à p") : ""}</p>
        <p>📍 ${ev?.location || "En ligne"}</p>
        <hr style="margin: 20px 0" />
        <div class="qr">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reg.qr_code)}" width="200" height="200" />
          <p style="font-family:monospace; font-size:11px; margin-top:8px">${reg.qr_code}</p>
        </div>
        <div class="footer">Billet généré par GuestEvent · Présentez ce QR code à l'entrée</div>
        <br/>
        <button onclick="window.print()">Imprimer</button>
      </body>
      </html>
    `);
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
                          <CalendarDays className="h-3.5 w-3.5" />{format(new Date(ev.starts_at), "PPP p")}
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
                  <span className="text-muted-foreground">{format(new Date(ev.starts_at), "PPP")}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
