// @ts-nocheck — Deno runtime, ignoré par tsc
// Vérification par adresse email d'école.
//   request  (étudiant connecté) : domaine connu → lien de confirmation par email ;
//                                  domaine inconnu → demande d'ajout pour les admins.
//   confirm  (lien de l'email)   : jeton valable 24 h, usage unique → compte vérifié.
//   approve_domain / reject_domain (admins) : décision sur une demande d'ajout,
//                                  l'étudiant est prévenu par email dans les deux cas.
// Sécurité : le jeton n'est jamais stocké en clair (SHA-256) ; le domaine est
// contrôlé côté serveur à l'envoi ET au clic ; une adresse = un seul compte.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, esc, frenchDate, getCaller, isAdmin, json, sendBrevo } from "../_shared/common.ts";
import { C, emailLayout, infoBox } from "../_shared/email-layout.ts";

// Les liens des emails pointent toujours vers le site en ligne : une adresse locale
// (localhost) est inaccessible pour l'antivirus des messageries, qui bloque alors l'email.
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app").replace(/\/$/, "");
const MAX_LINKS_PER_HOUR = 5;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Crée un jeton (les anciens liens de l'étudiant ne marchent plus) et envoie l'email de confirmation. */
async function sendConfirmationLink(admin, userId: string, email: string, school: string, intro?: string) {
  await admin.from("school_email_tokens").update({ used_at: new Date().toISOString() })
    .eq("user_id", userId).is("used_at", null);

  const token = newToken();
  const { data: row, error } = await admin.from("school_email_tokens")
    .insert({ user_id: userId, email, token_hash: await sha256(token) })
    .select("expires_at").single();
  if (error) throw new Error(error.message);

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const name = profile?.full_name || "";
  const url = `${SITE_URL}/confirmer-ecole?token=${encodeURIComponent(token)}`;

  await sendBrevo({ email, name: name || undefined }, `Confirme ton adresse ${school} sur Plav'`, emailLayout({
    title: "Confirme ton adresse d'école",
    content: `
      <p>Bonjour${name ? ` <strong>${esc(name)}</strong>` : ""},</p>
      ${intro ?? ""}
      <p>Clique sur le bouton ci-dessous pour confirmer que <strong>${esc(email)}</strong> est bien ton adresse
      et obtenir la mention <strong>« Fait partie de ${esc(school)} »</strong>.</p>
      <p style="color:${C.muted};font-size:13px">Ce lien est valable jusqu'au ${esc(frenchDate(row.expires_at))} et ne fonctionne qu'une fois.
      Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>`,
    button: { label: "Confirmer mon adresse", url },
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── Clic sur le lien reçu par email (pas besoin d'être connecté) ──
    if (action === "confirm") {
      if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 100) {
        return json({ error: "Lien invalide." }, 400);
      }
      const { data, error } = await admin.rpc("consume_school_email_token", { _token_hash: await sha256(body.token) });
      if (error) {
        if (String(error.message).includes("profiles_school_email_unique")) {
          return json({ error: "Cette adresse vérifie déjà un autre compte Plav'." }, 409);
        }
        return json({ error: "Confirmation impossible. Réessaie plus tard." }, 500);
      }
      if (!data?.ok) {
        const messages = {
          invalid_token: "Ce lien a expiré ou a déjà été utilisé. Redemande un lien depuis la page Vérifier mon compte.",
          domain_not_recognized: "Le domaine de cette adresse n'est plus reconnu. Utilise le justificatif à la place.",
          email_in_use: "Cette adresse vérifie déjà un autre compte Plav'.",
        };
        return json({ error: messages[data?.error] ?? "Confirmation impossible." }, 400);
      }
      return json({ ok: true, school: data.school });
    }

    const caller = await getCaller(req, admin);
    if (!caller) return json({ error: "Non connecté" }, 401);

    // ── L'étudiant saisit son adresse d'école ──
    if (action === "request") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (email.length > 254) return json({ error: "Adresse trop longue." }, 400);

      const { data: cls, error: clsErr } = await admin.rpc("classify_school_email", { _email: email });
      if (clsErr) return json({ error: "Vérification du domaine impossible." }, 500);
      if (cls.kind === "invalid") return json({ error: "Adresse email invalide." }, 400);
      if (cls.kind === "public") {
        return json({ error: "Une messagerie personnelle (Gmail, Outlook…) ne prouve pas ton école. Utilise l'adresse fournie par ton école, ou le justificatif." }, 400);
      }

      if (cls.kind === "unknown") {
        const { error } = await admin.from("school_domain_requests").upsert({
          user_id: caller.id, email, domain: cls.domain, status: "pending",
          admin_note: null, decided_at: null, decided_by: null, created_at: new Date().toISOString(),
        }, { onConflict: "user_id,domain" });
        if (error) return json({ error: "Demande impossible. Réessaie plus tard." }, 500);
        return json({ status: "unknown", domain: cls.domain });
      }

      // Domaine connu.
      const { data: taken } = await admin.from("profiles").select("id")
        .eq("verification_method", "school_email").ilike("school_email", email).neq("id", caller.id).limit(1);
      if (taken?.length) return json({ error: "Cette adresse vérifie déjà un autre compte Plav'." }, 409);

      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const { count } = await admin.from("school_email_tokens").select("id", { count: "exact", head: true })
        .eq("user_id", caller.id).gte("created_at", since);
      if ((count ?? 0) >= MAX_LINKS_PER_HOUR) {
        return json({ error: "Trop de demandes. Réessaie dans une heure." }, 429);
      }

      await sendConfirmationLink(admin, caller.id, email, cls.school);
      return json({ status: "sent", school: cls.school });
    }

    // ── Décisions des admins sur les demandes d'ajout de domaine ──
    if (action === "approve_domain" || action === "reject_domain") {
      if (!(await isAdmin(admin, caller.id))) return json({ error: "Réservé aux admins" }, 403);

      const { data: request } = await admin.from("school_domain_requests")
        .select("*").eq("id", String(body.request_id ?? "")).maybeSingle();
      if (!request) return json({ error: "Demande introuvable" }, 404);
      const now = new Date().toISOString();

      if (action === "reject_domain") {
        const note = String(body.note ?? "").trim().slice(0, 300);
        if (!note) return json({ error: "Indique la raison du refus : l'étudiant la verra." }, 400);
        await admin.from("school_domain_requests")
          .update({ status: "rejected", admin_note: note, decided_at: now, decided_by: caller.id })
          .eq("id", request.id);
        try {
          // Adresse du compte : l'adresse d'école saisie n'a pas été prouvée.
          const { data: u } = await admin.auth.admin.getUserById(request.user_id);
          if (!u?.user?.email) return json({ ok: true });
          await sendBrevo({ email: u.user.email }, "Ton école n'a pas pu être ajoutée sur Plav'", emailLayout({
            title: "Domaine non ajouté",
            content: `
              <p>Bonjour,</p>
              <p>Nous n'avons pas pu reconnaître <strong>${esc(request.domain)}</strong> comme domaine d'école.</p>
              ${infoBox(esc(note))}
              <p>Tu peux vérifier ton compte avec ton certificat de scolarité ou ta carte étudiante.</p>`,
            button: { label: "Envoyer un justificatif", url: `${SITE_URL}/verification` },
          }));
        } catch (e) {
          console.error("email refus", e.message);
        }
        return json({ ok: true });
      }

      // Validation : le domaine retenu peut être plus large (etu.ecole.fr → ecole.fr).
      const school = String(body.school_name ?? "").trim().slice(0, 120);
      const domain = String(body.domain ?? request.domain).trim().toLowerCase();
      if (school.length < 2) return json({ error: "Nom de l'école requis." }, 400);
      if (request.domain !== domain && !request.domain.endsWith(`.${domain}`)) {
        return json({ error: `Le domaine doit couvrir ${request.domain}.` }, 400);
      }
      const { error: domErr } = await admin.from("school_domains")
        .upsert({ school_name: school, domain, active: true }, { onConflict: "domain" });
      if (domErr) {
        const msg = String(domErr.message).includes("public_email_domain")
          ? "Une messagerie grand public ne peut pas être un domaine d'école."
          : "Domaine invalide.";
        return json({ error: msg }, 400);
      }

      // Toutes les demandes en attente couvertes par ce domaine sont validées et prévenues.
      const { data: pending } = await admin.from("school_domain_requests").select("*").eq("status", "pending");
      const covered = (pending ?? []).filter((r) => r.domain === domain || r.domain.endsWith(`.${domain}`));
      let notified = 0;
      for (const r of covered) {
        await admin.from("school_domain_requests")
          .update({ status: "approved", decided_at: now, decided_by: caller.id }).eq("id", r.id);
        try {
          await sendConfirmationLink(admin, r.user_id, r.email, school,
            `<p>Bonne nouvelle : <strong>${esc(school)}</strong> est maintenant reconnue sur Plav'.</p>`);
          notified++;
        } catch (e) {
          console.error("email validation domaine", r.id, e.message);
        }
      }
      return json({ ok: true, notified });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
