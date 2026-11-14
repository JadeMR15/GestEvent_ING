// Service worker de Plav' : reçoit les notifications push et les affiche,
// même quand le site est fermé. Pas de cache hors ligne.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Safari retire l'abonnement si une notification push n'est pas affichée.
const isSafari = /safari/i.test(self.navigator.userAgent) && !/chrome|chromium|android/i.test(self.navigator.userAgent);

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Plav'", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Plav'";
  const url = data.url || "/";

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Le site est ouvert et regardé : il affiche déjà l'info lui-même.
    const watching = windows.some((c) => c.visibilityState === "visible" && c.focused);
    if (watching && !isSafari) return;
    await self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      // Navigation dans l'application (sans recharger la page).
      client.postMessage({ type: "plav:navigate", url: new URL(url).pathname + new URL(url).search });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
