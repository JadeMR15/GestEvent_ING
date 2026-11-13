// Un événement est "passé" 12 h après son début : une soirée qui commence à 21 h
// reste visible pendant qu'elle a lieu (aucune heure de fin n'est enregistrée).
export const PAST_EVENT_DELAY_MS = 12 * 60 * 60 * 1000;

/** Date avant laquelle un événement est considéré comme passé. */
export function pastEventCutoff(now = new Date()): Date {
  return new Date(now.getTime() - PAST_EVENT_DELAY_MS);
}

export function isPastEvent(startsAt: string | Date, now = new Date()): boolean {
  return new Date(startsAt).getTime() < pastEventCutoff(now).getTime();
}
