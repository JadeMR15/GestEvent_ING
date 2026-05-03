// @ts-nocheck — Deno runtime, ignoré par tsc
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { toEmail, fullName, eventTitle, eventDate, eventLocation, qrCode } = await req.json();

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY non configurée");

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=250x250`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GestEvent <onboarding@resend.dev>",
        to: [toEmail],
        subject: `🎟️ Votre billet — ${eventTitle}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#2C2C2A">
            <div style="background:linear-gradient(135deg,#EED4D8,#C87488);padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="font-family:Georgia,serif;font-size:32px;font-style:italic;color:#72243E;margin:0">
                ${eventTitle}
              </h1>
            </div>
            <div style="background:#FDFAF7;padding:32px;border:1px solid #D5A0A8;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 8px">Bonjour <strong>${fullName}</strong>,</p>
              <p style="margin:0 0 24px;color:#72243E">Votre inscription est confirmée !</p>
              <div style="background:#EED4D8;border-radius:8px;padding:16px;margin-bottom:24px">
                <p style="margin:4px 0">📅 <strong>${eventDate}</strong></p>
                <p style="margin:4px 0">📍 <strong>${eventLocation}</strong></p>
              </div>
              <p style="text-align:center;font-weight:500;margin-bottom:12px">Votre QR code d'entrée :</p>
              <div style="text-align:center;background:#fff;padding:16px;border-radius:8px;border:1px solid #D5A0A8">
                <img src="${qrImageUrl}" width="200" height="200" alt="QR code" style="display:block;margin:0 auto" />
                <p style="font-family:monospace;font-size:11px;color:#888;margin:8px 0 0">${qrCode}</p>
              </div>
              <p style="margin-top:24px;font-size:13px;color:#888;text-align:center">
                Présentez ce QR code à l'entrée · GestEvent
              </p>
            </div>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: res.ok ? 200 : 400,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
