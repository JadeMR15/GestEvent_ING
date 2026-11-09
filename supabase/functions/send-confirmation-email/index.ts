// @ts-nocheck — Deno runtime, ignoré par tsc
// Envoie le billet (QR code) après une inscription.
// Sécurité : l'appelant doit être connecté, et on n'envoie que pour SES inscriptions
// confirmées depuis moins d'une heure. Destinataires et contenu viennent de la base.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, frenchDate, getCaller, json, sendBrevo } from "../_shared/common.ts";

const MAX_AGE_MS = 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();
    const caller = await getCaller(req, admin);
    if (!caller) return json({ error: "Non connecté" }, 401);

    const { registration_ids } = await req.json();
    if (!Array.isArray(registration_ids) || registration_ids.length === 0 || registration_ids.length > 20) {
      return json({ error: "Inscriptions invalides" }, 400);
    }

    const { data: regs } = await admin
      .from("registrations")
      .select("id, event_id, user_id, status, qr_code, guest_name, guest_email, registered_at")
      .in("id", registration_ids)
      .eq("user_id", caller.id)
      .eq("status", "registered");

    const recent = (regs ?? []).filter((r) => Date.now() - new Date(r.registered_at).getTime() < MAX_AGE_MS);
    if (recent.length === 0) return json({ ok: true, sent: 0 });

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", caller.id).maybeSingle();
    const eventIds = [...new Set(recent.map((r) => r.event_id))];
    const { data: events } = await admin.from("events").select("id, title, starts_at, location, organizer_id").in("id", eventIds);
    const eventsById = Object.fromEntries((events ?? []).map((e) => [e.id, e]));

    let sent = 0;
    for (const reg of recent) {
      const ev = eventsById[reg.event_id];
      if (!ev) continue;
      const toEmail = reg.guest_email || caller.email;
      const fullName = reg.guest_name || profile?.full_name || "Participant";
      if (!toEmail) continue;

      const { data: org } = await admin.auth.admin.getUserById(ev.organizer_id);
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(reg.qr_code)}&size=250x250`;

      await sendBrevo(
        { email: toEmail, name: fullName },
        `🎟️ Votre billet — ${ev.title}`,
        `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#2C2C2A">
            <div style="background:linear-gradient(135deg,#EED4D8,#C87488);padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="font-family:Georgia,serif;font-size:32px;font-style:italic;color:#6B0F2C;margin:0">${esc(ev.title)}</h1>
            </div>
            <div style="background:#FDFAF7;padding:32px;border:1px solid #D5A0A8;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 8px">Bonjour <strong>${esc(fullName)}</strong>,</p>
              <p style="margin:0 0 24px;color:#6B0F2C">Votre inscription est confirmée !</p>
              <div style="background:#EED4D8;border-radius:8px;padding:16px;margin-bottom:24px">
                <p style="margin:4px 0">📅 <strong>${esc(frenchDate(ev.starts_at))}</strong></p>
                <p style="margin:4px 0">📍 <strong>${esc(ev.location || "En ligne")}</strong></p>
              </div>
              <p style="text-align:center;font-weight:500;margin-bottom:12px">Votre QR code d'entrée :</p>
              <div style="text-align:center;background:#fff;padding:16px;border-radius:8px;border:1px solid #D5A0A8">
                <img src="${qrImageUrl}" width="200" height="200" alt="QR code" style="display:block;margin:0 auto" />
                <p style="font-family:monospace;font-size:11px;color:#888;margin:8px 0 0">${esc(reg.qr_code)}</p>
              </div>
              <p style="margin-top:24px;font-size:13px;color:#888;text-align:center">Présentez ce QR code à l'entrée · Plav'</p>
            </div>
          </div>
        `,
        org?.user?.email,
      );
      sent++;
    }

    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
