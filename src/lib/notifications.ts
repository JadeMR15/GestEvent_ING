// Notifications : compteurs des pastilles, messages en temps réel, notifications système.
// Un seul abonnement par session (module partagé), même si la barre latérale est remontée
// à chaque changement de page.
import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/schools";
import { onPushNavigate, pushActive, registerServiceWorker, subscribePush, syncPush } from "@/lib/push";

export interface NotificationCounts {
  association_messages?: number;
  school_messages?: number;
  school_messages_by_association?: Record<string, number>;
  school_reviews?: number;
  school_members?: number;
  admin_verifications?: number;
  admin_schools?: number;
  waitlist_offers?: number;
}

// Compteurs qui déclenchent une notification quand ils augmentent (les messages ont la leur).
const WATCHED: { key: keyof NotificationCounts; title: string; body: string; url: string }[] = [
  { key: "school_reviews", title: "Événement à valider", body: "Une association attend votre validation.", url: "/school-admin/reviews" },
  { key: "school_members", title: "Nouveau membre", body: "Un compte demande à rejoindre votre école.", url: "/school-admin/members" },
  { key: "admin_verifications", title: "Justificatif à vérifier", body: "Un étudiant a envoyé son justificatif.", url: "/admin/verifications" },
  { key: "admin_schools", title: "École à valider", body: "Une demande d'école est arrivée.", url: "/admin/schools" },
  { key: "waitlist_offers", title: "Une place s'est libérée !", body: "Elle t'est réservée pour un temps limité.", url: "/waitlist" },
];

let counts: NotificationCounts = {};
let loaded = false;
let userId: string | null = null;
let channel: RealtimeChannel | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let go: (url: string) => void = (url) => { window.location.assign(url); };
// Conversation affichée à l'écran (pas de notification pour elle).
let activeThread: string | null = null;
const listeners = new Set<() => void>();
let authWatched = false;
let navigateWired = false;

export function totalNotifications(c: NotificationCounts = counts): number {
  return (c.association_messages ?? 0) + (c.school_messages ?? 0) + (c.school_reviews ?? 0)
    + (c.school_members ?? 0) + (c.admin_verifications ?? 0) + (c.admin_schools ?? 0) + (c.waitlist_offers ?? 0);
}

/** Pastille de chaque lien de navigation. */
export function badgeFor(url: string, c: NotificationCounts): number {
  switch (url) {
    case "/messages": return c.association_messages ?? 0;
    case "/school-admin/messages": return c.school_messages ?? 0;
    case "/school-admin": return (c.school_reviews ?? 0) + (c.school_members ?? 0);
    case "/school-admin/reviews": return c.school_reviews ?? 0;
    case "/school-admin/members": return c.school_members ?? 0;
    case "/admin/verifications": return c.admin_verifications ?? 0;
    case "/admin/schools": return c.admin_schools ?? 0;
    case "/waitlist": return c.waitlist_offers ?? 0;
    default: return 0;
  }
}

function emit() { listeners.forEach((l) => l()); }

// --- Titre de l'onglet « (3) … » et pastille de l'icône de l'app installée -----------
const TITLE_PREFIX = /^\(\d+\)\s/;
function applyTitle() {
  const n = totalNotifications();
  const base = document.title.replace(TITLE_PREFIX, "");
  const next = n > 0 ? `(${n}) ${base}` : base;
  if (document.title !== next) document.title = next;
}
let titleObserver: MutationObserver | null = null;
function watchTitle() {
  if (titleObserver || typeof MutationObserver === "undefined") return;
  // Chaque page remet son titre : on rajoute le compteur.
  titleObserver = new MutationObserver(applyTitle);
  titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true });
}
function applyAppBadge() {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  const n = totalNotifications();
  (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
}

// --- Notifications système ----------------------------------------------------------
export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Active les notifications : push si l'appareil le permet, sinon notifications du navigateur. */
export async function enableSystemNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (await subscribePush()) { emit(); return true; }
  const res = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  emit();
  return res === "granted";
}

