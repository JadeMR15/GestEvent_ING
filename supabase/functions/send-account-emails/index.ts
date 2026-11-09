// @ts-nocheck — Deno runtime, ignoré par tsc
// Emails liés au compte, déclenchés par la base de données (pas par le navigateur) :
//   - compte vérifié / justificatif refusé / dossier en relecture -> à l'étudiant
//   - dossier en relecture -> à tous les admins
// Sécurité : la base envoie un secret généré et stocké dans le coffre Supabase (Vault).
// On le compare via une fonction SQL réservée au serveur ; personne d'autre ne le connaît.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, json, sendBrevo } from "../_shared/common.ts";
import { emailLayout, infoBox } from "../_shared/email-layout.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

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
      await sendBrevo({ email, name }, "✅ Ton compte Plav' est vérifié", emailLayout({ title: "Compte vérifié 🎉", content: `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Ton statut étudiant est confirmé. Tu peux maintenant t'inscrire aux événements
        et, si tu es organisateur, en créer.</p>`, button: { label: "Voir les événements", url: `${SITE_URL}/events` } }));
      sent++;
    }

    if (email && status === "rejected") {
      await sendBrevo({ email, name }, "Ton justificatif Plav' n'a pas été validé", emailLayout({ title: "Justificatif refusé", content: `
        <p>Bonjour <strong>${esc(name)}</strong>,</p>
        <p>Nous n'avons pas pu valider ton justificatif étudiant.</p>
        ${note ? infoBox(esc(note)) : ""}
        <p>Vérifie que ton nom et ton école sont écrits comme sur le document, puis renvoie un certificat
        de scolarité de cette année (le PDF de ton école est l'idéal).</p>`,
        button: { label: "Renvoyer un justificatif", url: `${SITE_URL}/verification` } }));
      sent++;
    }

    if (status === "review") {
      if (email) {
        await sendBrevo({ email, name }, "Ton justificatif Plav' est en cours de vérification", emailLayout({ title: "Vérification en cours", content: `
          <p>Bonjour <strong>${esc(name)}</strong>,</p>
          <p>Ton document n'a pas pu être validé automatiquement : un admin va le regarder.
          Tu recevras un email dès que c'est fait.</p>` }));
        sent++;
      }

      // Prévenir tous les admins.
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) {
        const { data: ad } = await admin.auth.admin.getUserById(a.user_id);
        if (!ad?.user?.email) continue;
        await sendBrevo({ email: ad.user.email }, `📄 Nouveau justificatif à vérifier — ${profile?.full_name || "étudiant"}`,
          emailLayout({ title: "Justificatif à vérifier", content: `
            <p>Un nouveau justificatif attend ta décision.</p>
            ${infoBox(`
              <p style="margin:4px 0">👤 <strong>${esc(profile?.full_name || "Sans nom")}</strong></p>
              <p style="margin:4px 0">🎓 ${esc(profile?.school || "École non renseignée")}</p>
              ${note ? `<p style="margin:4px 0;font-size:13px">${esc(note)}</p>` : ""}`)}`,
            button: { label: "Ouvrir les vérifications", url: `${SITE_URL}/admin/verifications` } }));
        sent++;
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
