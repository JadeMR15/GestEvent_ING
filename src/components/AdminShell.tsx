import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, AtSign, Building2, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { fetchPlatformStats, type PlatformStats } from "@/lib/admin";
import { refreshNotifications, useNotifications } from "@/lib/notifications";

const TABS = [
  { to: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
  { to: "/admin/schools", label: "Écoles", icon: Building2 },
  { to: "/admin/domains", label: "Domaines", icon: AtSign },
  { to: "/admin/verifications", label: "Vérifications", icon: ShieldCheck },
  { to: "/admin/users", label: "Utilisateurs", icon: Users },
] as const;

export interface AdminContext {
  stats: PlatformStats | null;
  /** À appeler après une décision : recharge les chiffres et les pastilles. */
  refresh: () => Promise<void>;
}

/** Chiffres de la plateforme (null tant que admin_space.sql n'est pas lancé). */
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const res = await fetchPlatformStats();
    setStats(res.data);
    setError(res.error ?? null);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { stats, error, reload };
}

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: (ctx: AdminContext) => ReactNode;
}

/** Espace administration Plav' : en-tête, onglets et pastilles « à traiter ». */
export function AdminShell(props: Props) {
  return (
    <ProtectedLayout allow={["admin"]}>
      <AdminShellInner {...props} />
    </ProtectedLayout>
  );
}

function AdminShellInner({ title, subtitle, actions, children }: Props) {
  const { stats, error, reload } = usePlatformStats();
  const notifications = useNotifications();
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });
  const refresh = useCallback(async () => { await Promise.all([reload(), refreshNotifications()]); }, [reload]);

  const badges: Record<string, number> = {
    "/admin/schools": stats?.schools_pending ?? 0,
    "/admin/domains": stats?.domains_pending ?? 0,
    "/admin/verifications": notifications.admin_verifications ?? stats?.verifications_review ?? 0,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 max-md:pb-20">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-bordeaux-800 via-bordeaux-600 to-jaune-300" />
        <div className="flex items-center gap-4 p-5 md:gap-6 md:px-8 md:py-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bordeaux-600 md:h-16 md:w-16">
            <img src="/plav-cocotte.svg" alt="" className="h-10 w-10 object-contain md:h-12 md:w-12" />
          </div>
          <div className="min-w-0">
            <p className="t-surtitre text-gris-chaud">Administration Plav'</p>
            <h1 className="truncate font-display text-2xl font-bold leading-tight text-primary md:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto hidden md:block">{actions}</div>}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t px-3 md:px-6">
          {TABS.map((t) => {
            const active = t.to === "/admin" ? pathname === "/admin" : pathname.startsWith(t.to);
            const count = badges[t.to] ?? 0;
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
                {t.label}
                {count > 0 && <span className="rounded-full bg-jaune-300 px-1.5 text-xs font-bold text-bordeaux-800">{count}</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Chiffres indisponibles : {error}</span>
        </div>
      )}
      {actions && <div className="md:hidden">{actions}</div>}

      {children({ stats, refresh })}
    </div>
  );
}
