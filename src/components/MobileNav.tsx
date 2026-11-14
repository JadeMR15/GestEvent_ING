import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, CalendarDays, CheckSquare, Compass, Home, Plus, QrCode, Ticket, UserRound, Users, type LucideIcon } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";

type Tab = { title: string; url: string; icon: LucideIcon; primary?: boolean };

// Onglets du bas selon le rôle : l'essentiel à portée de pouce.
function tabsFor(role: AppRole | null): Tab[] {
  switch (role) {
    case "volunteer":
      return [
        { title: "Scanner", url: "/scanner", icon: QrCode },
        { title: "Profil", url: "/profile", icon: UserRound },
      ];
    case "school_admin":
      return [
        { title: "École", url: "/school-admin", icon: Building2 },
        { title: "Validation", url: "/school-admin/reviews", icon: CheckSquare },
        { title: "Membres", url: "/school-admin/members", icon: Users },
        { title: "Profil", url: "/profile", icon: UserRound },
      ];
    case "organizer":
    case "admin":
      return [
        { title: "Accueil", url: "/dashboard", icon: Home },
        { title: "Événements", url: "/events", icon: CalendarDays },
        { title: "Créer", url: "/events/new", icon: Plus, primary: true },
        { title: "Scanner", url: "/scanner", icon: QrCode },
        { title: "Profil", url: "/profile", icon: UserRound },
      ];
    default:
      return [
        { title: "Explorer", url: "/events", icon: Compass },
        { title: "Billets", url: "/my-tickets", icon: Ticket },
        { title: "Profil", url: "/profile", icon: UserRound },
      ];
  }
}

function useIsActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (url: string) => {
    if (url === "/events") return pathname === "/events" || (pathname.startsWith("/events/") && pathname !== "/events/new");
    if (url === "/school-admin") return pathname === "/school-admin" || pathname === "/school-admin/" || pathname.startsWith("/school-admin/associations");
    if (url === "/profile") return pathname === "/profile" || pathname === "/settings" || pathname === "/verification";
    return pathname === url || pathname.startsWith(url + "/");
  };
}

export function MobileTabBar() {
  const { role } = useAuth();
  const isActive = useIsActive();
  const tabs = tabsFor(role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/90 backdrop-blur-xl pb-safe md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {tabs.map((tab) => {
          const active = isActive(tab.url);
          if (tab.primary) {
            return (
              <li key={tab.url} className="flex flex-1 justify-center">
                <Link to={tab.url} aria-label={tab.title} className="tap -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow ring-4 ring-background">
                  <tab.icon className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={tab.url} className="flex-1">
              <Link
                to={tab.url}
                className={`tap flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-secondary" : ""}`}>
                  <tab.icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </span>
                {tab.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileHeader() {
  const { fullName, avatarPath } = useAuth();
  const photo = avatarUrl(avatarPath);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl pt-safe md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/plav-cocotte.svg" alt="" className="h-8 w-8 object-contain" />
          <img src="/plav-logotype.svg" alt="Plav'" className="h-6 w-auto object-contain" />
        </div>
        <Link to="/profile" aria-label="Mon profil" className="tap">
          <Avatar className="h-9 w-9 border-2 border-accent">
            {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
            <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{initials(fullName)}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
