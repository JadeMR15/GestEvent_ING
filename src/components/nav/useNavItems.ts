import { useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Calendar, CirclePlus, QrCode, Users, Ticket, Download, ChartNoAxesColumn, Euro, ShieldCheck,
  Settings, Building2, MessageSquare, Hourglass, Heart, Newspaper, Store, AtSign, type LucideIcon,
} from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Affiché directement dans la barre du haut ; sinon rangé dans « Plus ». */
  main: boolean;
  /** Outil organisateur (Analyses, Finances, Exporter). */
  tool?: boolean;
}

type Def = Omit<NavItem, "main"> & { roles: AppRole[]; mainFor?: AppRole[] };

/**
 * Liens de navigation de l'espace connecté, par rôle (mêmes liens qu'avant dans le menu latéral).
 * `mainFor` : rôles pour lesquels le lien est visible directement dans la barre horizontale.
 */
export function useNavItems() {
  const { role, isVerified, associationId, membershipStatus } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (p: string) => {
    if (p === "/admin") return pathname === "/admin" || pathname === "/admin/";
    if (p === "/school-admin" && pathname.startsWith("/school-admin/messages")) return false;
    if (p === "/events") return pathname === "/events" || (pathname.startsWith("/events/") && pathname !== "/events/new");
    return pathname === p || pathname.startsWith(p + "/");
  };

  const defs: Def[] = [
    // Admin Plav' : uniquement la gestion de la plateforme, pas de soirées.
    { title: "Vue d'ensemble", url: "/admin", icon: LayoutDashboard, roles: ["admin"], mainFor: ["admin"] },
    { title: "Écoles", url: "/admin/schools", icon: Building2, roles: ["admin"], mainFor: ["admin"] },
    { title: "Domaines", url: "/admin/domains", icon: AtSign, roles: ["admin"], mainFor: ["admin"] },
    { title: "Vérifications", url: "/admin/verifications", icon: ShieldCheck, roles: ["admin"], mainFor: ["admin"] },
    { title: "Utilisateurs", url: "/admin/users", icon: Users, roles: ["admin"], mainFor: ["admin"] },
    // Participant : le fil d'actu en premier (réseau réservé aux participants).
    { title: "Fil d'actu", url: "/feed", icon: Newspaper, roles: ["participant"], mainFor: ["participant"] },
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["organizer", "participant"], mainFor: ["organizer", "participant"] },
    { title: role === "organizer" ? "Vos événements" : "Événements", url: "/events", icon: Calendar, roles: ["organizer", "participant"], mainFor: ["organizer", "participant"] },
    { title: "Associations", url: "/associations", icon: Store, roles: ["participant"], mainFor: ["participant"] },
    { title: "Créer un événement", url: "/events/new", icon: CirclePlus, roles: ["organizer"], mainFor: ["organizer"] },
    { title: "Scanner", url: "/scanner", icon: QrCode, roles: ["organizer", "volunteer"], mainFor: ["organizer", "volunteer"] },
    // Organisateur : la page publique de son association, à animer (pas de fil ni d'abonnements).
    ...(associationId && membershipStatus === "approved"
      ? [{ title: "Mon association", url: `/associations/${associationId}`, icon: Store, roles: ["organizer"] as AppRole[], mainFor: ["organizer"] as AppRole[] }]
      : []),
    { title: "Mes billets", url: "/my-tickets", icon: Ticket, roles: ["participant"], mainFor: ["participant"] },
    { title: "Listes d'attente", url: "/waitlist", icon: Hourglass, roles: ["participant"], mainFor: ["participant"] },
    ...(!isVerified
      ? [{ title: "Vérifier mon compte", url: "/verification", icon: ShieldCheck, roles: ["organizer", "participant"] as AppRole[], mainFor: ["organizer", "participant"] as AppRole[] }]
      : []),
    { title: "Messages école", url: "/messages", icon: MessageSquare, roles: ["organizer"], mainFor: ["organizer"] },
    { title: "Espace école", url: "/school-admin", icon: Building2, roles: ["school_admin"], mainFor: ["school_admin"] },
    { title: "Messages", url: "/school-admin/messages", icon: MessageSquare, roles: ["school_admin"], mainFor: ["school_admin"] },
    { title: "Likes", url: "/likes", icon: Heart, roles: ["organizer", "participant", "volunteer"], mainFor: ["organizer", "participant", "volunteer"] },
    { title: "Paramètres", url: "/settings", icon: Settings, roles: ["admin", "organizer", "participant", "volunteer", "school_admin"] },
    { title: "Analyses", url: "/analytics", icon: ChartNoAxesColumn, roles: ["organizer"], tool: true },
    { title: "Finances", url: "/finance", icon: Euro, roles: ["organizer"], tool: true },
    { title: "Exporter", url: "/export", icon: Download, roles: ["organizer"], tool: true },
  ];

  const items: NavItem[] = defs
    .filter((d) => role && d.roles.includes(role))
    .map(({ roles: _roles, mainFor, ...d }) => ({ ...d, main: !!role && !!mainFor?.includes(role) }));

  return { role, items, isActive };
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administration Plav'",
  organizer: "Organisateur",
  participant: "Participant",
  volunteer: "Bénévole",
  school_admin: "Administration école",
};

/** Page d'accueil de l'espace connecté selon le rôle (clic sur le logo Plav'). */
export function homeFor(role: AppRole | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "school_admin") return "/school-admin";
  if (role === "volunteer") return "/scanner";
  return "/dashboard";
}