/** Notification système si la page n'est pas regardée, sinon simple toast dans le site. */
function notify(title: string, body: string, url: string, tag?: string) {
  const looking = document.visibilityState === "visible" && document.hasFocus();
  // Push actif : c'est le service worker qui affiche la notification système.
  if (!looking && pushActive()) return;
  if (!looking && notificationsSupported() && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body, tag, icon: "/plav-cocotte.svg" });
      n.onclick = () => { window.focus(); go(url); n.close(); };
      return;
    } catch { /* navigateurs qui exigent un service worker : toast à la place */ }
  }
  toast(title, { description: body, action: { label: "Ouvrir", onClick: () => go(url) } });
}

// --- Chargement des compteurs -------------------------------------------------------
export async function refreshNotifications() {
  if (!userId) return;
  const { data, error } = await db.rpc("my_notification_counts");
  if (error || !data) return;
  const next = data as NotificationCounts;
  if (loaded) {
    for (const w of WATCHED) {
      if ((next[w.key] as number ?? 0) > (counts[w.key] as number ?? 0)) notify(w.title, w.body, w.url, w.key);
    }
  }
  counts = next;
  loaded = true;
  applyTitle();
  applyAppBadge();
  emit();
}

interface MessageRow { id: string; association_id: string; sender_id: string | null; from_school: boolean; body: string }

async function onNewMessage(m: MessageRow) {
  if (m.sender_id === userId) return;
  window.dispatchEvent(new CustomEvent("plav:new-message", { detail: m }));
  await refreshNotifications();
  const watching = activeThread === m.association_id && document.visibilityState === "visible";
  if (watching) return;
  let from = "L'école";
  if (!m.from_school) {
    const { data } = await db.from("associations").select("name").eq("id", m.association_id).maybeSingle();
    from = data?.name ?? "Une association";
  }
  const url = m.from_school ? "/messages" : `/school-admin/messages?a=${m.association_id}`;
  const body = m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body;
  notify(`Nouveau message de ${from}`, body, url, `msg-${m.association_id}`);
}

function start(id: string) {
  if (userId === id) return;
  stop();
  userId = id;
  watchTitle();
  registerServiceWorker();
  syncPush();
  if (!navigateWired) { navigateWired = true; onPushNavigate((url) => go(url)); }
  if (!authWatched) {
    authWatched = true;
    supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") stop(); });
  }
  refreshNotifications();
  channel = supabase
    .channel(`notifications-${id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "school_messages" },
      (p) => { onNewMessage(p.new as MessageRow); })
    .on("postgres_changes", { event: "*", schema: "public", table: "waitlist", filter: `user_id=eq.${id}` },
      () => { refreshNotifications(); })
    .subscribe();
  // Le reste (validations, membres…) : toutes les minutes et au retour sur l'onglet.
  poll = setInterval(refreshNotifications, 60_000);
  window.addEventListener("focus", refreshNotifications);
}

function stop() {
  if (channel) supabase.removeChannel(channel);
  if (poll) clearInterval(poll);
  window.removeEventListener("focus", refreshNotifications);
  channel = null;
  poll = null;
  userId = null;
  loaded = false;
  counts = {};
  applyTitle();
  applyAppBadge();
  emit();
}

/** Conversation actuellement ouverte (null en la quittant). */
export function setActiveThread(associationId: string | null) {
  activeThread = associationId;
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const snapshot = () => counts;
const serverSnapshot = (): NotificationCounts => ({});

/** Compteurs de notifications de l'utilisateur connecté (démarre l'écoute au besoin). */
export function useNotifications(): NotificationCounts {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    go = (url) => { navigate({ href: url }); };
  }, [navigate]);
  useEffect(() => {
    if (user) start(user.id);
    else if (userId) stop();
  }, [user]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Permission des notifications système (« default », « granted », « denied » ou null si non supporté). */
export function useNotificationPermission(): NotificationPermission | null {
  return useSyncExternalStore(subscribe,
    () => (notificationsSupported() ? Notification.permission : null),
    () => null);
}
