// @ts-nocheck — Deno runtime, ignoré par tsc
// Relance par email : un message école ↔ association est resté non lu 2 h.
// Appelée toutes les 10 minutes par pg_cron (en-tête x-webhook-secret).
// claim_message_reminders réserve chaque message une seule fois : pas de doublon.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, frenchDate, json, sendBrevo } from "../_shared/common.ts";
import { C, emailLayout, infoBox } from "../_shared/email-layout.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

function excerpt(text: string, max = 280) {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();
    const given = req.headers.get("x-webhook-secret");
    const { data: ok } = given ? await admin.rpc("check_email_webhook_secret", { _secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Non autorisé" }, 401);

    const { data: threads, error } = await admin.rpc("claim_message_reminders");
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    for (const t of threads ?? []) {
      // L'école écrit → l'association reçoit (et inversement).
      const sender = t.from_school ? t.school_name : t.association_name;
      const url = t.from_school
        ? `${SITE_URL}/messages`
        : `${SITE_URL}/school-admin/associations/${encodeURIComponent(t.association_id)}`;
      const count = t.unread > 1 ? `${t.unread} messages non lus` : "un message non lu";

      for (const r of t.recipients ?? []) {
        if (!r?.email) continue;
        try {
          const html = emailLayout({
            title: `${sender} attend votre réponse`,
            content: `
              <p>Bonjour${r.name ? ` <strong>${esc(r.name)}</strong>` : ""},</p>
              <p>Vous avez ${count} de <strong>${esc(sender)}</strong> sur Plav'.</p>
              ${infoBox(`
                <p style="margin:0 0 6px;font-size:12px;color:${C.muted}">${esc(frenchDate(t.last_at))}</p>
                <p style="margin:0;white-space:pre-wrap">${esc(excerpt(t.last_body))}</p>`)}`,
            button: { label: "Lire et répondre", url },
            footer: "Vous recevez cet email car un message vous attend depuis plus de 2 heures.",
          });
          await sendBrevo({ email: r.email, name: r.name || undefined }, `💬 ${sender} vous a écrit sur Plav'`, html);
          sent++;
        } catch (e) {
          console.error("relance échouée", t.association_id, e.message);
        }
      }
    }
    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
