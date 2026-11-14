import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Clock, Loader2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db, type School } from "@/lib/schools";

/** École administrée par l'utilisateur connecté. */
export function useMySchool() {
  const { user } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from("school_admins")
      .select("schools(id, name, email_domains, status, status_note, created_at)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    setSchool((data?.schools as School | undefined) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);
  return { school, loading, reload };
}

const TABS = [
  { to: "/school-admin", label: "Vue d'ensemble" },
  { to: "/school-admin/reviews", label: "Validation" },
  { to: "/school-admin/members", label: "Membres" },
] as const;

interface ShellProps {
  title: string;
  subtitle?: string;
  // refresh : à appeler après une action qui change les compteurs des onglets.
  children: (school: School, refresh: () => Promise<void>) => ReactNode;
}

/** En-tête + onglets de l'espace école ; gère les écoles en attente / refusées. */
export function SchoolAdminShell({ title, subtitle, children }: ShellProps) {
  const { school, loading, reload } = useMySchool();
  const { counters, refresh: refreshCounters } = useSchoolCounters(school?.status === "active" ? school.id : undefined);
  const refresh = useCallback(async () => { await Promise.all([reload(), refreshCounters()]); }, [reload, refreshCounters]);
  const badges: Record<string, number> = { "/school-admin/reviews": counters.reviews, "/school-admin/members": counters.members };
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!school) {
    return (
      <EmptyState icon={<Building2 className="h-10 w-10" />} title="Aucune école rattachée"
        text="Ce compte n'administre aucune école. Contacte l'équipe Plav' si c'est une erreur." />
    );
  }

  if (school.status === "pending") {
    return (
      <EmptyState icon={<Clock className="h-10 w-10" />} title={`${school.name} : demande en cours`}
        text="L'équipe Plav' vérifie ton école. Tu auras accès à ton espace dès sa validation." />
    );
  }

  if (school.status === "rejected") {
    return (
      <EmptyState icon={<XCircle className="h-10 w-10" />} title="Demande refusée"
        text={school.status_note ? `Motif : ${school.status_note}` : "Contacte l'équipe Plav' pour en savoir plus."} />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary/70">{school.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
        {TABS.map((t) => {
          const active = t.to === "/school-admin"
            ? pathname === "/school-admin" || pathname.startsWith("/school-admin/associations")
            : pathname.startsWith(t.to);
          const count = badges[t.to] ?? 0;
          return (
            <Link key={t.to} to={t.to}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{count}</span>}
            </Link>
          );
        })}
      </nav>
      {children(school, refresh)}
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="border-2 border-dashed">
        <CardContent className="space-y-3 py-12 text-center">
          <div className="mx-auto w-fit text-primary/60">{icon}</div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{text}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Compteurs pour les pastilles des onglets. */
export function useSchoolCounters(schoolId: string | undefined) {
  const [counters, setCounters] = useState({ reviews: 0, members: 0 });
  const refresh = useCallback(async () => {
    if (!schoolId) return;
    const [ev, mem] = await Promise.all([
      db.from("events").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("approval_status", "pending"),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("membership_status", "pending"),
    ]);
    setCounters({ reviews: ev.count ?? 0, members: mem.count ?? 0 });
  }, [schoolId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { counters, refresh };
}
