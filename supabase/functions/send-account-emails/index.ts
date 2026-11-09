// @ts-nocheck — Deno runtime, ignoré par tsc
// Emails liés au compte, déclenchés par la base de données (pas par le navigateur) :
//   - compte vérifié / justificatif refusé / dossier en relecture -> à l'étudiant
//   - dossier en relecture -> à tous les admins
// Sécurité : la base envoie un secret généré et stocké dans le coffre Supabase (Vault).
// On le compare via une fonction SQL réservée au serveur ; personne d'autre ne le connaît.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, json, sendBrevo } from "../_shared/common.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

function layout(title: string, content: string, button?: { label: string; url: string }) {
  const cta = button
    ? `<div style="text-align:center;margin:28px 0 8px">
        <a href="${button.url}" style="background:linear-gradient(135deg,#C87488,#6B0F2C);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:15px">${esc(button.label)}</a>
      </div>`
    : "";
  return `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#2C2C2A">
    <div style="background:linear-gradient(135deg,#EED4D8,#C87488);padding:28px;border-radius:12px 12px 0 0;text-align:center">
      <span style="font-family:Georgia,serif;font-size:26px;font-style:italic;color:#6B0F2C">${esc(title)}</span>
    </div>
    <div style="background:#FDFAF7;padding:32px;border:1px solid #D5A0A8;border-top:none;border-radius:0 0 12px 12px">
      ${content}
      ${cta}
      <p style="margin-top:24px;font-size:12px;color:#888;text-align:center">Plav' · la billetterie étudiante</p>
    </div>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();

    const secret = req.headers.get("x-webhook-secret") ?? "";
    const { data: valid } = await admin.rpc("check_email_webhook_secret", { _secret: secret });
    if (valid !== true) return json({ error: "Non autorisé" }, 401);

    const { type, user_id, status, note } = await req.json();
    if (type !== "verification" || typeof user_id !== "string") return json({ error: "Requête invalide" }, 400);

    const { data: authData } = await admin.auth.admin.getUserById(user_id);
    const email = authData?.user?.email;
    const { data: profile } = await admin.from("profiles").select("full_name, school").eq("id", user_id).maybeSingle();
    const name = profile?.full_name || "toi";
    let sent = 0;

    if (email && status === "verified") {
      await sendBrevo({ email, name }, "✅ Ton compte Plav' est vérifié", layout("Compte vérifié 🎉", `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Ton statut étudiant est confirmé. Tu peux maintenant t'inscrire aux événements
        et, si tu es organisateur, en créer.</p>`, { label: "Voir les événements", url: `${SITE_URL}/events` }));
      sent++;
    }

    if (email && status === "rejected") {
      await sendBrevo({ email, name }, "Ton justificatif Plav' n'a pas été validé", layout("Justificatif refusé", `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Nous n'avons pas pu valider ton justificatif étudiant.</p>
        ${note ? `<div style="background:#EED4D8;border-radius:8px;padding:16px;margin:16px 0">${esc(note)}</div>` : ""}
        <p>Vérifie que ton nom et ton école sont écrits comme sur le document, puis renvoie un certificat
        de scolarité de cette année (le PDF de ton école est l'idéal).</p>`,
        { label: "Renvoyer un justificatif", url: `${SITE_URL}/verification` }));
      sent++;
    }

    if (status === "review") {
      if (email) {
        await sendBrevo({ email, name }, "Ton justificatif Plav' est en cours de vérification", layout("Vérification en cours", `
          <p>Bonjour <strong>${esc(name)}</strong>,</p>
          <p>Ton document n'a pas pu être validé automatiquement : un admin va le regarder.
          Tu recevras un email dès que c'est fait.</p>`));
        sent++;
      }

      // Prévenir tous les admins.
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) {
        const { data: ad } = await admin.auth.admin.getUserById(a.user_id);
        if (!ad?.user?.email) continue;
        await sendBrevo({ email: ad.user.email }, `📄 Nouveau justificatif à vérifier — ${profile?.full_name || "étudiant"}`,
          layout("Justificatif à vérifier", `
            <p>Un nouveau justificatif attend ta décision.</p>
            <div style="background:#EED4D8;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:4px 0">👤 <strong>${esc(profile?.full_name || "Sans nom")}</strong></p>
              <p style="margin:4px 0">🎓 ${esc(profile?.school || "École non renseignée")}</p>
              ${note ? `<p style="margin:4px 0;font-size:13px;color:#666">${esc(note)}</p>` : ""}
            </div>`, { label: "Ouvrir les vérifications", url: `${SITE_URL}/admin/verifications` }));
        sent++;
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
