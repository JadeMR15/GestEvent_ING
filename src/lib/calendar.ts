import { SITE_URL } from "@/lib/site";

export interface CalendarEvent {
  id: string;
  title: string;
  starts_at: string;
  location?: string | null;
  city?: string | null;
  description?: string | null;
}

// Les événements n'ont pas d'heure de fin : durée par défaut d'une soirée.
const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;

/** Date au format iCalendar en UTC : 20270312T180000Z. */
function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Échappement du texte iCalendar (RFC 5545 §3.3.11). */
function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function parts(ev: CalendarEvent) {
  const start = new Date(ev.starts_at);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  const place = [ev.location, ev.city].filter(Boolean).join(", ");
  const url = `${SITE_URL}/events/${ev.id}`;
  const details = `${ev.description ? `${ev.description}\n\n` : ""}Ton billet et les infos à jour : ${url}`;
  return { start, end, place, url, details };
}

/** Lien « Ajouter à Google Agenda ». */
export function googleCalendarUrl(ev: CalendarEvent) {
  const { start, end, place, details } = parts(ev);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${icsDate(start)}/${icsDate(end)}`,
    details,
    location: place,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Contenu d'un fichier .ics (Apple Calendrier, Outlook…), avec un rappel 2 h avant. */
export function icsContent(ev: CalendarEvent) {
  const { start, end, place, url, details } = parts(ev);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plav//Billetterie etudiante//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@plav.fr`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(ev.title)}`,
    place ? `LOCATION:${icsText(place)}` : "",
    `DESCRIPTION:${icsText(details)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(ev.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

/** Télécharge le fichier .ics (sur iPhone, Safari propose de l'ajouter au Calendrier). */
export function downloadIcs(ev: CalendarEvent) {
  const blob = new Blob([icsContent(ev)], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${ev.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "evenement"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
