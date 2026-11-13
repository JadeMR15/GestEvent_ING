// Côté serveur uniquement : récupère le texte d'un justificatif.
// - PDF : le texte est lu directement (rapide et fiable pour un PDF généré par l'école).
// - Photo : reconnaissance de caractères (OCR) avec Tesseract, en français et anglais.
import { createWorker } from "tesseract.js";
import { extractText, getDocumentProxy } from "unpdf";

export const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export async function extractDocumentText(data: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  const worker = await createWorker(["fra", "eng"], 1, {
    // Seul /tmp est accessible en écriture sur Vercel.
    cachePath: "/tmp/tesseract",
  });
  try {
    const { data: result } = await worker.recognize(Buffer.from(data), { rotateAuto: true });
    return result.text;
  } finally {
    await worker.terminate();
  }
}
