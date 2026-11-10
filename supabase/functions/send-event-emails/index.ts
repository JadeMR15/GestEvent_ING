// @ts-nocheck — Deno runtime, ignoré par tsc
// Emails liés à un événement : rappel, annulation, message, annulation d'un participant,
// invitation bénévole.
// Sécurité : seul l'organisateur de l'événement (ou un admin) peut les déclencher.
// Les destinataires sont lus dans la base, jamais fournis par le navigateur.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, frenchDate, getCaller, isAdmin, json, sendBrevo } from "../_shared/common.ts";
import { C, emailButton, emailLayout, infoBox } from "../_shared/email-layout.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

function baseHtml(content: string, organizerEmail?: string) {
  const footer = organizerEmail
    ? `Pour contacter l'organisateur : <a href="mailto:${esc(organizerEmail)}" style="color:${C.burgundy};font-weight:600">${esc(organizerEmail)}</a>`
    : undefined;
  return emailLayout({ content, footer });
}

function eventBox(ev, dateStr: string) {
  return infoBox(`
    <p style="margin:4px 0">📅 <strong>${esc(dateStr)}</strong></p>
    <p style="margin:4px 0">📍 <strong>${esc(ev.location || "En ligne")}</strong></p>`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();
    const caller = await getCaller(req, admin);
    if (!caller) return json({ error: "Non connecté" }, 401);

    const { type, event_id, subject, message, user_id, recipient_user_id, volunteer_id } = await req.json();
    if (typeof event_id !== "string") return json({ error: "Événement manquant" }, 400);

    const { data: ev } = await admin.from("events").select("*").eq("id", event_id).single();
    if (!ev) return json({ error: "Événement introuvable" }, 404);

    if (ev.organizer_id !== caller.id && !(await isAdmin(admin, caller.id))) {
      return json({ error: "Réservé à l'organisateur de l'événement" }, 403);
    }

    const organizerEmail = caller.email;
    const dateStr = frenchDate(ev.starts_at);

    // Destinataires d'une liste d'inscriptions : l'invité s'il y en a un, sinon le compte.
    async function recipientsOf(regs) {
      const out = new Map<string, string>(); // email -> nom
      for (const reg of regs ?? []) {
        if (reg.guest_email) { out.set(reg.guest_email.toLowerCase(), reg.guest_name || "Participant"); continue; }
        const { data } = await admin.auth.admin.getUserById(reg.user_id);
        const email = data?.user?.email;
        if (email && !out.has(email.toLowerCase())) {
          out.set(email.toLowerCase(), data.user.user_metadata?.full_name || "Participant");
        }
      }
      return out;
    }

    async function sendToAll(regs, makeSubject: string, makeContent: (name: string) => string) {
      const recipients = await recipientsOf(regs);
      let sent = 0;
      for (const [email, name] of recipients) {
        try {
          await sendBrevo({ email }, makeSubject, baseHtml(makeContent(name), organizerEmail), organizerEmail);
          sent++;
        } catch (e) {
          console.error("envoi échoué", email, e.message);
        }
      }
      return sent;
    }

    // (Place libérée → fonction send-waitlist-offers, liée à la table waitlist.)

    // ── Rappel ──
    if (type === "reminder") {
      const { data: regs } = await admin.from("registrations")
        .select("user_id, guest_email, guest_name").eq("event_id", event_id).eq("status", "registered");
      const sent = await sendToAll(regs, `⏰ Rappel : ${ev.title} — demain !`, (name) => `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Un rappel : vous êtes inscrit(e) à <strong>${esc(ev.title)}</strong> qui a lieu <strong>demain</strong> !</p>
        ${eventBox(ev, dateStr)}
        <p>Retrouvez votre QR code d'entrée dans « Mes billets » sur Plav'.</p>`);
      return json({ ok: true, sent });
    }

    // ── Annulation de l'événement ──
    if (type === "cancellation") {
      const { data: regs } = await admin.from("registrations")
        .select("user_id, guest_email, guest_name").eq("event_id", event_id).in("status", ["registered", "waitlisted"]);
      const sent = await sendToAll(regs, `❌ Événement annulé — ${ev.title}`, (name) => `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p style="color:${C.burgundy};font-weight:600">L'événement <strong>${esc(ev.title)}</strong> a été annulé.</p>
        ${eventBox(ev, dateStr)}
        <p>Votre inscription a été automatiquement annulée. Nous sommes désolés pour la gêne occasionnée.</p>`);
      await admin.from("events").update({ status: "closed" }).eq("id", event_id);
      return json({ ok: true, sent });
    }

    // ── Message de l'organisateur (à tous, ou à un seul participant) ──
    if (type === "custom") {
      if (typeof message !== "string" || !message.trim()) return json({ error: "Message vide" }, 400);
      if (message.length > 5000) return json({ error: "Message trop long" }, 400);
      let query = admin.from("registrations")
        .select("user_id, guest_email, guest_name").eq("event_id", event_id)
        .in("status", ["pending", "registered", "attended"]);
      if (recipient_user_id) query = query.eq("user_id", recipient_user_id).is("guest_email", null);
      const { data: regs } = await query;
      const cleanSubject = String(subject || `Message de l'organisateur — ${ev.title}`).slice(0, 150);
      const sent = await sendToAll(regs, cleanSubject, (name) => `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <div style="background:#fff;border:1px solid ${C.border};border-radius:12px;padding:20px;margin:16px 0">
          ${esc(message).replace(/\n/g, "<br/>")}
        </div>
        ${infoBox(`
          <p style="margin:2px 0;font-size:13px">📅 ${esc(ev.title)} · ${esc(frenchDate(ev.starts_at, false))}</p>
          <p style="margin:2px 0;font-size:13px">📍 ${esc(ev.location || "En ligne")}</p>`)}`);
      return json({ ok: true, sent });
    }

    // ── Inscription d'un participant annulée par l'organisateur ──
    if (type === "cancel_participant") {
      const { data: regs } = await admin.from("registrations")
        .select("user_id, guest_email, guest_name").eq("event_id", event_id).eq("user_id", user_id ?? "")
        .is("guest_email", null).limit(1);
      const sent = await sendToAll(regs, `Votre inscription annulée — ${ev.title}`, (name) => `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Votre inscription à <strong>${esc(ev.title)}</strong> a été annulée par l'organisateur.</p>
        ${eventBox(ev, dateStr)}
        <p style="color:${C.muted};font-size:14px">Si vous avez payé, un remboursement sera effectué dans les meilleurs délais.</p>`);
      return json({ ok: true, sent });
    }

    // ── Invitation bénévole ──
    if (type === "volunteer_invite") {
      const { data: vol } = await admin.from("volunteers")
        .select("name, email, token").eq("id", volunteer_id ?? "").eq("event_id", event_id).maybeSingle();
      if (!vol?.email) return json({ error: "Bénévole introuvable" }, 404);
      const url = `${SITE_URL}/volunteer/${encodeURIComponent(vol.token)}`;
      await sendBrevo({ email: vol.email, name: vol.name }, `Votre lien bénévole — ${ev.title}`, baseHtml(`
        <p>Bonjour <strong>${esc(vol.name)}</strong>,</p>
        <p>Vous avez été invité(e) en tant que <strong>bénévole</strong> à l'événement <strong>${esc(ev.title)}</strong>.</p>
        ${eventBox(ev, dateStr)}
        ${emailButton("Accéder à mon espace bénévole", url)}
        <p style="font-size:12px;color:${C.muted}">Ou copiez ce lien : <a href="${url}" style="color:${C.burgundy}">${url}</a></p>`, organizerEmail), organizerEmail);
      return json({ ok: true, sent: 1 });
    }

    return json({ error: "Type inconnu" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
