// Fonction serveur Vercel : POST /api/verify-student
// 1. vérifie qui appelle (jeton de connexion Supabase)
// 2. télécharge le justificatif depuis l'espace privé "student-documents"
// 3. lit le texte puis applique les règles fait maison
// 4. enregistre le résultat sur le profil (seul le serveur et les admins peuvent le faire)
import { createClient } from "@supabase/supabase-js";
import { ACCEPTED_TYPES, extractDocumentText } from "../src/lib/student-verification/extract-text.js";
import { verifyStudentDocument } from "../src/lib/student-verification/rules.js";

const BUCKET = "student-documents";
const MAX_ATTEMPTS = 5; // au-delà, le dossier part directement en relecture admin
const MAX_BYTES = 10 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: "Configuration serveur manquante" }, 500);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non connecté" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Session invalide" }, 401);
  const userId = userData.user.id;

  let path: unknown;
  try {
    ({ path } = await request.json());
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  // Un étudiant ne peut faire vérifier qu'un fichier rangé dans son propre dossier.
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) {
    return json({ error: "Chemin de fichier invalide" }, 400);
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("full_name, school, verification_status, verification_attempts, student_doc_path")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) return json({ error: "Profil introuvable" }, 404);
  if (profile.verification_status === "verified") return json({ status: "verified", message: "Compte déjà vérifié" });

  const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(path);
  if (dlErr || !file) return json({ error: "Document introuvable, renvoie-le" }, 404);
  if (file.size > MAX_BYTES) return json({ error: "Fichier trop lourd (10 Mo max)" }, 400);
  const mime = file.type;
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mime)) {
    return json({ error: "Format non accepté (PDF, JPG, PNG ou WebP)" }, 400);
  }

  // Un nouvel envoi remplace l'ancien document en attente.
  if (profile.student_doc_path && profile.student_doc_path !== path) {
    await admin.storage.from(BUCKET).remove([profile.student_doc_path]);
  }

  const attempts = (profile.verification_attempts ?? 0) + 1;
  await admin.from("profiles").update({ verification_status: "pending", verification_attempts: attempts }).eq("id", userId);

  let text = "";
  try {
    text = await extractDocumentText(new Uint8Array(await file.arrayBuffer()), mime);
  } catch (e) {
    console.error("extract-text failed", e);
  }

  const result = verifyStudentDocument(text, { fullName: profile.full_name, school: profile.school ?? "" });
  // Trop d'essais : on ne laisse plus la machine décider, un admin regarde.
  if (result.decision !== "verified" && attempts >= MAX_ATTEMPTS) {
    result.decision = "review";
    result.message = "Trop de tentatives : un admin va vérifier ton document.";
  }

  // On ne garde le document que s'il doit être relu par un admin.
  const keepDocument = result.decision === "review";
  await admin
    .from("profiles")
    .update({
      verification_status: result.decision,
      verification_note: result.message,
      verification_checks: result.checks,
      verified_at: result.decision === "verified" ? new Date().toISOString() : null,
      student_doc_path: keepDocument ? path : null,
    })
    .eq("id", userId);
  if (!keepDocument) await admin.storage.from(BUCKET).remove([path]);

  return json({ status: result.decision, message: result.message, checks: result.checks });
}
