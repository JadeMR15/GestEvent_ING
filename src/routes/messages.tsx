import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { SchoolThread } from "@/components/SchoolThread";
import { Card, CardContent } from "@/components/ui/card";
import { Monogram } from "@/components/SchoolAdminShell";
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
    <div className="mx-auto flex h-[calc(100dvh-10rem)] min-h-[480px] max-w-4xl flex-col md:h-[calc(100dvh-9rem)]">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
          <Monogram name={names.school} className="!h-11 !w-11 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="t-surtitre text-gris-chaud">Messagerie</p>
            <p className="truncate text-lg font-bold leading-tight">{names.school}</p>
          </div>
          <span className="hidden text-right text-xs text-muted-foreground sm:block">
            Tu écris au nom de<br /><span className="font-semibold text-foreground">{names.association}</span>
          </span>
        </header>
        <SchoolThread associationId={associationId} side="association" schoolName={names.school}
          associationName={names.association} className="flex-1" />
      </Card>
    </div>
  );
}
