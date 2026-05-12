import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/emails")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <EmailsPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Emails envoyés — GuestEvent" }] }),
});

function EmailsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: evIds } = await supabase
        .from("events")
        .select("id")
        .eq("organizer_id", user.id);

      if (!evIds?.length) { setLoading(false); return; }

      const { data } = await supabase
        .from("email_logs")
        .select("*, events(title)")
        .in("event_id", evIds.map((e: any) => e.id))
        .order("sent_at", { ascending: false })
        .limit(200);

      setLogs(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  const typeLabel: Record<string, string> = {
    confirmation: "Confirmation",
    reminder: "Rappel 24h",
    cancellation: "Annulation",
  };

  const statusIcon = (status: string) => {
    if (status === "sent") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-orange-400" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Emails envoyés</h1>
        <p className="text-muted-foreground">Historique des emails transactionnels de vos événements.</p>
      </div>

      <Card className="border-2 shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Historique ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Chargement…</p>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Aucun email envoyé pour l'instant.</p>
          ) : (
            <ul className="divide-y">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcon(log.status)}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{log.recipient_email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {log.events?.title ?? "—"} · {typeLabel[log.type] ?? log.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className={
                        log.status === "sent" ? "bg-emerald-100 text-emerald-700" :
                        log.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-orange-100 text-orange-700"
                      }
                    >
                      {log.status === "sent" ? "Envoyé" : log.status === "failed" ? "Échec" : "En attente"}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.sent_at ? format(new Date(log.sent_at), "dd/MM/yyyy HH:mm") : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
