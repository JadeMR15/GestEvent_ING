import { supabase } from "@/integrations/supabase/client";

/**
 * Nombre de places prises par événement (inscriptions + places proposées à la liste d'attente).
 * Calculé par la base : un participant ne voit pas les inscriptions des autres.
 */
export async function fetchTakenCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_events_taken", { _event_ids: eventIds });
  if (error) { console.error("get_events_taken:", error.message); return {}; }
  return Object.fromEntries(((data ?? []) as { event_id: string; taken: number }[]).map((r) => [r.event_id, r.taken]));
}

/** Places prises : le chiffre de la base s'il est connu, sinon les inscriptions visibles. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function takenOf(e: any): number {
  if (typeof e.taken === "number") return e.taken;
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (e.registrations ?? []).filter((r: any) =>
    r.status === "registered" || r.status === "attended" ||
    (r.status === "pending" && r.expires_at && new Date(r.expires_at) > now)).length;
}
