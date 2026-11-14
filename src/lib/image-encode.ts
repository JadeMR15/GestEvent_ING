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
