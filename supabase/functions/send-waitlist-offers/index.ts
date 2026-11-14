// @ts-nocheck — Deno runtime, ignoré par tsc
// Email "Une place s'est libérée" pour les offres de liste d'attente pas encore notifiées.
// Appelée chaque minute par pg_cron (en-tête x-webhook-secret) et, pour aller plus vite,
// par le site juste après une annulation (utilisateur connecté).
// Sécurité : les offres et les destinataires sont lus dans la base ; chaque offre
// n'est réservée qu'une fois (claim_waitlist_notifications), donc pas de doublon.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, frenchDate, getCaller, json, sendBrevo } from "../_shared/common.ts";
import { C, emailLayout, infoBox } from "../_shared/email-layout.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();

    // Même secret que les emails de vérification (Vault "email_webhook_secret").
    const given = req.headers.get("x-webhook-secret");
    let fromCron = false;
    if (given) {
      const { data } = await admin.rpc("check_email_webhook_secret", { _secret: given });
      fromCron = data === true;
    }
    if (!fromCron && !(await getCaller(req, admin))) return json({ error: "Non autorisé" }, 401);

    const { data: offers, error } = await admin.rpc("claim_waitlist_notifications", { _limit: 50 });
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    for (const offer of offers ?? []) {
      try {
        const { data: ev } = await admin.from("events")
          .select("id, title, starts_at, location").eq("id", offer.event_id).single();
        const { data: u } = await admin.auth.admin.getUserById(offer.user_id);
        const email = u?.user?.email;
        if (!ev || !email) continue;

        const { data: profile } = await admin.from("profiles").select("full_name").eq("id", offer.user_id).maybeSingle();
        const name = profile?.full_name || u.user.user_metadata?.full_name || "";
        const deadline = frenchDate(offer.offer_expires_at);
        const url = `${SITE_URL}/events/${encodeURIComponent(ev.id)}`;

        const html = emailLayout({
          title: "Une place s'est libérée !",
          content: `
            <p>Bonjour${name ? ` <strong>${esc(name)}</strong>` : ""},</p>
            <p>Bonne nouvelle : une place vient de se libérer pour <strong>${esc(ev.title)}</strong>, et elle est pour toi.</p>
            ${infoBox(`
              <p style="margin:4px 0">📅 <strong>${esc(frenchDate(ev.starts_at))}</strong></p>
              <p style="margin:4px 0">📍 <strong>${esc(ev.location || "En ligne")}</strong></p>`)}
            <p style="color:${C.burgundy};font-weight:600">Elle t'est réservée jusqu'au ${esc(deadline)}.</p>
            <p>Passé ce délai, elle sera proposée à la personne suivante sur la liste d'attente.</p>`,
          button: { label: "Prendre ma place", url },
          footer: `Tu ne veux plus venir ? Ouvre l'événement et clique sur « Je laisse ma place ».`,
        });

        await sendBrevo({ email, name: name || undefined }, `🎟️ Une place s'est libérée : ${ev.title}`, html);
        sent++;
      } catch (e) {
        console.error("envoi échoué", offer.id, e.message);
        // Nouvel essai au prochain passage si l'offre court toujours.
        await admin.from("waitlist").update({ offer_notified_at: null }).eq("id", offer.id).eq("status", "offered");
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
