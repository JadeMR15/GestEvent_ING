// @ts-nocheck — Deno runtime, ignoré par tsc
// Notifications push (Web Push) : envoie la file push_outbox aux appareils abonnés.
// Appelée par la base (pg_net) dès qu'une notification est mise en file, et chaque minute
// en filet de sécurité. Les abonnements expirés (404 / 410) sont supprimés.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { adminClient, cors, json } from "../_shared/common.ts";

const PUBLIC_KEY = "BAoXvQmzlbKXVVIjHs4NQQXQaS8MRVmIjfeF_SDNozwuGUFSOAU1SicdNa6DZagUNooSioEIdQ6xh5Yv-xBSOx4";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = adminClient();
    const given = req.headers.get("x-webhook-secret");
    const { data: ok } = given ? await admin.rpc("check_email_webhook_secret", { _secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Non autorisé" }, 401);

    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!privateKey) return json({ error: "VAPID_PRIVATE_KEY non configurée" }, 500);
    webpush.setVapidDetails(SITE_URL, PUBLIC_KEY, privateKey);

    let sent = 0;
    const expired: string[] = [];
    const used: string[] = [];
    // Plusieurs lots si la file est longue.
    for (let round = 0; round < 5; round++) {
      const { data: items, error } = await admin.rpc("claim_push_outbox", { _limit: 100 });
      if (error) return json({ error: error.message }, 500);
      if (!items?.length) break;

      await Promise.all(items.flatMap((n) => (n.subscriptions ?? []).map(async (s) => {
        const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag });
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: "high", topic: n.tag ? n.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined },
          );
          used.push(s.id);
          sent++;
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) expired.push(s.id);
          else console.error("push échoué", e?.statusCode, e?.body ?? e?.message);
        }
      })));
    }

    if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
    if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used);
    return json({ ok: true, sent, expired: expired.length });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
