import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { enableSystemNotifications } from "@/lib/notifications";
import { needsHomeScreenInstall, pushSupported, removePushSubscription } from "@/lib/push";

type State = "loading" | "on" | "off" | "denied" | "install" | "unsupported";

async function currentState(): Promise<State> {
  if (needsHomeScreenInstall()) return "install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

/** Paramètres : notifications push de cet appareil. */
export function NotificationSettingsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => { currentState().then(setState); }, []);

  async function enable() {
    setBusy(true);
    const ok = await enableSystemNotifications();
    setBusy(false);
    setState(await currentState());
    if (ok) toast.success("Notifications activées sur cet appareil.");
    else if (Notification.permission === "denied") toast.error("Notifications bloquées par le navigateur.");
  }

  async function disable() {
    setBusy(true);
    await removePushSubscription();
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
    setBusy(false);
    setState("off");
    toast.success("Notifications désactivées sur cet appareil.");
  }

  return (
    <Card className="border-2 shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />Notifications
          {state === "on" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Activées</Badge>}
        </CardTitle>
        <CardDescription>
          Messages, validations, places libérées… reçus sur cet appareil, même quand Plav' est fermé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state === "loading" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}

        {state === "off" && (
          <Button onClick={enable} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Activer sur cet appareil
          </Button>
        )}

        {state === "on" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground">Cet appareil reçoit les notifications de ton compte.</p>
            <Button variant="outline" size="sm" onClick={disable} disabled={busy}>
              <BellOff className="mr-2 h-4 w-4" />Désactiver
            </Button>
          </div>
        )}

        {state === "denied" && (
          <p className="text-muted-foreground">
            Les notifications sont bloquées pour Plav' dans ton navigateur. Clique sur le cadenas à gauche de
            l'adresse du site, autorise les notifications, puis recharge la page.
          </p>
        )}

        {state === "install" && (
          <div className="space-y-2 rounded-xl bg-secondary/60 p-4">
            <p className="font-semibold">Sur iPhone, installe d'abord Plav' :</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Dans Safari, touche <Share className="inline h-4 w-4 align-text-bottom" /> <strong>Partager</strong>.</li>
              <li>Choisis <SquarePlus className="inline h-4 w-4 align-text-bottom" /> <strong>Sur l'écran d'accueil</strong>.</li>
              <li>Ouvre Plav' depuis la nouvelle icône, puis reviens ici pour activer les notifications.</li>
            </ol>
          </div>
        )}

        {state === "unsupported" && (
          <p className="text-muted-foreground">Ce navigateur ne permet pas les notifications. Essaie avec Chrome, Edge, Firefox ou Safari à jour.</p>
        )}
      </CardContent>
    </Card>
  );
}
