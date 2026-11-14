// Notifications push : abonnement de l'appareil (service worker /sw.js) et
// enregistrement dans Supabase. Les envois partent du serveur (fonction send-push).
import { db } from "@/lib/schools";

// Clé publique VAPID (la clé privée est un secret des Edge Functions).
const VAPID_PUBLIC_KEY = "BAoXvQmzlbKXVVIjHs4NQQXQaS8MRVmIjfeF_SDNozwuGUFSOAU1SicdNa6DZagUNooSioEIdQ6xh5Yv-xBSOx4";

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
let active = false;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone / iPad dans Safari (pas installé) : le push n'y marche qu'après « Sur l'écran d'accueil ». */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Les notifications push sont actives sur cet appareil (le service worker les affiche). */
export function pushActive(): boolean {
  return active;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register("/sw.js").catch(() => null);
  return registration;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  const { error } = await db.rpc("save_push_subscription", {
    _endpoint: json.endpoint, _p256dh: json.keys.p256dh, _auth: json.keys.auth, _user_agent: navigator.userAgent,
  });
  active = !error;
  return !error;
}

/** Demande la permission (si besoin) et abonne cet appareil. */
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return false;
  const reg = await registerServiceWorker();
  if (!reg) return false;
  await navigator.serviceWorker.ready;
  try {
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    return await save(sub);
  } catch {
    return false;
  }
}

/** À la connexion : réabonne l'appareil si la permission est déjà donnée (sans rien demander). */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  await subscribePush();
}

/** Avant la déconnexion : cet appareil ne reçoit plus les notifications de ce compte. */
export async function removePushSubscription(): Promise<void> {
  active = false;
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await db.rpc("delete_push_subscription", { _endpoint: sub.endpoint });
  } catch { /* hors ligne : l'abonnement sera remplacé à la prochaine connexion */ }
}

/** Clic sur une notification alors que le site est ouvert : navigation dans l'application. */
export function onPushNavigate(go: (url: string) => void): void {
  if (!pushSupported()) return;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type === "plav:navigate" && e.data.url) go(e.data.url);
  });
}
