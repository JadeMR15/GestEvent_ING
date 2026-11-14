import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BadgeCheck, BarChart2, Building2, ChevronRight, Clock, Download, Euro, Info, LayoutDashboard, LogOut,
  MessageSquare, Settings, ShieldAlert, ShieldCheck, Ticket, Users, type LucideIcon,
} from "lucide-react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { avatarUrl, initials } from "@/lib/avatar";

export const Route = createFileRoute("/profile")({
  component: () => <ProtectedLayout><ProfilePage /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Profil — Plav'" }] }),
});

const ROLE_LABEL = { admin: "Administrateur", organizer: "Organisateur", participant: "Participant", volunteer: "Bénévole", school_admin: "Administration école" } as const;

function Row({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint?: ReactNode }) {
  return (
    <Link to={to} className="tap flex items-center gap-3 px-4 py-3.5 active:bg-muted">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {hint}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-elegant">{children}</div>
    </section>
  );
}

function ProfilePage() {
  const { user, role, fullName, avatarPath, isVerified, verificationStatus, isStudent, signOut } = useAuth();
  const navigate = useNavigate();
  const photo = avatarUrl(avatarPath);
  const isOrga = role === "organizer" || role === "admin";
  const needsVerification = ((role === "participant" && isStudent) || role === "organizer") && !isVerified;
  const inReview = verificationStatus === "pending" || verificationStatus === "review";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Carte d'identité Plav' */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-primary p-5 text-primary-foreground shadow-elegant">
        <img src="/plav-cocotte.svg" alt="" className="plav-drift pointer-events-none absolute -right-10 -top-10 h-40 w-40 opacity-15" />
        <div className="relative flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-accent">
            {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
            <AvatarFallback className="bg-secondary text-lg font-semibold text-secondary-foreground">{initials(fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold">{fullName || "Mon compte"}</p>
            <p className="truncate text-sm opacity-75">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {role && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{ROLE_LABEL[role]}</span>}
              {isVerified && (
                <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                  <BadgeCheck className="h-3.5 w-3.5" />Étudiant vérifié
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {needsVerification && (
        <Link to="/verification" className="tap flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          {inReview ? <Clock className="h-5 w-5 shrink-0" /> : <ShieldAlert className="h-5 w-5 shrink-0" />}
          <div className="flex-1 text-sm">
            <p className="font-semibold">{inReview ? "Vérification en cours" : "Vérifie ton compte étudiant"}</p>
            <p className="opacity-80">{inReview ? "On regarde ton justificatif." : "Obligatoire pour t'inscrire aux événements."}</p>
          </div>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}

      <Group title="Mon compte">
        <Row to="/settings" icon={Settings} label="Paramètres" />
        {role === "participant" && <Row to="/my-tickets" icon={Ticket} label="Mes billets" />}
        {((role === "participant" && isStudent) || role === "organizer") && (
          <Row to="/verification" icon={BadgeCheck} label="Vérification étudiante"
            hint={isVerified ? <span className="text-xs font-semibold text-success">Validée</span> : undefined} />
        )}
      </Group>

      {isOrga && (
        <Group title="Outils organisateur">
          <Row to="/dashboard" icon={LayoutDashboard} label="Tableau de bord" />
          <Row to="/analytics" icon={BarChart2} label="Analyses" />
          <Row to="/finance" icon={Euro} label="Finances" />
          <Row to="/export" icon={Download} label="Exporter" />
          {role === "organizer" && <Row to="/messages" icon={MessageSquare} label="Messages de l'école" />}
          {role === "admin" && <Row to="/admin/verifications" icon={ShieldCheck} label="Vérifications étudiantes" />}
          {role === "admin" && <Row to="/admin/schools" icon={Building2} label="Écoles" />}
        </Group>
      )}

      {role === "school_admin" && (
        <Group title="Administration école">
          <Row to="/school-admin" icon={Building2} label="Espace école" />
          <Row to="/school-admin/reviews" icon={ShieldCheck} label="Validation des événements" />
          <Row to="/school-admin/members" icon={Users} label="Membres" />
        </Group>
      )}

      <Group>
        <Row to="/about" icon={Info} label="À propos de Plav'" />
      </Group>

      <button
        onClick={async () => { await signOut(); navigate({ to: "/" }); }}
        className="tap flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-card py-3.5 font-semibold text-destructive"
      >
        <LogOut className="h-4 w-4" />Se déconnecter
      </button>
    </div>
  );
}
