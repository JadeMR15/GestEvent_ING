// Règles "fait maison" de vérification d'un justificatif étudiant.
// On reçoit le texte lu sur le document (PDF ou photo) et on vérifie 4 choses :
//   1. c'est bien un certificat de scolarité / une carte étudiante
//   2. le nom de l'école renseignée apparaît
//   3. le prénom et le nom de l'étudiant apparaissent
//   4. l'année scolaire en cours apparaît
// Aucun import "@/..." ici : ce fichier est aussi utilisé par la fonction serveur (dossier api/).

export type Decision = "verified" | "review" | "rejected";

export interface Check {
  ok: boolean;
  detail: string;
}

export interface VerificationResult {
  decision: Decision;
  message: string;
  checks: {
    documentType: Check;
    school: Check;
    name: Check;
    academicYear: Check;
  };
}

export interface StudentInfo {
  fullName: string;
  school: string;
}

/** Minuscules, sans accents, sans ponctuation : "Certificat de Scolarité" -> "certificat de scolarite". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nombre de lettres à changer pour passer d'un mot à l'autre (distance de Levenshtein). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// La lecture d'une photo fait parfois des fautes : on tolère quelques lettres fausses sur les mots longs.
function tolerance(word: string): number {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function containsWord(textWords: Set<string>, word: string): boolean {
  if (textWords.has(word)) return true;
  const tol = tolerance(word);
  if (tol === 0) return false;
  for (const w of textWords) {
    if (Math.abs(w.length - word.length) <= tol && editDistance(w, word) <= tol) return true;
  }
  return false;
}

// Mots trop génériques pour prouver une école précise.
const GENERIC_SCHOOL_WORDS = new Set([
  "ecole", "universite", "university", "institut", "institute", "school", "college", "lycee",
  "superieure", "superieur", "nationale", "national", "campus", "faculte", "groupe",
  "de", "des", "du", "la", "le", "les", "d", "l", "et", "en", "of", "the",
]);

const DOCUMENT_PHRASES = [
  "certificat de scolarite",
  "attestation de scolarite",
  "certificat d inscription",
  "attestation d inscription",
  "carte d etudiant",
  "carte etudiant",
  "carte etudiante",
  "carte d etudiante",
  "student card",
  "student id",
  "certificate of enrollment",
  "certificate of enrolment",
];
const DOCUMENT_WORDS = ["scolarite", "etudiant", "etudiante", "inscription", "inscrit", "inscrite"];

/** Année scolaire en cours : de septembre à août. En novembre 2026 -> 2026-2027. */
export function currentAcademicYear(now: Date): [number, number] {
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? [y, y + 1] : [y - 1, y]; // à partir d'août
}

function checkDocumentType(text: string, words: Set<string>): Check {
  const phrase = DOCUMENT_PHRASES.find((p) => text.includes(p));
  if (phrase) return { ok: true, detail: `Type de document reconnu (« ${phrase} »)` };
  const word = DOCUMENT_WORDS.find((w) => containsWord(words, w));
  if (word) return { ok: true, detail: `Mot-clé étudiant trouvé (« ${word} »)` };
  return { ok: false, detail: "Ce document ne ressemble pas à un certificat de scolarité ou une carte étudiante" };
}

function checkSchool(school: string, words: Set<string>): Check {
  const all = normalize(school).split(" ").filter(Boolean);
  if (all.length === 0) return { ok: false, detail: "Aucune école renseignée sur le profil" };
  const significant = all.filter((w) => !GENERIC_SCHOOL_WORDS.has(w) && w.length >= 2);
  const targets = significant.length > 0 ? significant : all;
  const found = targets.filter((w) => containsWord(words, w));
  // Au moins la moitié des mots importants du nom de l'école doivent apparaître.
  const ok = found.length > 0 && found.length / targets.length >= 0.5;
  return ok
    ? { ok, detail: `École « ${school} » trouvée sur le document` }
    : { ok, detail: `École « ${school} » introuvable sur le document` };
}

function checkName(fullName: string, words: Set<string>): Check {
  const parts = normalize(fullName).split(" ").filter((w) => w.length >= 2);
  if (parts.length === 0) return { ok: false, detail: "Aucun nom renseigné sur le profil" };
  const missing = parts.filter((w) => !containsWord(words, w));
  return missing.length === 0
    ? { ok: true, detail: "Prénom et nom trouvés sur le document" }
    : { ok: false, detail: `Nom incomplet sur le document (manquant : ${missing.join(", ")})` };
}

function checkAcademicYear(text: string, now: Date): Check {
  const [y1, y2] = currentAcademicYear(now);
  const short = String(y2).slice(2);
  // Après normalisation, "2026-2027" ou "2026/27" deviennent "2026 2027" / "2026 27".
  const pair = new RegExp(`\\b${y1} (${y2}|${short})\\b`);
  if (pair.test(text)) return { ok: true, detail: `Année scolaire ${y1}-${y2} trouvée` };
  return { ok: false, detail: `Année scolaire ${y1}-${y2} introuvable (document peut-être périmé)` };
}

export function verifyStudentDocument(rawText: string, student: StudentInfo, now = new Date()): VerificationResult {
  const text = normalize(rawText);
  const words = new Set(text.split(" ").filter(Boolean));

  const checks = {
    documentType: checkDocumentType(text, words),
    school: checkSchool(student.school, words),
    name: checkName(student.fullName, words),
    academicYear: checkAcademicYear(text, now),
  };

  if (text.length < 40) {
    return {
      decision: "rejected",
      message: "Document illisible. Envoie le PDF original ou une photo nette, bien cadrée et éclairée.",
      checks,
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  if (allOk) return { decision: "verified", message: "Ton compte est vérifié !", checks };

  if (checks.school.ok || checks.name.ok) {
    return {
      decision: "review",
      message: "Certains éléments n'ont pas pu être confirmés automatiquement. Un admin va vérifier ton document.",
      checks,
    };
  }

  return {
    decision: "rejected",
    message: "Ni ton nom ni ton école n'apparaissent sur ce document. Vérifie ton profil ou envoie un autre justificatif.",
    checks,
  };
}
