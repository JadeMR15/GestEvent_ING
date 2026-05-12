import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { ImageIcon, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId/edit")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <EditEventPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Modifier l'événement — GuestEvent" }] }),
});

const schema = z.object({
  title: z.string().trim().min(3, "Titre trop court").max(100, "Titre trop long (max 100 caractères)"),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(200),
  starts_at: z.string().refine((v) => !isNaN(Date.parse(v)), "Date invalide"),
  capacity: z.number().int().min(0).max(100000),
  price: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v)) || 0).pipe(z.number().min(0)),
  school: z.string().trim().max(120),
  association: z.string().trim().max(120),
  status: z.enum(["draft", "published", "closed"]),
});

function EditEventPage() {
  const { eventId } = useParams({ from: "/events/$eventId/edit" });
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    starts_at: "",
    capacity: 50,
    price: "",
    school: "",
    association: "",
    status: "published" as "draft" | "published" | "closed",
  });

  useEffect(() => {
    (async () => {
      const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (!ev) { toast.error("Événement introuvable."); navigate({ to: "/events" }); return; }

      const isOwner = ev.organizer_id === user?.id || role === "admin";
      if (!isOwner) { toast.error("Accès refusé."); navigate({ to: "/events" }); return; }

      setForm({
        title: ev.title,
        description: ev.description ?? "",
        location: ev.location ?? "",
        starts_at: ev.starts_at ? new Date(ev.starts_at).toISOString().slice(0, 16) : "",
        capacity: ev.capacity ?? 50,
        price: ev.price != null ? String(ev.price) : "",
        school: ev.school ?? "",
        association: ev.association ?? "",
        status: (ev.status ?? "published") as "draft" | "published" | "closed",
      });
      if (ev.cover_image_url) {
        setCoverPreview(ev.cover_image_url);
        setCoverUrl(ev.cover_image_url);
      }
      setFetching(false);
    })();
  }, [eventId, user?.id, role, navigate]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image trop grande (max 5 Mo)"); return; }

    const preview = URL.createObjectURL(file);
    setCoverPreview(preview);
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("event-covers").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      console.error("[Storage] upload error:", error);
      toast.error(`Erreur upload : ${error.message} (${(error as any).statusCode ?? ""})`);
      setCoverPreview(null);
      return;
    }
    const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
    setCoverUrl(data.publicUrl);
  }

  function applyUrl() {
    const v = urlInput.trim();
    if (!v) return;
    setCoverPreview(v);
    setCoverUrl(v);
  }

  function removeCover() {
    setCoverPreview(null);
    setCoverUrl(null);
    setUrlInput("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setLoading(true);
    const { error } = await supabase
      .from("events")
      .update({
        ...parsed.data,
        starts_at: new Date(parsed.data.starts_at).toISOString(),
        price: parsed.data.price,
        school: parsed.data.school,
        association: parsed.data.association,
        cover_image_url: coverUrl,
      })
      .eq("id", eventId);
    setLoading(false);

    if (error) { toast.error(error.message); return; }
    toast.success("Événement mis à jour !");
    navigate({ to: "/events/$eventId", params: { eventId } });
  }

  if (fetching) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Modifier l'événement</h1>
      <Card className="border-2 shadow-elegant">
        <CardHeader><CardTitle>Détails de l'événement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Cover image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Image de couverture</Label>
                <div className="flex gap-1 rounded-lg border p-0.5 text-xs">
                  <button type="button" onClick={() => setImageMode("upload")} className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${imageMode === "upload" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <ImageIcon className="h-3 w-3" />Fichier
                  </button>
                  <button type="button" onClick={() => setImageMode("url")} className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${imageMode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Link2 className="h-3 w-3" />URL
                  </button>
                </div>
              </div>
              {coverPreview ? (
                <div className="relative">
                  <img src={coverPreview} alt="Aperçu" className="h-40 w-full rounded-lg object-cover" />
                  <Button type="button" variant="destructive" size="icon" className="absolute right-2 top-2 h-7 w-7" onClick={removeCover}>
                    <X className="h-4 w-4" />
                  </Button>
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
              ) : imageMode === "upload" ? (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <ImageIcon className="h-8 w-8" />
                  <span>Cliquer pour uploader (max 5 Mo)</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <Input placeholder="https://exemple.com/image.jpg" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }} />
                  <Button type="button" variant="outline" onClick={applyUrl}>Aperçu</Button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Titre *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">Lieu</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Adresse ou URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacité (0 = illimitée)</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Prix (€) — 0 = Gratuit</Label>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
              />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="starts_at">Date & heure *</Label>
                <Input
                  id="starts_at"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as "draft" | "published" | "closed" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Publié</SelectItem>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="closed">Inscriptions fermées</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading || uploading} className="flex-1 bg-gradient-primary shadow-glow">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer les modifications
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/events/$eventId", params: { eventId } })}
              >
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
