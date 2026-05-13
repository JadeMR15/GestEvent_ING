// @ts-nocheck — Deno runtime, ignoré par tsc
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { toEmail, fullName, eventTitle, eventDate, eventLocation, replyTo } = await req.json();

    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY non configurée");

    const organizerEmail: string | undefined = replyTo || undefined;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "GuestEvent", email: "olivia.peret@esme.fr" },
        to: [{ email: toEmail, name: fullName }],
        subject: `Événement annulé — ${eventTitle}`,
        ...(organizerEmail && { replyTo: { email: organizerEmail } }),
        htmlContent: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#2C2C2A">
            <div style="background:linear-gradient(135deg,#EED4D8,#C87488);padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="font-family:Georgia,serif;font-size:28px;color:#72243E;margin:0">
                Événement annulé
              </h1>
            </div>
            <div style="background:#FDFAF7;padding:32px;border:1px solid #D5A0A8;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 8px">Bonjour <strong>${fullName}</strong>,</p>
              <p style="margin:0 0 24px">Nous vous informons que l'événement auquel vous étiez inscrit(e) a été <strong>annulé</strong>.</p>
              <div style="background:#EED4D8;border-radius:8px;padding:16px;margin-bottom:24px">
                <p style="margin:4px 0;font-size:18px;font-weight:600;color:#72243E">${eventTitle}</p>
                <p style="margin:8px 0 4px">📅 ${eventDate}</p>
                <p style="margin:4px 0">📍 ${eventLocation}</p>
              </div>
              <p style="color:#666;font-size:14px">
                Votre inscription a été automatiquement annulée. Si vous avez payé, un remboursement sera effectué dans les meilleurs délais.
              </p>
              <p style="margin-top:24px;font-size:13px;color:#888;text-align:center">
                Nous nous excusons pour la gêne occasionnée · GuestEvent
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
