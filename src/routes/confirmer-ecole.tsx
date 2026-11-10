import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Loader2, MailCheck, XCircle } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { SchoolBadge } from "@/components/SchoolBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { confirmSchoolEmail } from "@/lib/school-email";

// Lien reçu par email. On demande un clic avant de confirmer : les antivirus de
// messagerie qui ouvrent les liens automatiquement ne consomment pas le jeton.
export const Route = createFileRoute("/confirmer-ecole")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ConfirmSchoolEmailPage,
  head: () => ({ meta: [{ title: "Confirmer mon adresse d'école — Plav'" }] }),
});

function ConfirmSchoolEmailPage() {
  const { token } = Route.useSearch();
  const { user, refreshVerification } = useAuth();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(token ? "idle" : "error");
  const [school, setSchool] = useState("");
  const [message, setMessage] = useState(token ? "" : "Ce lien est incomplet. Copie-le en entier depuis l'email.");

  async function confirm() {
    setState("loading");
    const res = await confirmSchoolEmail(token);
    if (res.error || !res.ok) {
      setMessage(res.error ?? "Confirmation impossible.");
      setState("error");
      return;
    }
    setSchool(res.school ?? "");
    setState("done");
    if (user) refreshVerification();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      <header className="border-b border-[#E3CC9C]/30 bg-white/60 backdrop-blur">
        <div className="container mx-auto flex items-center px-6 py-4">
          <Link to="/"><BrandName className="h-10" /></Link>
        </div>
      </header>

      <main className="container mx-auto max-w-md px-4 py-16">
        <Card className="border-2 shadow-elegant">
          <CardContent className="space-y-5 p-8 text-center">
            {state === "done" ? (
              <>
                <BadgeCheck className="mx-auto h-12 w-12 text-green-600" />
                <h1 className="text-2xl font-bold" style={{ color: "var(--text-title)" }}>C'est confirmé !</h1>
                <p className="text-muted-foreground">Ton compte étudiant est vérifié jusqu'au 31 août.</p>
                {school && <SchoolBadge school={school} className="text-sm" />}
                <Button asChild className="w-full bg-gradient-primary shadow-glow">
                  {user ? <Link to="/events">Voir les événements</Link> : <Link to="/login">Me connecter</Link>}
                </Button>
              </>
            ) : state === "error" ? (
              <>
                <XCircle className="mx-auto h-12 w-12 text-red-500" />
                <h1 className="text-2xl font-bold" style={{ color: "var(--text-title)" }}>Lien non valable</h1>
                <p className="text-muted-foreground">{message}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link to={user ? "/verification" : "/login"}>{user ? "Vérifier mon compte" : "Me connecter"}</Link>
                </Button>
              </>
            ) : (
              <>
                <MailCheck className="mx-auto h-12 w-12 text-[#6B1A2F]" />
                <h1 className="text-2xl font-bold" style={{ color: "var(--text-title)" }}>Confirmer mon adresse d'école</h1>
                <p className="text-muted-foreground">
                  Un clic pour confirmer que cette adresse est bien la tienne et vérifier ton compte étudiant.
                </p>
                <Button onClick={confirm} disabled={state === "loading"} className="w-full bg-gradient-primary shadow-glow">
                  {state === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmer
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
