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
  Hourglass,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, signOut, user, isVerified, fullName, avatarPath } = useAuth();
  const photo = avatarUrl(avatarPath);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const items = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "organizer", "participant"] },
    { title: role === "organizer" || role === "admin" ? "Vos événements" : "Événements", url: "/events", icon: CalendarDays, roles: ["admin", "organizer", "participant"] },
    { title: "Mes billets", url: "/my-tickets", icon: Ticket, roles: ["participant"] },
    { title: "Listes d'attente", url: "/waitlist", icon: Hourglass, roles: ["participant"] },
    { title: "Créer un événement", url: "/events/new", icon: PlusCircle, roles: ["admin", "organizer"] },
    { title: "Scanner QR", url: "/scanner", icon: QrCode, roles: ["admin", "organizer", "volunteer"] },
    ...(!isVerified ? [{ title: "Vérifier mon compte", url: "/verification", icon: BadgeCheck, roles: ["organizer", "participant"] }] : []),
    { title: "Vérifications", url: "/admin/verifications", icon: ShieldCheck, roles: ["admin"] },
    { title: "Paramètres", url: "/settings", icon: Settings, roles: ["admin", "organizer", "participant", "volunteer"] },
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
                {role ? { admin: "Administrateur", organizer: "Organisateur", participant: "Participant", volunteer: "Bénévole" }[role] : "Invité"}
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
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
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
        <div className={`flex py-1 ${collapsed ? "justify-center" : "justify-start px-1"}`}>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
        {user && (
          <Link
            to="/settings"
            title="Paramètres"
            className={`flex items-center gap-2 rounded-md p-1.5 hover:bg-sidebar-accent ${collapsed ? "justify-center" : ""}`}
          >
            <Avatar className="h-8 w-8 border border-sidebar-border">
              {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
              <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                {initials(fullName)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-sidebar-foreground">{fullName || "Mon compte"}</p>
                <p className="truncate text-sidebar-foreground/60">{user.email}</p>
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
