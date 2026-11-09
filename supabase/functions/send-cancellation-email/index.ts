// @ts-nocheck — Deno runtime, ignoré par tsc
// Désactivée : elle acceptait n'importe quel destinataire sans connexion.
// L'annulation d'un événement passe maintenant par send-event-emails (type "cancellation"),
// réservée à l'organisateur.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { cors, json } from "../_shared/common.ts";

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  return json({ error: "Fonction désactivée : utilisez send-event-emails" }, 410);
});
