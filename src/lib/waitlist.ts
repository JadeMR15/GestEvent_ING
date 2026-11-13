import { supabase } from "@/integrations/supabase/client";

// Liste d'attente : toutes les écritures passent par des fonctions SQL
// (supabase/waitlist.sql), jamais par la table directement.

export type WaitlistStatus = "waiting" | "offered" | "accepted" | "expired" | "left";

export interface MyWaitlistEntry {
  id: string;
  event_id: string;
  status: WaitlistStatus;
  rank: number | null;
  joined_at: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  event_title: string;
  event_starts_at: string;
  event_location: string;
  event_cover_image_url: string | null;
}

export interface EventAvailability {
  taken: number;
  /** Places réservables tout de suite (offres en cours déduites). null = illimité. */
  free: number | null;
  offers: number;
  waiting: number;
  ticket_taken: Record<string, number>;
}

export interface EventWaitlistEntry {
  user_id: string;
  full_name: string;
  status: WaitlistStatus;
  rank: number | null;
  joined_at: string;
  offer_expires_at: string | null;
}

// Les fonctions SQL ne sont pas encore dans les types générés.
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args);

const ERRORS: Record<string, string> = {
  event_not_full: "Des places sont disponibles : tu peux réserver directement.",
  already_registered: "Tu as déjà une place pour cet événement.",
  account_not_verified: "Vérifie ton compte étudiant pour rejoindre la liste d'attente.",
  event_started: "L'événement a déjà commencé.",
  event_closed: "Cet événement n'accepte plus d'inscriptions.",
  private_event: "Cet événement est réservé aux membres d'une autre école.",
  event_not_found: "Événement introuvable.",
  not_authenticated: "Connecte-toi pour rejoindre la liste d'attente.",
};

export function waitlistErrorMessage(message: string): string {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : message;
}

export async function getEventAvailability(eventId: string): Promise<EventAvailability | null> {
  const { data, error } = await rpc("get_event_availability", { _event_id: eventId });
  if (error) return null;
  return data as EventAvailability | null;
}

export async function getMyWaitlist(eventId?: string): Promise<MyWaitlistEntry[]> {
  const { data, error } = await rpc("get_my_waitlist", eventId ? { _event_id: eventId } : {});
  if (error) return [];
  return (data ?? []) as MyWaitlistEntry[];
}

export async function getEventWaitlist(eventId: string): Promise<EventWaitlistEntry[]> {
  const { data, error } = await rpc("get_event_waitlist", { _event_id: eventId });
  if (error) return [];
  return (data ?? []) as EventWaitlistEntry[];
}

export async function joinWaitlist(eventId: string): Promise<{ error?: string; rank?: number | null }> {
  const { data, error } = await rpc("join_waitlist", { _event_id: eventId });
  if (error) return { error: waitlistErrorMessage(error.message) };
  return { rank: data?.rank ?? null };
}

export async function leaveWaitlist(eventId: string): Promise<{ error?: string }> {
  const { error } = await rpc("leave_waitlist", { _event_id: eventId });
  if (error) return { error: waitlistErrorMessage(error.message) };
  notifyWaitlist();
  return {};
}

/**
 * Envoie tout de suite l'email "Une place s'est libérée" aux personnes qui viennent
 * de recevoir une offre (sinon pg_cron s'en charge dans la minute). Sans attente ni erreur.
 */
export function notifyWaitlist() {
  supabase.functions.invoke("send-waitlist-offers", { body: {} }).catch(() => {});
}

/** "1er", "2e", "3e"… */
export function ordinal(n: number) {
  return n === 1 ? "1er" : `${n}e`;
}

/** Offre encore valable ? */
export function isLiveOffer(entry: Pick<MyWaitlistEntry, "status" | "offer_expires_at"> | null | undefined, now = Date.now()) {
  return !!entry && entry.status === "offered" && !!entry.offer_expires_at && new Date(entry.offer_expires_at).getTime() > now;
}

/** Temps restant lisible : "1 h 42 min", "12 min 05 s". */
export function formatRemaining(ms: number) {
  if (ms <= 0) return "0 s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m} min ${String(sec).padStart(2, "0")} s`;
}
