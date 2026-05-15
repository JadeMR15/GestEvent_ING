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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, signOut, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const items = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "organizer", "participant"] },
    { title: role === "organizer" || role === "admin" ? "Vos événements" : "Événements", url: "/events", icon: CalendarDays, roles: ["admin", "organizer", "participant"] },
    { title: "Mes billets", url: "/my-tickets", icon: Ticket, roles: ["participant"] },
    { title: "Créer un événement", url: "/events/new", icon: PlusCircle, roles: ["admin", "organizer"] },
    { title: "Scanner QR", url: "/scanner", icon: QrCode, roles: ["admin", "organizer", "volunteer"] },
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
          <img src="/logo2.png" alt="Plav'" className="h-24 w-24 shrink-0 object-contain" />
          {!collapsed && (
            <div className="flex flex-col flex-1 items-start gap-1">
              <BrandName className="h-14" />
              <div className="flex items-center gap-1.5">
                {role && (
                  <img
                    src={{ admin: "/orga.png", organizer: "/orga.png", participant: "/participant.png", volunteer: "/benevole.png" }[role]}
                    alt={role}
                    className="h-5 w-5 object-contain"
                  />
                )}
                <span className="text-xs text-sidebar-foreground/60">
                  {{ admin: "Administrateur", organizer: "Organisateur", participant: "Participant", volunteer: "Bénévole" }[role ?? ""] ?? "Invité"}
                </span>
              </div>
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
        {!collapsed && user && (
          <div className="px-2 pb-2 text-xs text-sidebar-foreground/60 truncate">
            {user.email}
          </div>
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
