import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SITE_URL } from "@/lib/site";

export interface ShareableEvent {
  id: string;
  title: string;
  starts_at?: string | null;
  location?: string | null;
  city?: string | null;
}

/** Lien et message préparés pour partager un événement (toujours vers le site en ligne). */
export function eventShareContent(event: ShareableEvent) {
  const url = `${SITE_URL}/events/${event.id}`;
  const date = event.starts_at ? format(new Date(event.starts_at), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }) : "";
  const place = event.city ? `${event.city.charAt(0).toUpperCase()}${event.city.slice(1)}${event.location ? ` — ${event.location}` : ""}` : event.location ?? "";
  const details = [date, place].filter(Boolean).join(" · ");
  const text = `🎉 ${event.title}${details ? ` — ${details}` : ""}\nRéserve ta place sur Plav' :`;
  return {
    url,
    title: event.title,
    text,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    email: `mailto:?subject=${encodeURIComponent(`${event.title} sur Plav'`)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
  };
}

/** Téléphone ou tablette : on utilise le menu de partage natif (WhatsApp, Messages… y sont déjà). */
export function prefersNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
    && typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
