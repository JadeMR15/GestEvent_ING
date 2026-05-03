// @ts-nocheck — Deno runtime, ignoré par tsc
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "GestEvent <onboarding@resend.dev>", to: [to], subject, html }),
  });
}

function baseHtml(content: string) {
  return `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#2C2C2A">
    <div style="background:linear-gradient(135deg,#EED4D8,#C87488);padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <span style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#72243E">GestEvent</span>
    </div>
    <div style="background:#FDFAF7;padding:32px;border:1px solid #D5A0A8;border-top:none;border-radius:0 0 12px 12px">
      ${content}
    </div>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { type, event_id, subject, message } = await req.json();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const RESEND = Deno.env.get("RESEND_API_KEY")!;

    // Get event
    const { data: ev } = await admin.from("events").select("*").eq("id", event_id).single();
    if (!ev) throw new Error("Événement introuvable");

    const dateStr = new Date(ev.starts_at).toLocaleDateString("fr-FR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // ── Waitlist : notifier le 1er en liste ──
    if (type === "waitlist") {
      const { data: waiting } = await admin
        .from("registrations")
        .select("*, profiles(full_name)")
        .eq("event_id", event_id)
        .eq("status", "waitlisted")
        .order("registered_at")
        .limit(1);

      if (!waiting?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });

      const reg = waiting[0];
      const { data: authData } = await admin.auth.admin.getUserById(reg.user_id);
      const email = authData?.user?.email;
      const name = (reg.profiles as any)?.full_name || "Participant";
      if (!email) throw new Error("Email introuvable");

      await sendEmail(RESEND, email,
        `🎟️ Une place s'est libérée — ${ev.title}`,
        baseHtml(`
          <p>Bonjour <strong>${name}</strong>,</p>
          <p style="color:#72243E;font-weight:600">Une place vient de se libérer pour <strong>${ev.title}</strong> !</p>
          <div style="background:#EED4D8;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:4px 0">📅 <strong>${dateStr}</strong></p>
            <p style="margin:4px 0">📍 <strong>${ev.location || "En ligne"}</strong></p>
          </div>
          <p>Connectez-vous rapidement sur GestEvent pour confirmer votre inscription avant que la place ne soit prise par quelqu'un d'autre.</p>
          <p style="margin-top:24px;font-size:12px;color:#888">Ce message a été envoyé automatiquement par GestEvent.</p>
        `),
      );
      return new Response(JSON.stringify({ ok: true, sent: 1 }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── Rappel 24h ──
    if (type === "reminder") {
      const { data: regs } = await admin
        .from("registrations")
        .select("*, profiles(full_name)")
        .eq("event_id", event_id)
        .eq("status", "registered");

      let sent = 0;
      for (const reg of regs ?? []) {
        const { data: authData } = await admin.auth.admin.getUserById(reg.user_id);
        const email = authData?.user?.email;
        const name = (reg.profiles as any)?.full_name || "Participant";
        if (!email) continue;

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(reg.qr_code)}&size=200x200`;

        await sendEmail(RESEND, email,
          `⏰ Rappel : ${ev.title} — demain !`,
          baseHtml(`
            <p>Bonjour <strong>${name}</strong>,</p>
            <p>Un rappel amical : vous êtes inscrit(e) à <strong>${ev.title}</strong> qui a lieu <strong>demain</strong> !</p>
            <div style="background:#EED4D8;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:4px 0">📅 <strong>${dateStr}</strong></p>
              <p style="margin:4px 0">📍 <strong>${ev.location || "En ligne"}</strong></p>
            </div>
            <p style="text-align:center;margin:16px 0">Votre QR code d'entrée :</p>
            <div style="text-align:center;background:#fff;padding:12px;border-radius:8px;border:1px solid #D5A0A8">
              <img src="${qrUrl}" width="160" height="160" alt="QR code" />
              <p style="font-family:monospace;font-size:10px;color:#aaa;margin:6px 0 0">${reg.qr_code}</p>
            </div>
            <p style="margin-top:16px;font-size:12px;color:#888">À demain !</p>
          `),
        );
        sent++;
      }
      return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── Annulation événement ──
    if (type === "cancellation") {
      const { data: regs } = await admin
        .from("registrations")
        .select("*, profiles(full_name)")
        .eq("event_id", event_id)
        .in("status", ["registered", "waitlisted"]);

      let sent = 0;
      for (const reg of regs ?? []) {
        const { data: authData } = await admin.auth.admin.getUserById(reg.user_id);
        const email = authData?.user?.email;
        const name = (reg.profiles as any)?.full_name || "Participant";
        if (!email) continue;

        await sendEmail(RESEND, email,
          `❌ Événement annulé — ${ev.title}`,
          baseHtml(`
            <p>Bonjour <strong>${name}</strong>,</p>
            <p style="color:#C87488;font-weight:600">L'événement <strong>${ev.title}</strong> a été annulé par l'organisateur.</p>
            <div style="background:#EED4D8;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:4px 0">📅 ${dateStr}</p>
              <p style="margin:4px 0">📍 ${ev.location || "En ligne"}</p>
            </div>
            <p>Votre inscription a été automatiquement annulée. Nous sommes désolés pour la gêne occasionnée.</p>
            <p style="margin-top:16px;font-size:12px;color:#888">L'équipe GestEvent</p>
          `),
        );
        sent++;
      }
      // Fermer l'événement
      await admin.from("events").update({ status: "closed" }).eq("id", event_id);

      return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── Message personnalisé ──
    if (type === "custom") {
      const { data: regs } = await admin
        .from("registrations")
        .select("*, profiles(full_name)")
        .eq("event_id", event_id)
        .in("status", ["registered", "attended"]);

      let sent = 0;
      for (const reg of regs ?? []) {
        const { data: authData } = await admin.auth.admin.getUserById(reg.user_id);
        const email = authData?.user?.email;
        const name = (reg.profiles as any)?.full_name || "Participant";
        if (!email) continue;

        await sendEmail(RESEND, email,
          subject || `Message de l'organisateur — ${ev.title}`,
          baseHtml(`
            <p>Bonjour <strong>${name}</strong>,</p>
            <div style="background:#fff;border:1px solid #D5A0A8;border-radius:8px;padding:20px;margin:16px 0;white-space:pre-line">
              ${(message || "").replace(/\n/g, "<br/>")}
            </div>
            <div style="background:#EED4D8;border-radius:8px;padding:12px;margin-top:16px">
              <p style="margin:2px 0;font-size:13px">📅 ${ev.title} · ${new Date(ev.starts_at).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</p>
              <p style="margin:2px 0;font-size:13px">📍 ${ev.location || "En ligne"}</p>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#888">Message envoyé par l'organisateur via GestEvent.</p>
          `),
        );
        sent++;
      }
      return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Type inconnu" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
