import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AtSign, BadgeCheck, Building2, ClipboardCheck, Clock, LayoutDashboard, Loader2, MessageSquare, Settings, Users, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db, type School } from "@/lib/schools";
import { avatarUrl } from "@/lib/avatar";
import { badgeFor, refreshNotifications, useNotifications } from "@/lib/notifications";

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
  { to: "/school-admin", label: "Vue d'ensemble", icon: LayoutDashboard },
  { to: "/school-admin/messages", label: "Messages", icon: MessageSquare },
  { to: "/school-admin/reviews", label: "Validation", icon: ClipboardCheck },
  { to: "/school-admin/members", label: "Membres", icon: Users },
  { to: "/school-admin/settings", label: "Réglages", icon: Settings },
] as const;

/** Initiales d'un nom (« Bureau des élèves » → « BE »). */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/[\s'-]+/).filter((w) => w.length > 1 || /\p{Lu}/u.test(w));
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] ?? name)].slice(0, 2);
  return letters.join("").toUpperCase() || "?";
}

// Couleurs des pastilles d'association : stables pour un même nom.
const MONOGRAM_COLORS = [
  // Uniquement des couleurs de la charte (texte jaune seulement sur bordeaux).
  "bg-bordeaux-600 text-creme",
  "bg-jaune-300 text-bordeaux-600",
  "bg-bordeaux-800 text-jaune-300",
  "bg-bordeaux-100 text-bordeaux-600",
  "bg-jaune-100 text-bordeaux-600",
  "bg-bordeaux-400 text-creme",
];

export function Monogram({ name, src, size = "md", className = "" }: { name: string; src?: string | null; size?: "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "h-20 w-20 rounded-2xl text-3xl md:h-24 md:w-24" : "h-12 w-12 rounded-xl text-base";
  if (src) {
    return (
      <div className={`flex shrink-0 items-center justify-center overflow-hidden border bg-white p-1.5 ${dims} ${className}`}>
        <img src={src} alt={`Logo ${name}`} className="h-full w-full object-contain" loading="lazy" />
      </div>
    );
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = MONOGRAM_COLORS[h % MONOGRAM_COLORS.length];
  return (
    <div aria-hidden className={`flex shrink-0 items-center justify-center font-display font-bold tracking-wide ${dims} ${color} ${className}`}>
      {initials(name)}
    </div>
  );
}

interface ShellProps {
  /** Titre de la section (sous l'en-tête de l'école). */
  title?: string;
  subtitle?: string;
  /** Boutons affichés à droite du titre de section. */
  actions?: ReactNode;
  // refresh : à appeler après une action qui change les compteurs des onglets.
  children: (school: School, refresh: () => Promise<void>) => ReactNode;
}

/** En-tête de l'école + navigation de l'espace ; gère les écoles en attente / refusées. */
export function SchoolAdminShell({ title, subtitle, actions, children }: ShellProps) {
  const { school, loading, reload } = useMySchool();
  const { role, avatarPath } = useAuth();
  const notifications = useNotifications();
  const refresh = useCallback(async () => { await Promise.all([reload(), refreshNotifications()]); }, [reload]);
  const badges: Record<string, number> = {
    "/school-admin/messages": badgeFor("/school-admin/messages", notifications),
    "/school-admin/reviews": badgeFor("/school-admin/reviews", notifications),
    "/school-admin/members": badgeFor("/school-admin/members", notifications),
  };
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!school) {
    return (
      <EmptyState icon={<Building2 className="h-10 w-10" />} title="Aucune école rattachée"
        text="Ce compte n'administre aucune école. Contactez l'équipe Plav' si c'est une erreur." />
    );
  }

  if (school.status === "pending") {
    return (
      <EmptyState icon={<Clock className="h-10 w-10" />} title={`${school.name} : demande en cours`}
        text="L'équipe Plav' vérifie votre école. Vous aurez accès à votre espace dès sa validation." />
    );
  }

  if (school.status === "rejected") {
    return (
      <EmptyState icon={<XCircle className="h-10 w-10" />} title="Demande refusée"
        text={school.status_note ? `Motif : ${school.status_note}` : "Contactez l'équipe Plav' pour en savoir plus."} />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 max-md:pb-20">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-jaune-200 via-jaune-300 to-bordeaux-600" />
        <div className="flex items-center gap-4 p-5 md:gap-6 md:p-8">
          {/* Logo de l'école = photo de profil du compte école (Paramètres). */}
          <Monogram name={school.name} src={role === "school_admin" ? avatarUrl(avatarPath) : null} size="lg"
            className="max-md:h-14 max-md:w-14 max-md:text-xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Espace administration</p>
            <h1 className="truncate font-display text-3xl font-bold leading-tight text-primary md:text-5xl">{school.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                <BadgeCheck className="h-3.5 w-3.5" />École vérifiée
              </span>
              <span className="inline-flex items-center gap-1">
                <AtSign className="h-3.5 w-3.5" />{school.email_domains.join(", ")}
              </span>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t px-3 md:px-6">
          {TABS.map((t) => {
            const active = t.to === "/school-admin"
              ? pathname === "/school-admin" || pathname.startsWith("/school-admin/associations")
              : pathname.startsWith(t.to);
            const count = badges[t.to] ?? 0;
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
                {t.label}
                {count > 0 && <span className="rounded-full bg-jaune-300 px-1.5 text-[11px] font-bold text-bordeaux-800">{count}</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-2xl font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
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
