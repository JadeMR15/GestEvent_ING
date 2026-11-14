// @ts-nocheck — Deno runtime, ignoré par tsc
// Code partagé par les fonctions d'envoi d'email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Échappe le texte saisi par les utilisateurs avant de le mettre dans un email HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Utilisateur connecté qui appelle la fonction, ou null. */
export async function getCaller(req: Request, admin: ReturnType<typeof adminClient>) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function isAdmin(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

/** Date lisible à l'heure de Paris (le serveur est en UTC). */
export function frenchDate(iso: string, withTime = true) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit" }),
  });
}

export async function sendBrevo(to: { email: string; name?: string }, subject: string, html: string, replyTo?: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY non configurée");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      // L'adresse doit appartenir à un domaine authentifié dans Brevo (SPF/DKIM),
      // sinon les messageries qui appliquent DMARC (esme.fr, Gmail…) rejettent l'email.
      sender: {
        name: Deno.env.get("BREVO_SENDER_NAME") ?? "Plav'",
        email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "olivia.peret@esme.fr",
      },
      to: [to.name ? to : { email: to.email }],
      subject,
      htmlContent: html,
      ...(replyTo && { replyTo: { email: replyTo } }),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Brevo : ${body.message ?? res.status}`);
  }
}
