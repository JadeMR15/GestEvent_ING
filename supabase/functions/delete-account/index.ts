// @ts-nocheck — Deno runtime, ignoré par tsc
// Suppression du compte en libre-service (RGPD article 17, obligatoire pour l'App Store).
//
// Appelée par l'utilisateur connecté depuis Paramètres → Mes données, avec la confirmation
// « SUPPRIMER ». Le compte supprimé est toujours CELUI de l'appelant (jeton vérifié ici) :
// impossible de supprimer le compte de quelqu'un d'autre.
//
// Refusée (message expliqué) quand la suppression casserait les données des autres :
//   - organisateur qui a encore des événements : ON DELETE CASCADE sur events.organizer_id
//     supprimerait l'événement ET les billets de tous ses participants ;
//   - administrateur Plav' ou responsable d'une école : à transmettre d'abord.
//
// Sinon : fichiers personnels supprimés (photo de profil, justificatifs restants), puis le
// compte Auth. La base supprime en cascade le profil, les rôles, les inscriptions (les places
// à venir sont aussitôt proposées à la liste d'attente par le déclencheur), la liste
// d'attente, les likes, les abonnements et les notifications.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, cors, getCaller, json } from "../_shared/common.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const admin = adminClient();
    const caller = await getCaller(req, admin);
    if (!caller) return json({ error: "Connecte-toi pour supprimer ton compte." }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "SUPPRIMER") {
      return json({ error: "Tape SUPPRIMER pour confirmer la suppression." }, 400);
    }
    const uid = caller.id;

    // 1. Cas où la suppression toucherait d'autres personnes.
    const { count: eventCount } = await admin.from("events")
      .select("id", { count: "exact", head: true }).eq("organizer_id", uid);
    if ((eventCount ?? 0) > 0) {
      return json({
        error: `Tu organises encore ${eventCount} événement${eventCount > 1 ? "s" : ""}. Supprimer ton compte supprimerait aussi les billets de leurs participants : supprime ou transfère d'abord tes événements, ou écris-nous.`,
        code: "has_events",
      }, 409);
    }
    const { data: adminRole } = await admin.from("user_roles").select("role")
      .eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (adminRole) {
      return json({ error: "Un compte administrateur Plav' ne peut pas être supprimé ici : retire d'abord le rôle admin.", code: "is_admin" }, 409);
    }
    const { count: schoolCount } = await admin.from("school_admins")
      .select("user_id", { count: "exact", head: true }).eq("user_id", uid);
    if ((schoolCount ?? 0) > 0) {
      return json({ error: "Tu es responsable d'un espace école : transmets-le à une autre personne de l'école avant de supprimer ton compte.", code: "is_school_admin" }, 409);
    }

    // 2. Fichiers personnels (le stockage n'est pas supprimé en cascade avec le compte).
    const { data: profile } = await admin.from("profiles").select("avatar_path").eq("id", uid).maybeSingle();
    if (profile?.avatar_path) {
      await admin.storage.from("avatars").remove([profile.avatar_path]).catch(() => {});
    }
    const { data: docs } = await admin.storage.from("student-documents").list(uid, { limit: 100 });
    if (docs?.length) {
      await admin.storage.from("student-documents").remove(docs.map((d) => `${uid}/${d.name}`)).catch(() => {});
    }

    // 3. Le compte lui-même : le reste part en cascade dans la base.
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) {
      console.error("delete-account", uid, error.message);
      return json({ error: "La suppression a échoué. Réessaie, ou écris-nous pour que nous la fassions." }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account", e?.message ?? e);
    return json({ error: "Erreur inattendue. Réessaie dans un instant." }, 500);
  }
});
