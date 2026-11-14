import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BrandName } from "@/components/BrandName";
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  QrCode,
  Users,
  Ticket,
  LogOut,
  Download,
  BarChart2,
  Euro,
  BadgeCheck,
  ShieldCheck,
  Settings,
  Building2,
  MessageSquare,
  Hourglass,
  Heart,
  Bell,
  Newspaper,
  Store,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { RoleAvatar } from "@/components/RoleAvatar";
import { MySchoolBadge } from "@/components/SchoolBadge";
import { badgeFor, enableSystemNotifications, useNotificationPermission, useNotifications } from "@/lib/notifications";
import { toast } from "sonner";

/** Pastille du nombre de notifications (point seul quand la barre est repliée). */
export function CountBadge({ count, compact = false, className = "" }: { count: number; compact?: boolean; className?: string }) {
  if (count <= 0) return null;
  if (compact) return <span aria-label={`${count} nouveau(x)`} className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#E8B22E] ring-2 ring-sidebar ${className}`} />;
  return (
    <span className={`ml-auto min-w-[1.25rem] rounded-full bg-[#E8B22E] px-1.5 text-center text-[11px] font-bold leading-5 text-[#4A0F20] ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, signOut, user, isVerified, fullName, avatarPath, associationId, membershipStatus } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const notifications = useNotifications();
  const permission = useNotificationPermission();

  const isActive = (p: string) =>
    p === "/school-admin" && pathname.startsWith("/school-admin/messages") ? false : pathname === p || pathname.startsWith(p + "/");

  const items = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "organizer", "participant"] },
    { title: role === "organizer" || role === "admin" ? "Vos événements" : "Événements", url: "/events", icon: CalendarDays, roles: ["admin", "organizer", "participant"] },
    // Réseau (fil, abonnements) : participants uniquement.
    { title: "Fil d'actu", url: "/feed", icon: Newspaper, roles: ["participant"] },
    { title: "Associations", url: "/associations", icon: Store, roles: ["participant"] },
    // Organisateur : la page publique de son association, à animer (pas de fil ni d'abonnements).
    ...(associationId && membershipStatus === "approved"
      ? [{ title: "Page de l'association", url: `/associations/${associationId}`, icon: Store, roles: ["organizer"] }]
      : []),
    { title: "Mes billets", url: "/my-tickets", icon: Ticket, roles: ["participant"] },
    { title: "Listes d'attente", url: "/waitlist", icon: Hourglass, roles: ["participant"] },
    { title: "Créer un événement", url: "/events/new", icon: PlusCircle, roles: ["admin", "organizer"] },
    { title: "Scanner QR", url: "/scanner", icon: QrCode, roles: ["admin", "organizer", "volunteer"] },
    ...(!isVerified ? [{ title: "Vérifier mon compte", url: "/verification", icon: BadgeCheck, roles: ["organizer", "participant"] }] : []),
    { title: "Messages école", url: "/messages", icon: MessageSquare, roles: ["organizer"] },
    { title: "Espace école", url: "/school-admin", icon: Building2, roles: ["school_admin"] },
    { title: "Messages", url: "/school-admin/messages", icon: MessageSquare, roles: ["school_admin"] },
    { title: "Vérifications", url: "/admin/verifications", icon: ShieldCheck, roles: ["admin"] },
    { title: "Écoles", url: "/admin/schools", icon: Building2, roles: ["admin"] },
    { title: "Événements likés", url: "/likes", icon: Heart, roles: ["admin", "organizer", "participant", "volunteer"] },
    { title: "Paramètres", url: "/settings", icon: Settings, roles: ["admin", "organizer", "participant", "volunteer", "school_admin"] },
  ].filter((i) => role && i.roles.includes(role));

  const toolItems = [
    { title: "Analyses", url: "/analytics", icon: BarChart2, roles: ["admin", "organizer"] },
    { title: "Finances", url: "/finance", icon: Euro, roles: ["admin", "organizer"] },
    { title: "Exporter", url: "/export", icon: Download, roles: ["admin", "organizer"] },
  ].filter((i) => role && i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border overflow-visible">
        <div className="flex items-center gap-2 px-1 py-3 overflow-visible">
          <img src="/plav-cocotte.svg" alt="Plav'" className={`${collapsed ? "h-8 w-8" : "h-14 w-14"} shrink-0 object-contain drop-shadow-md`} />
          {!collapsed && (
            <div className="flex flex-col flex-1 items-start gap-1">
              <BrandName className="h-10" onDark />
              <span className="text-xs text-sidebar-foreground/60">
                {role ? { admin: "Administrateur", organizer: "Organisateur", participant: "Participant", volunteer: "Bénévole", school_admin: "Administration école" }[role] : "Invité"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <span className="relative">
                        <item.icon className="h-4 w-4" />
                        {collapsed && <CountBadge compact count={badgeFor(item.url, notifications)} />}
                      </span>
                      {!collapsed && <span>{item.title}</span>}
                      {!collapsed && <CountBadge count={badgeFor(item.url, notifications)} />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {toolItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Outils</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {toolItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {permission === "default" && (
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            title="Activer les notifications"
            onClick={async () => {
              if (await enableSystemNotifications()) toast.success("Notifications activées.");
            }}
            className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Bell className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Activer les notifications</span>}
          </Button>
        )}
        <div className={`flex py-1 ${collapsed ? "justify-center" : "justify-start px-1"}`}>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
        {user && (
          <Link
            to="/settings"
            title="Paramètres"
            className={`flex items-center gap-2 rounded-md p-1.5 hover:bg-sidebar-accent ${collapsed ? "justify-center" : ""}`}
          >
            <RoleAvatar path={avatarPath} name={fullName} role={role} size="sm" showBadge={!collapsed}
              className={role === "admin" && !collapsed ? "mb-1.5" : undefined} />
            {!collapsed && (
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-sidebar-foreground">{fullName || "Mon compte"}</p>
                <p className="truncate text-sidebar-foreground/60">{user.email}</p>
                <MySchoolBadge onDark className="mt-1" />
              </div>
            )}
          </Link>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={async () => { await signOut(); navigate({ to: "/" }); }}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Déconnexion</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
