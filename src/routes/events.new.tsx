import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ImagePlus, X, Plus, Trash2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/new")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <CreateEventPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Créer un événement — GuestEvent" }] }),
});

type TicketDraft = {
  uid: string;
  name: string;
  description: string;
  price: string;
  capacity: string;
};

type MediaDraft = {
  uid: string;
  type: "image" | "video";
  file?: File;
  preview: string;
  videoUrl?: string;
  caption: string;
};

async function geocodeAddress(location: string, city: string): Promise<{ lat: number; lon: number } | null> {
  const query = [location.trim(), city.trim()].filter(Boolean).join(", ");
  if (!query) return null;
  const tryQuery = async (q: string) => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { "Accept-Language": "fr", "User-Agent": "GuestEvent/1.0" } }
      );
      const data = await r.json();
      if (data?.[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch {}
    return null;
  };
  // Try full address first, then city only as fallback
  return (await tryQuery(query)) ?? (city.trim() ? await tryQuery(city.trim()) : null);
}

const schema = z.object({
  title: z.string().trim().min(3, "Titre trop court").max(100, "Titre trop long (max 100 caractères)"),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(200),
  city: z.string().trim().max(100),
  required_document: z.string().trim().max(200),
  school: z.string().trim().max(120),
  association: z.string().trim().max(120),
  starts_at: z.string().refine((v) => !isNaN(Date.parse(v)), "Date invalide")
    .refine((v) => new Date(v) > new Date(), "La date doit être dans le futur"),
  status: z.enum(["draft", "published", "private"]),
});

function CreateEventPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mediaDragOver, setMediaDragOver] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState<MediaDraft[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    city: "",
    school: "",
    association: "",
    starts_at: "",
    status: "published" as "draft" | "published" | "private",
    required_document: "",
    max_per_person: "0",
  });
  const [tickets, setTickets] = useState<TicketDraft[]>([
    { uid: crypto.randomUUID(), name: "Tarif standard", description: "", price: "0", capacity: "50" },
  ]);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem("ge_organizer_identity");
    if (saved) {
      try {
        const { school, association } = JSON.parse(saved);
        if (school || association) { setForm((f) => ({ ...f, school: school ?? "", association: association ?? "" })); return; }
      } catch { /* ignore */ }
    }
    (supabase as any).from("profiles").select("school,association").eq("id", user.id).maybeSingle().then(({ data }: any) => {
      if (data) {
        const s = data.school ?? "";
        const a = data.association ?? "";
        setForm((f) => ({ ...f, school: s, association: a }));
        if (s || a) localStorage.setItem("ge_organizer_identity", JSON.stringify({ school: s, association: a }));
      }
    });
  }, [user]);

  function handleMediaFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name);
      if (!isImage && !isVideo) { toast.error(`${file.name} : format non supporté.`); return; }
      if (isImage && file.size > 10 * 1024 * 1024) { toast.error(`${file.name} trop lourd (max 10 Mo pour les images).`); return; }
      if (isVideo && file.size > 500 * 1024 * 1024) { toast.error(`${file.name} trop lourd (max 500 Mo pour les vidéos).`); return; }
      const type: "image" | "video" = isVideo ? "video" : "image";
      setGallery((g) => [...g, { uid: crypto.randomUUID(), type, file, preview: URL.createObjectURL(file), caption: "" }]);
    });
  }

  function addVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    if (!url.includes("youtube.com") && !url.includes("youtu.be") && !url.includes("vimeo.com") && !/\.(mp4|webm|ogg)/i.test(url)) {
      toast.error("URL non reconnue. Utilisez YouTube, Vimeo ou un lien .mp4/.webm.");
      return;
    }
    setGallery((g) => [...g, { uid: crypto.randomUUID(), type: "video", preview: url, videoUrl: url, caption: "" }]);
    setVideoUrl("");
  }

  async function uploadGallery(eventId: string): Promise<{ url: string; type: "image" | "video"; sort_order: number; caption: string }[]> {
    const result: { url: string; type: "image" | "video"; sort_order: number; caption: string }[] = [];
    for (let i = 0; i < gallery.length; i++) {
      const item = gallery[i];
      if (item.type === "video" && item.videoUrl) {
        result.push({ url: item.videoUrl, type: "video", sort_order: i, caption: item.caption });
      } else if (item.file) {
        const ext = item.file.name.split(".").pop() ?? "jpg";
        const path = `${eventId}/media_${i}.${ext}`;
        const { error } = await supabase.storage.from("event-covers").upload(path, item.file, { upsert: true });
        if (error) { toast.error(`Erreur upload ${item.file.name} : ${error.message}`); continue; }
        const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
        result.push({ url: data.publicUrl, type: item.type, sort_order: i, caption: item.caption });
      }
    }
    return result;
  }

  function addTicket() {
    setTickets((t) => [...t, { uid: crypto.randomUUID(), name: "", description: "", price: "0", capacity: "50" }]);
  }

  function removeTicket(uid: string) {
    if (tickets.length <= 1) { toast.error("Il faut au moins un tarif."); return; }
    setTickets((t) => t.filter((x) => x.uid !== uid));
  }

  function updateTicket(uid: string, field: keyof TicketDraft, value: string) {
    setTickets((t) => t.map((x) => (x.uid === uid ? { ...x, [field]: value } : x)));
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!user) return;

    for (const t of tickets) {
      if (!t.name.trim()) { toast.error("Chaque tarif doit avoir un nom."); return; }
      if (isNaN(parseFloat(t.price)) || parseFloat(t.price) < 0) { toast.error("Prix invalide."); return; }
      if (isNaN(parseInt(t.capacity)) || parseInt(t.capacity) < 0) { toast.error("Capacité invalide."); return; }
    }

    setLoading(true);

    const totalCapacity = tickets.reduce((sum, t) => sum + (parseInt(t.capacity) || 0), 0);
    const minPrice = Math.min(...tickets.map((t) => parseFloat(t.price) || 0));

    const { data, error } = await (supabase as any)
      .from("events")
      .insert({
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        school: parsed.data.school,
        association: parsed.data.association,
        starts_at: new Date(parsed.data.starts_at).toISOString(),
        capacity: totalCapacity,
        price: minPrice,
        city: parsed.data.city,
        required_document: parsed.data.required_document,
        max_per_person: parseInt(form.max_per_person) || 0,
        status: parsed.data.status as string,
        organizer_id: user.id,
      })
      .select()
      .single();

    if (error) { setLoading(false); toast.error(error.message); return; }

    // Mémoriser école/association dans le profil et localStorage
    localStorage.setItem("ge_organizer_identity", JSON.stringify({ school: parsed.data.school, association: parsed.data.association }));
    if (parsed.data.school || parsed.data.association) {
      await supabase.from("profiles").update({ school: parsed.data.school, association: parsed.data.association }).eq("id", user.id);
    }

    // Géocodage par adresse complète
    if (parsed.data.city || parsed.data.location) {
      const coords = await geocodeAddress(parsed.data.location, parsed.data.city);
      if (coords) await supabase.from("events").update({ latitude: coords.lat, longitude: coords.lon }).eq("id", data.id);
    }

    await (supabase as any).from("ticket_types").insert(
      tickets.map((t, i) => ({
        event_id: data.id,
        name: t.name.trim(),
        description: t.description.trim(),
        price: parseFloat(t.price) || 0,
        capacity: parseInt(t.capacity) || 0,
        sort_order: i,
      }))
    );

    if (gallery.length > 0) {
      const mediaList = await uploadGallery(data.id);
      if (mediaList.length > 0) {
        await (supabase as any).from("event_media").insert(
          mediaList.map((m) => ({ ...m, event_id: data.id }))
        );
        const firstImage = mediaList.find((m) => m.type === "image");
        if (firstImage) {
          await supabase.from("events").update({ cover_image_url: firstImage.url }).eq("id", data.id);
        }
      }
    }

    setLoading(false);
    toast.success("Événement créé !");
    navigate({ to: "/events/$eventId", params: { eventId: data.id } });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Créer un événement</h1>
      <Card className="border-2 shadow-elegant">
        <CardHeader><CardTitle>Détails de l'événement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Photos & vidéos */}
            <div className="space-y-2">
              <Label>
                Photos & vidéos
                <span className="ml-1 text-xs font-normal text-muted-foreground">(la 1ère photo devient la couverture)</span>
              </Label>

              {gallery.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/20 p-2">
                  {gallery.map((item, i) => (
                    <div key={item.uid} className="relative h-20 w-28 overflow-hidden rounded-lg border border-[#D5A0A8]">
                      {item.type === "image" ? (
                        <img src={item.preview} alt="" className="h-full w-full object-cover" />
                      ) : item.file ? (
                        <video src={item.preview} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 bg-black/80">
                          <PlayCircle className="h-6 w-6 text-white" />
                          <span className="w-full truncate px-1 text-center text-[10px] text-white/70">Vidéo</span>
                        </div>
                      )}
                      {i === 0 && item.type === "image" && (
                        <span className="absolute bottom-0 left-0 right-0 bg-[#72243E]/80 py-0.5 text-center text-[9px] text-white">
                          Couverture
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setGallery((g) => g.filter((x) => x.uid !== item.uid))}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                onClick={() => mediaInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setMediaDragOver(true); }}
                onDragLeave={() => setMediaDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setMediaDragOver(false); if (e.dataTransfer.files.length) handleMediaFiles(e.dataTransfer.files); }}
                className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors"
                style={{ borderColor: mediaDragOver ? "#72243E" : "#D5A0A8", background: mediaDragOver ? "#EED4D820" : "#FDFAF7" }}
              >
                <ImagePlus className="h-5 w-5 text-[#72243E]" />
                <p className="text-center text-xs text-[#72243E]">Photos (JPG, PNG, WebP) ou vidéos (MP4, WebM) — cliquez ou glissez</p>
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) handleMediaFiles(e.target.files); }}
              />

              <div className="flex gap-2">
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
                  placeholder="Lien vidéo YouTube ou Vimeo"
                />
                <Button type="button" variant="outline" size="sm" onClick={addVideo} className="shrink-0">
                  <Plus className="mr-1 h-4 w-4" />Ajouter
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Titre *</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Décrivez votre événement…" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">Lieu <span className="text-muted-foreground font-normal text-xs">(adresse complète)</span></Label>
                <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex : 10 rue de la Paix, Paris" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville <span className="text-muted-foreground font-normal text-xs">(pour la carte)</span></Label>
                <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ex : Paris, Lyon, Bordeaux…" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="starts_at">Date & heure *</Label>
              <Input id="starts_at" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="school">École</Label>
                <Input id="school" value={form.school} onChange={(e) => { const v = e.target.value; setForm((f) => { const next = { ...f, school: v }; localStorage.setItem("ge_organizer_identity", JSON.stringify({ school: v, association: f.association })); return next; }); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="association">Association</Label>
                <Input id="association" value={form.association} onChange={(e) => { const v = e.target.value; setForm((f) => { const next = { ...f, association: v }; localStorage.setItem("ge_organizer_identity", JSON.stringify({ school: f.school, association: v })); return next; }); }} />
              </div>
            </div>

            {/* Tarifs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tarifs *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addTicket}>
                  <Plus className="mr-1 h-4 w-4" />Ajouter un tarif
                </Button>
              </div>
              <div className="space-y-3">
                {tickets.map((ticket, i) => (
                  <div key={ticket.uid} className="rounded-lg border border-[#D5A0A8] bg-[#FDFAF7] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#72243E]">Tarif {i + 1}</p>
                      {tickets.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeTicket(ticket.uid)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Nom *</Label>
                        <Input value={ticket.name} onChange={(e) => updateTicket(ticket.uid, "name", e.target.value)} placeholder="ex : Tarif étudiant" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Prix (€) — 0 = Gratuit</Label>
                        <Input type="text" inputMode="decimal" value={ticket.price} onChange={(e) => updateTicket(ticket.uid, "price", e.target.value)} placeholder="0.00" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Capacité (0 = illimitée)</Label>
                        <Input type="number" min={0} value={ticket.capacity} onChange={(e) => updateTicket(ticket.uid, "capacity", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Commentaire <span className="font-normal text-muted-foreground">(optionnel)</span></Label>
                        <Input value={ticket.description} onChange={(e) => updateTicket(ticket.uid, "description", e.target.value)} placeholder="ex : Sur présentation de la carte étudiant" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="required_document">Document requis <span className="font-normal text-xs text-muted-foreground">(vide = aucun)</span></Label>
                <Input
                  id="required_document"
                  value={form.required_document}
                  onChange={(e) => setForm({ ...form, required_document: e.target.value })}
                  placeholder="Ex : Carte étudiante, CNI…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_per_person">Places max / personne <span className="font-normal text-xs text-muted-foreground">(0 = illimité)</span></Label>
                <Input
                  id="max_per_person"
                  type="number"
                  min={0}
                  value={form.max_per_person}
                  onChange={(e) => setForm({ ...form, max_per_person: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Statut de publication</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "draft" | "published" | "private" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Publié (visible par tous)</SelectItem>
                  <SelectItem value="private">Privé (réservé à l'école)</SelectItem>
                  <SelectItem value="draft">Brouillon (non visible)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.status === "draft" ? "Enregistrer en brouillon" : form.status === "private" ? "Publier (privé)" : "Publier l'événement"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
