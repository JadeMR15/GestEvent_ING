import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { Loader2 } from "lucide-react";
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
  starts_at: z.string().refine((v) => !isNaN(Date.parse(v)), "Date invalide")
    .refine((v) => new Date(v) > new Date(), "La date doit être dans le futur"),
  capacity: z.number().int().min(0).max(100000),
  price: z.number().min(0),
  status: z.enum(["draft", "published"]),
});

function CreateEventPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    starts_at: "",
    capacity: 50,
    price: 0,
    status: "published" as "draft" | "published",
  });

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
        starts_at: new Date(parsed.data.starts_at).toISOString(),
        capacity: parsed.data.capacity,
        price: parsed.data.price,
        organizer_id: user.id,
      })
      .select()
      .single();
    setLoading(false);

    if (error) { toast.error(error.message); return; }
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

            <div className="space-y-2">
              <Label htmlFor="title">Titre *</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Soirée de bienvenue INGE 2025" required />
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

            <div className="space-y-2">
              <Label htmlFor="price">Prix (€) — 0 = Gratuit</Label>
              <Input id="price" type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="0.00" />
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
