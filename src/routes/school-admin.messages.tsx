import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, ExternalLink, Loader2, MessageSquare, Search } from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Monogram, SchoolAdminShell } from "@/components/SchoolAdminShell";
import { SchoolThread } from "@/components/SchoolThread";
import { associationImage, useAssociationFallbacks } from "@/components/AssociationLogo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/lib/notifications";
import { db, ASSOCIATION_STATUS_BADGE as STATUS_BADGE, type Association, type School } from "@/lib/schools";

export const Route = createFileRoute("/school-admin/messages")({
  validateSearch: (search: Record<string, unknown>): { a?: string } => ({
    a: typeof search.a === "string" ? search.a : undefined,
  }),
  component: () => (
    <ProtectedLayout allow={["school_admin", "admin"]}>
      <SchoolAdminShell>
        {(school) => <Inbox school={school} />}
      </SchoolAdminShell>
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Messages — Espace école — Plav'" }] }),
});

interface Conversation {
  association: Association;
  last?: { body: string; created_at: string; from_school: boolean };
}

/** Heure aujourd'hui, « Hier », jour de la semaine, sinon date courte. */
function shortTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE", { locale: fr });
  return format(d, "d MMM", { locale: fr });
}

function Inbox({ school }: { school: School }) {
  const { a: selectedId } = Route.useSearch();
  const navigate = useNavigate({ from: "/school-admin/messages" });
  const [associations, setAssociations] = useState<Association[]>([]);
  const [lastById, setLastById] = useState<Record<string, Conversation["last"]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const unread = useNotifications().school_messages_by_association ?? {};
  const fallbacks = useAssociationFallbacks(associations.map((a) => a.id));

  const load = useCallback(async () => {
    const [{ data: assos }, { data: msgs }] = await Promise.all([
      db.from("associations").select("*").eq("school_id", school.id).neq("status", "suspended").order("name"),
      // Derniers messages de l'école : on garde le plus récent par association.
      db.from("school_messages").select("association_id, body, created_at, from_school")
        .eq("school_id", school.id).order("created_at", { ascending: false }).limit(1000),
    ]);
    const last: Record<string, Conversation["last"]> = {};
    for (const m of (msgs as (Conversation["last"] & { association_id: string })[] | null) ?? []) {
      if (!last[m.association_id]) last[m.association_id] = m;
    }
    setAssociations((assos as Association[] | null) ?? []);
    setLastById(last);
    setLoading(false);
  }, [school.id]);

  useEffect(() => { load(); }, [load]);
  // La liste suit les nouveaux messages.
  useEffect(() => {
    const onMessage = () => { load(); };
    window.addEventListener("plav:new-message", onMessage);
    return () => window.removeEventListener("plav:new-message", onMessage);
  }, [load]);

  // Conversations récentes d'abord, puis les associations sans message.
  const conversations = useMemo<Conversation[]>(() => {
    const q = query.trim().toLowerCase();
    return associations
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .map((a) => ({ association: a, last: lastById[a.id] }))
      .sort((x, y) =>
        (y.last?.created_at ?? "").localeCompare(x.last?.created_at ?? "")
        || x.association.name.localeCompare(y.association.name, "fr"));
  }, [associations, lastById, query]);

  const selected = associations.find((a) => a.id === selectedId) ?? null;
  const select = (id?: string) => navigate({ search: { a: id }, replace: !!selectedId && !!id });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="flex h-[calc(100dvh-20rem)] min-h-[520px] overflow-hidden max-md:h-[calc(100dvh-17rem)]">
      {/* Liste des conversations */}
      <aside className={`flex w-full flex-col border-r md:w-80 lg:w-96 ${selected ? "max-md:hidden" : ""}`}>
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Conversations</h2>
            <span className="text-xs text-muted-foreground">{associations.length} association{associations.length > 1 ? "s" : ""}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher" className="h-9 pl-9" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">Aucune association.</li>
          )}
          {conversations.map(({ association: a, last }) => {
            const n = unread[a.id] ?? 0;
            const active = a.id === selectedId;
            return (
              <li key={a.id}>
                <button type="button" onClick={() => select(a.id)}
                  className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors ${active ? "border-l-primary bg-secondary/70" : "border-l-transparent hover:bg-muted/60"}`}>
                  <Monogram name={a.name} src={associationImage(a.logo_path, fallbacks[a.id])} className="!h-11 !w-11 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate text-sm ${n ? "font-bold" : "font-semibold"}`}>{a.name}</p>
                      {last && <span className={`shrink-0 text-xs capitalize ${n ? "font-semibold text-primary" : "text-muted-foreground"}`}>{shortTime(last.created_at)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-xs ${n ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {last ? `${last.from_school ? "Vous : " : ""}${last.body}` : a.status === "pending" ? "Association à valider" : "Démarrer la conversation"}
                      </p>
                      {n > 0 && (
                        <span className="min-w-[1.25rem] shrink-0 rounded-full bg-jaune-300 px-1.5 text-center text-xs font-bold leading-5 text-bordeaux-800">{n}</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation ouverte */}
      <section className={`flex min-w-0 flex-1 flex-col ${selected ? "" : "max-md:hidden"}`}>
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b px-3 py-3 md:px-6">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => select(undefined)} aria-label="Retour aux conversations">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Monogram name={selected.name} src={associationImage(selected.logo_path, fallbacks[selected.id])} className="!h-10 !w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{selected.name}</p>
                <Badge className={`${STATUS_BADGE[selected.status].className} h-5 text-xs`}>{STATUS_BADGE[selected.status].label}</Badge>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/school-admin/associations/$associationId" params={{ associationId: selected.id }}>
                  <span className="max-sm:hidden">Voir la fiche</span><ExternalLink className="h-4 w-4 sm:ml-1.5" />
                </Link>
              </Button>
            </header>
            <SchoolThread key={selected.id} associationId={selected.id} side="school" schoolName={school.name}
              associationName={selected.name} className="flex-1" onActivity={load} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary"><MessageSquare className="h-7 w-7" /></span>
            <p className="text-lg font-semibold">Messagerie de {school.name}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Choisissez une association pour lire ses messages ou lui écrire. Les nouveaux messages arrivent en direct.
            </p>
          </div>
        )}
      </section>
    </Card>
  );
}
