import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Connexion — Plav'" }] }),
});

const schema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "Minimum 6 caractères").max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    let target = "/events";
    if (data.user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const roleSet = new Set((roles ?? []).map((r) => r.role));
      if (roleSet.has("admin") || roleSet.has("organizer")) {
        target = "/dashboard";
      }
    }
    setLoading(false);
    toast.success("Bienvenue !");
    const redirect = sessionStorage.getItem("loginRedirect");
    if (redirect) { sessionStorage.removeItem("loginRedirect"); navigate({ to: redirect as any }); return; }
    navigate({ to: target });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-mesh p-4">
      <Card className="w-full max-w-md shadow-elegant border-[0.5px]">
        <CardHeader className="text-center">
          <img src="/logo2.png" alt="Plav'" className="mx-auto mb-3 h-44 w-auto object-contain" />
          <CardTitle className="text-2xl">Bon retour !</CardTitle>
          <CardDescription>Connecte-toi à ton compte Plav'</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Se connecter
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">S'inscrire</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
