import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, AtSign, BadgeCheck, Building2, Calendar, CheckCircle2, Loader2, Shuffle, ShieldCheck, Store, Ticket, Users, type LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/schools";
import { ROLE_LABEL, type PlatformStats, type UserRole } from "@/lib/admin";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <AdminShell title="Vue d'ensemble" subtitle="Ce qui attend ta décision, et l'état de la plateforme.">
      {({ stats }) => <Overview stats={stats} />}
    </AdminShell>
  ),
  head: () => ({ meta: [{ title: "Administration — Plav'" }] }),
});

const nf = new Intl.NumberFormat("fr-FR");

function Overview({ stats }: { stats: PlatformStats | null }) {
  const [audits, setAudits] = useState<number | null>(null);
  useEffect(() => {
    db.rpc("verification_audit_stats").then(({ data }: { data: { to_check: number } | null }) => setAudits(data?.to_check ?? null));
  }, []);

  if (!stats) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const queue: { to: string; icon: LucideIcon; label: string; hint: string; count: number }[] = [
    { to: "/admin/schools", icon: Building2, label: "Comptes école", hint: "Écoles qui demandent leur espace", count: stats.schools_pending },
    { to: "/admin/domains", icon: AtSign, label: "Domaines email", hint: "Adresses d'école à reconnaître", count: stats.domains_pending },
    { to: "/admin/verifications", icon: ShieldCheck, label: "Justificatifs", hint: "Dossiers étudiants à relire", count: stats.verifications_review },
  ];
  const pending = queue.reduce((s, q) => s + q.count, 0);

  const roles = (Object.entries(stats.users_by_role) as [UserRole, number][]).sort((a, b) => b[1] - a[1]);
  const maxRole = Math.max(1, ...roles.map(([, n]) => n));

  return (
    <div className="space-y-8">
      {/* À traiter */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2>À traiter</h2>
          <p className="text-sm text-muted-foreground">
            {pending ? `${pending} décision${pending > 1 ? "s" : ""} en attente` : "Tout est à jour"}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {queue.map((q) => (
            <Link key={q.to} to={q.to}
              className={`tap group flex flex-col gap-3 rounded-2xl border p-4 transition-colors md:p-5 ${q.count ? "border-jaune-300 bg-jaune-100/60 hover:bg-jaune-100" : "bg-card hover:bg-muted/50"}`}>
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${q.count ? "bg-bordeaux-600 text-creme" : "bg-secondary text-primary"}`}>
                  <q.icon className="h-5 w-5" />
                </span>
                {q.count ? (
                  <span className="font-display text-3xl font-black text-bordeaux-600">{q.count}</span>
                ) : (
                  <CheckCircle2 className="h-6 w-6 text-success" />
                )}
              </div>
              <div>
                <p className="font-semibold">{q.label}</p>
                <p className="text-sm text-muted-foreground">{q.count ? q.hint : "Rien en attente"}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {q.count ? "Traiter" : "Voir"}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        {!!audits && (
          <Link to="/admin/verifications" className="tap flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted/50">
            <Shuffle className="h-4 w-4 text-primary" />
            <span className="flex-1">
              <strong>{nf.format(audits)}</strong> compte{audits > 1 ? "s" : ""} validé{audits > 1 ? "s" : ""} automatiquement jamais contrôlé{audits > 1 ? "s" : ""} — fais un contrôle au hasard.
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </section>

      {/* Chiffres clés */}
      <section className="space-y-3">
        <h2>La plateforme</h2>
        <Card className="overflow-hidden">
          <CardContent className="grid grid-cols-2 p-0 lg:grid-cols-3 [&>*]:border-border [&>*]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:[&>*:not(:nth-child(3n))]:border-r lg:[&>*:nth-last-child(-n+3)]:border-b-0 max-lg:[&>*:nth-last-child(-n+2)]:border-b-0">
            <Kpi icon={Users} label="Utilisateurs" value={nf.format(stats.users_total)}
              hint={`+${nf.format(stats.users_new_7d)} cette semaine · +${nf.format(stats.users_new_30d)} en 30 j`} />
            <Kpi icon={BadgeCheck} label="Étudiants vérifiés" value={nf.format(stats.students_verified)}
              hint={stats.users_total ? `${Math.round((stats.students_verified / stats.users_total) * 100)} % des comptes` : undefined} />
            <Kpi icon={Building2} label="Écoles actives" value={nf.format(stats.schools_active)}
              hint={`${nf.format(stats.domains_active)} domaine${stats.domains_active > 1 ? "s" : ""} email reconnu${stats.domains_active > 1 ? "s" : ""}`} />
            <Kpi icon={Store} label="Associations actives" value={nf.format(stats.associations_active)}
              hint={`${nf.format(stats.associations_total)} au total`} />
            <Kpi icon={Calendar} label="Événements à venir" value={nf.format(stats.events_upcoming)}
              hint={`${nf.format(stats.events_total)} depuis le début`} />
            <Kpi icon={Ticket} label="Billets" value={nf.format(stats.tickets_total)}
              hint={`+${nf.format(stats.tickets_30d)} en 30 j`} />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Comptes par rôle */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2>Comptes</h2>
            <Link to="/admin/users" className="text-sm font-semibold text-primary">Gérer</Link>
          </div>
          <Card>
            <CardContent className="space-y-3 p-5">
              {roles.map(([role, n]) => (
                <Link key={role} to="/admin/users" search={{ role }} className="block space-y-1 rounded-lg hover:opacity-80">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{ROLE_LABEL[role] ?? role}</span>
                    <span className="tabular-nums text-muted-foreground">{nf.format(n)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxRole) * 100}%` }} />
                  </div>
                </Link>
              ))}
              {stats.users_blocked > 0 && (
                <Link to="/admin/users" search={{ role: "blocked" }} className="block pt-1 text-sm text-destructive">
                  {nf.format(stats.users_blocked)} compte{stats.users_blocked > 1 ? "s" : ""} bloqué{stats.users_blocked > 1 ? "s" : ""}
                </Link>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Écoles */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2>Écoles</h2>
            <Link to="/admin/schools" className="text-sm font-semibold text-primary">Gérer</Link>
          </div>
          <Card className="overflow-hidden">
            {stats.schools.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune école active.</CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">École</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Comptes</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Assos</th>
                      <th className="px-4 py-2.5 text-right font-semibold">À venir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stats.schools.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-medium">{s.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(s.users)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(s.associations)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{nf.format(s.events_upcoming)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 md:p-5">
      <div className="t-surtitre flex items-center gap-2 text-gris-chaud">
        <Icon className="h-4 w-4 text-primary" />{label}
      </div>
      <p className="mt-2 font-display text-3xl font-black">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
