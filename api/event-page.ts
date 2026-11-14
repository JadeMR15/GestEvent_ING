/**
 * Page d'un événement avec son aperçu de lien (Open Graph).
 *
 * WhatsApp, Messages, Messenger… n'exécutent pas le JavaScript du site : pour eux,
 * toutes les pages sont identiques. Cette fonction renvoie la page normale du site
 * (index.html) en y ajoutant le titre, la date, le lieu et l'image de l'événement.
 * Pour un visiteur, rien ne change : le site se charge exactement comme d'habitude.
 *
 * Seuls les événements publiés ou terminés ont un aperçu détaillé ; les autres
 * (brouillon, privé, inconnu) gardent l'aperçu générique de Plav'.
 * Aucune clé secrète : on lit avec la clé publique, comme un visiteur.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicEvent {
  title: string;
  description: string | null;
  starts_at: string | null;
  location: string | null;
  city: string | null;
  cover_image_url: string | null;
  status: string | null;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function frenchDate(iso: string): string {
  const text = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function loadEvent(id: string): Promise<PublicEvent | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/events?id=eq.${id}&select=title,description,starts_at,location,city,cover_image_url,status`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as PublicEvent[];
  const event = rows[0];
  return event && (event.status === "published" || event.status === "closed") ? event : null;
}

function metaTags(tags: Record<string, string>): string {
  return Object.entries(tags)
    .map(([key, value]) => {
      const attr = key.startsWith("og:") ? "property" : "name";
      return `<meta ${attr}="${key}" content="${esc(value)}" />`;
    })
    .join("\n    ");
}

export async function GET(request: Request): Promise<Response> {
  const { origin, searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";

  const shell = await fetch(`${origin}/index.html`);
  let html = await shell.text();
  if (!shell.ok) return new Response(html, { status: shell.status, headers: { "Content-Type": "text/html; charset=utf-8" } });

  let event: PublicEvent | null = null;
  if (UUID_RE.test(id)) {
    try { event = await loadEvent(id); } catch { event = null; }
  }

  if (event) {
    const details = [
      event.starts_at ? frenchDate(event.starts_at) : "",
      event.city ? `${event.city.charAt(0).toUpperCase()}${event.city.slice(1)}${event.location ? ` — ${event.location}` : ""}` : event.location ?? "",
    ].filter(Boolean).join(" · ");
    const description = `${details ? `${details}. ` : ""}Réserve ta place sur Plav'.`;
    const tags = metaTags({
      "description": description,
      "og:type": "website",
      "og:site_name": "Plav'",
      "og:locale": "fr_FR",
      "og:title": event.title,
      "og:description": description,
      "og:url": `${origin}/events/${id}`,
      "og:image": event.cover_image_url || `${origin}/plav-logotype.png`,
      "twitter:card": event.cover_image_url ? "summary_large_image" : "summary",
      "twitter:title": event.title,
      "twitter:description": description,
    });
    // On retire l'aperçu générique de index.html et on met celui de l'événement.
    html = html
      .replace(/\s*<meta (property="og:[^"]+"|name="(description|twitter:[^"]+)") content="[^"]*" \/>/g, "")
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(event.title)} — Plav'</title>\n    ${tags}`);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Un aperçu à jour en quelques minutes si l'organisateur modifie l'événement.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
