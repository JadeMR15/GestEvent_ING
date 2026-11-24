// Encodage des images avant envoi. Safari ne sait pas produire du WebP depuis un canvas :
// il renvoie silencieusement un PNG, très lourd et refusé par nos stockages. On encode donc
// en WebP quand le navigateur le permet, sinon en JPEG.
let webp: boolean | null = null;

export function canEncodeWebp(): boolean {
  if (webp === null) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webp;
}

/** Image du canvas en WebP (ou JPEG sur Safari), à la qualité demandée (0 à 1). */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  return blob;
}

/** Extension de fichier qui correspond à l'image produite. */
export function imageExt(blob: Blob): "webp" | "jpg" {
  return blob.type === "image/webp" ? "webp" : "jpg";
}

/**
 * Photo prête à l'envoi : redimensionnée (côté le plus long ≤ maxSide) et recompressée
 * en WebP (JPEG sur Safari). Une photo de téléphone de 3 à 8 Mo passe à quelques centaines
 * de Ko, ce qui accélère l'envoi et surtout l'affichage pour tous les visiteurs.
 * GIF animés, formats non lisibles par le navigateur (HEIC hors Safari) ou erreur :
 * le fichier d'origine est renvoyé tel quel.
 */
export async function compressPhoto(file: File, maxSide = 1920, quality = 0.8): Promise<{ blob: Blob; ext: string }> {
  const original = { blob: file as Blob, ext: (file.name.split(".").pop() || "jpg").toLowerCase() };
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return original;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await encodeCanvas(canvas, quality);
    // Garde l'original s'il était déjà plus léger (petite image déjà optimisée).
    return blob.size < file.size ? { blob, ext: imageExt(blob) } : original;
  } catch {
    return original;
  }
}
