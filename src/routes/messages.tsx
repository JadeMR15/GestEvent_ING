import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolThread } from "@/components/SchoolThread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/schools";

export const Route = createFileRoute("/messages")({
  component: () => (
    <ProtectedLayout allow={["organizer"]}>
      <MessagesPage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Messages de l'école — Plav'" }] }),
});

function MessagesPage() {
  const { associationId, membershipStatus } = useAuth();
  const [names, setNames] = useState<{ school: string; association: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!associationId) { setLoading(false); return; }
    db.from("associations").select("name, schools(name)").eq("id", associationId).maybeSingle()
      .then(({ data }: { data: { name: string; schools: { name: string } | null } | null }) => {
        if (data) setNames({ association: data.name, school: data.schools?.name ?? "L'école" });
        setLoading(false);
      });
  }, [associationId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!associationId || membershipStatus !== "approved" || !names) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Card className="border-2 border-dashed">
          <CardContent className="space-y-3 py-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-primary/50" />
            <p className="font-semibold">Pas encore de messagerie avec ton école</p>
            <p className="text-sm text-muted-foreground">
              {!associationId
                ? "Rattache ton compte à ton école et ton association pour échanger avec l'administration."
                : "Ton école doit d'abord valider ton rattachement."}
            </p>
            {!associationId && <Button asChild variant="outline"><Link to="/settings">Choisir mon école</Link></Button>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground">Échanges entre {names.association} et l'administration de {names.school}.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">{names.school}</CardTitle></CardHeader>
        <CardContent>
          <SchoolThread associationId={associationId} side="association" schoolName={names.school} associationName={names.association} />
        </CardContent>
      </Card>
    </div>
  );
}
