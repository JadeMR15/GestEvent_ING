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
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/new")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <CreateEventPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Créer un événement — GuestEvent" }] }),
});

const schema = z.object({
  title: z.string().trim().min(3, "Titre trop court").max(100, "Titre trop long (max 100 caractères)"),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(200),
  school: z.string().trim().max(120),
  association: z.string().trim().max(120),
  starts_at: z.string().refine((v) => !isNaN(Date.parse(v)), "Date invalide")
    .refine((v) => new Date(v) > new Date(), "La date doit être dans le futur"),
  capacity: z.number().int().min(0).max(100000),
  price: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v)) || 0).pipe(z.number().min(0)),
  status: z.enum(["draft", "published"]),
});

function CreateEventPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    school: "",
    association: "",
    starts_at: "",
    capacity: 50,
    price: "",
    status: "published" as "draft" | "published",
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("school,association").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setForm((f) => ({ ...f, school: data.school ?? "", association: data.association ?? "" }));
    });
  }, [user]);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Fichier non supporté. Utilisez JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image trop lourde (max 5 Mo)."); return; }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function uploadCover(eventId: string): Promise<string | null> {
    if (!coverFile) return null;
    const ext = coverFile.name.split(".").pop();
    const path = `${eventId}/cover.${ext}`;
    const { error } = await supabase.storage.from("event-covers").upload(path, coverFile, { upsert: true });
    if (error) { toast.error("Erreur upload image : " + error.message); return null; }
    const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!user) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        school: parsed.data.school,
        association: parsed.data.association,
        starts_at: new Date(parsed.data.starts_at).toISOString(),
        capacity: parsed.data.capacity,
        price: parsed.data.price,
        status: parsed.data.status,
        organizer_id: user.id,
      })
      .select()
      .single();

    if (error) { setLoading(false); toast.error(error.message); return; }

    // Upload image et mise à jour de l'URL
    if (coverFile) {
      const url = await uploadCover(data.id);
      if (url) {
        await supabase.from("events").update({ cover_image_url: url }).eq("id", data.id);
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

            {/* Cover image */}
            <div className="space-y-2">
              <Label>Photo de couverture</Label>
              {coverPreview ? (
                <div className="relative h-48 w-full overflow-hidden rounded-xl border border-[#D5A0A8]">
                  <img src={coverPreview} alt="Aperçu" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className="flex h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors"
                  style={{ borderColor: dragOver ? "#72986F" : "#D5A0A8", background: dragOver ? "#D5E8A020" : "#FDFAF7" }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EED4D8]">
                    <ImagePlus className="h-6 w-6 text-[#72243E]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-[#72243E]">Cliquez ou glissez une image</p>
                    <p className="text-xs text-[#2C2C2A]/50">JPG, PNG, WebP — max 5 Mo</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
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
                <Label htmlFor="location">Lieu</Label>
                <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Adresse ou URL" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacité (0 = illimitée)</Label>
                <Input id="capacity" type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="school">École</Label>
                <Input id="school" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="association">Association</Label>
                <Input id="association" value={form.association} onChange={(e) => setForm({ ...form, association: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Prix (€) — 0 = Gratuit</Label>
              <Input id="price" type="text" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="starts_at">Date & heure *</Label>
                <Input id="starts_at" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Statut de publication</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "draft" | "published" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Publié (visible par tous)</SelectItem>
                    <SelectItem value="draft">Brouillon (non visible)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.status === "draft" ? "Enregistrer en brouillon" : "Publier l'événement"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
