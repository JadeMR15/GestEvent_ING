import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Move, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { encodeCanvas } from "@/lib/image-encode";
import { toast } from "sonner";

interface Props {
  /** Image choisie ; la fenêtre s'ouvre quand elle est renseignée. */
  file: File | null;
  /** Rapport largeur / hauteur du cadre (1 = carré, 3 = bannière). */
  aspect: number;
  /** Aperçu rond (photo de profil) ou rectangulaire. */
  round?: boolean;
  /** Largeur de l'image produite, en pixels (réduite si la photo est plus petite). */
  outputWidth: number;
  title: string;
  description?: string;
  onCancel: () => void;
  /** Image recadrée (WebP, ou JPEG sur Safari), sans les métadonnées de la photo d'origine (lieu GPS…). */
  onConfirm: (blob: Blob) => Promise<void> | void;
}

const MAX_ZOOM = 4;

/** Recadrage : on déplace la photo dans le cadre et on zoome (molette, pincement ou curseur). */
export function ImageCropDialog({ file, aspect, round = false, outputWidth, title, description, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  // Élément du cadre (ref « callback ») : mesuré dès qu'il existe, même si la fenêtre
  // s'affiche après le chargement de la photo.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Image : lecture et taille d'origine.
  useEffect(() => {
    if (!file) { setUrl(null); setNat(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    setZoom(1);
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Taille du cadre (s'adapte à l'écran).
  useLayoutEffect(() => {
    if (!frameEl) return;
    const update = () => setFrame({ w: frameEl.clientWidth, h: frameEl.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  // Échelle qui couvre tout le cadre, puis zoom.
  const base = nat && frame.w ? Math.max(frame.w / nat.w, frame.h / nat.h) : 1;
  const scale = base * zoom;
  const dispW = (nat?.w ?? 0) * scale;
  const dispH = (nat?.h ?? 0) * scale;

  const clamp = useCallback((x: number, y: number, w = dispW, h = dispH) => ({
    x: Math.min(0, Math.max(frame.w - w, x)),
    y: Math.min(0, Math.max(frame.h - h, y)),
  }), [dispW, dispH, frame.w, frame.h]);

  // Photo centrée à l'ouverture.
  useEffect(() => {
    if (!nat || !frame.w) return;
    const s = Math.max(frame.w / nat.w, frame.h / nat.h);
    setPos({ x: (frame.w - nat.w * s) / 2, y: (frame.h - nat.h * s) / 2 });
  }, [nat, frame.w, frame.h]);

  // Zoom autour du centre du cadre.
  const applyZoom = useCallback((next: number) => {
    if (!nat) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const cx = frame.w / 2, cy = frame.h / 2;
    const ratio = z / zoom;
    const nw = nat.w * base * z, nh = nat.h * base * z;
    const x = cx - (cx - pos.x) * ratio;
    const y = cy - (cy - pos.y) * ratio;
    setZoom(z);
    setPos({ x: Math.min(0, Math.max(frame.w - nw, x)), y: Math.min(0, Math.max(frame.h - nh, y)) });
  }, [nat, frame.w, frame.h, zoom, base, pos.x, pos.y]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      applyZoom(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
      return;
    }
    if (drag.current) setPos(clamp(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y));
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  async function confirm() {
    if (!file || !nat) return;
    setBusy(true);
    try {
      // Taille réelle du cadre au moment d'enregistrer (au cas où la mesure n'aurait pas suivi).
      const fw = frame.w || frameEl?.clientWidth || 0;
      const fh = frame.h || frameEl?.clientHeight || 0;
      if (!fw || !fh) throw new Error("Le cadre n'est pas prêt : réessaie dans un instant.");
      const sc = (frame.w ? base : Math.max(fw / nat.w, fh / nat.h)) * zoom;
      // Zone de la photo d'origine visible dans le cadre.
      const sx = -pos.x / sc, sy = -pos.y / sc;
      const sw = fw / sc, sh = fh / sc;
      const outW = Math.round(Math.min(outputWidth, sw));
      const outH = Math.round(outW / aspect);
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Traitement de l'image impossible.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
      bitmap.close();
      const blob = await encodeCanvas(canvas, 0.88);
      await onConfirm(blob);
    } catch (e) {
      // Jamais d'échec silencieux : on affiche la raison.
      toast.error(e instanceof Error ? e.message : "Traitement de l'image impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Move className="h-4 w-4 shrink-0" />{description ?? "Fais glisser la photo pour la placer, et zoome pour la recadrer."}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={setFrameEl}
          className="relative w-full touch-none select-none overflow-hidden rounded-[var(--radius-moyen)] bg-encre cursor-grab active:cursor-grabbing"
          style={{ aspectRatio: String(aspect), maxHeight: "60vh" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {url && nat && (
            <img src={url} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
              style={{ width: dispW, height: dispH, left: pos.x, top: pos.y }} />
          )}
          {!nat && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blanc" /></div>}
          {/* Zone gardée : rond pour la photo de profil, grille des tiers pour aider à cadrer */}
          {round ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="aspect-square h-full rounded-full shadow-[0_0_0_9999px_rgba(49,13,23,0.55)] ring-2 ring-blanc/80" />
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 ring-2 ring-inset ring-blanc/80">
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-blanc/20" />)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" aria-label="Dézoomer" onClick={() => applyZoom(zoom / 1.2)} className="rounded-[var(--radius-petit)] p-2 text-gris-chaud hover:bg-bordeaux-100 hover:text-bordeaux-600">
            <ZoomOut className="h-5 w-5" />
          </button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} aria-label="Zoom"
            onChange={(e) => applyZoom(Number(e.target.value))}
            className={cn("h-2 flex-1 cursor-pointer appearance-none rounded-[var(--radius-pilule)] bg-bordure accent-bordeaux-600")} />
          <button type="button" aria-label="Zoomer" onClick={() => applyZoom(zoom * 1.2)} className="rounded-[var(--radius-petit)] p-2 text-gris-chaud hover:bg-bordeaux-100 hover:text-bordeaux-600">
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button variant="secondary" onClick={confirm} disabled={busy || !nat}>
            {busy && <Loader2 className="animate-spin" />}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
