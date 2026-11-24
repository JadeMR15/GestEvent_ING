import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { RoleAvatar } from "@/components/RoleAvatar";
import { MySchoolBadge } from "@/components/SchoolBadge";
import { badgeFor, enableSystemNotifications, totalNotifications, useNotificationPermission, useNotifications } from "@/lib/notifications";
import { BELL_TARGETS } from "@/components/MobileNav";
import { ROLE_LABEL, homeFor, useNavItems, type NavItem } from "./useNavItems";

/** Pastille du nombre de notifications. */
export function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`min-w-[1.25rem] rounded-full bg-jaune-300 px-1.5 text-center text-xs font-semibold leading-5 text-bordeaux-800 ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Barre de navigation horizontale de l'espace connecté (ordinateur et tablette ; sur téléphone,
 * l'en-tête et la barre d'onglets du bas prennent le relais). Capsule flottante en verre dépoli
 * posée sur le dégradé : logo à gauche, liens principaux au centre, « Plus » pour le reste,
 * cloche et menu du compte à droite.
 */
export function AppTopBar() {
  const { role, items, isActive } = useNavItems();
  const { user, fullName, avatarPath, signOut } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const permission = useNotificationPermission();

  const main = items.filter((i) => i.main);
  const more = items.filter((i) => !i.main && !i.tool && i.url !== "/settings");
  const tools = items.filter((i) => i.tool);
  const moreActive = [...more, ...tools].some((i) => isActive(i.url));
  const moreCount = [...more, ...tools].reduce((n, i) => n + badgeFor(i.url, notifications), 0);
  const total = totalNotifications(notifications);

  async function enableNotifications() {
    if (await enableSystemNotifications()) toast.success("Notifications activées.");
  }

  // Cloche : la première rubrique qui a du nouveau (comme sur téléphone).
  async function onBell() {
    if (permission === "default") await enableNotifications();
    const target = BELL_TARGETS.find((u) => badgeFor(u, notifications) > 0);
    if (target) navigate({ to: target });
  }

  return (
    <header className="sticky top-0 z-40 hidden px-4 pt-4 md:block lg:px-8">
      <div className="app-capsule mx-auto flex h-16 max-w-7xl items-center gap-3 rounded-full pl-5 pr-2.5">
        {/* Logo + rôle */}
        <Link to={homeFor(role)}
          className="flex shrink-0 items-center gap-2" aria-label="Plav' — accueil de mon espace">
          <img src="/plav-cocotte.svg" alt="" className="h-9 w-9 object-contain" />
          <span className="hidden flex-col leading-none xl:flex">
            <img src="/plav-logotype.svg" alt="Plav'" className="h-6 w-auto self-start object-contain" />
            {role && <span className="app-caps mt-1 text-gris-chaud">{ROLE_LABEL[role]}</span>}
          </span>
        </Link>

        {/* Liens principaux */}
        <nav aria-label="Navigation principale" className="no-scrollbar flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto">
          {main.map((item) => <TopLink key={item.url} item={item} active={isActive(item.url)} count={badgeFor(item.url, notifications)} />)}

          {/* Un seul sous-menu, nommé : les outils de l'organisateur (et un éventuel lien restant). */}
          {more.length + tools.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`app-pill ${moreActive ? "is-active" : ""}`}
                aria-label={tools.length > 0 ? "Outils" : "Autres rubriques"}
              >
                {tools.length > 0 ? "Outils" : "Autres"}
                <CountBadge count={moreCount} />
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={10} className="min-w-[200px] rounded-2xl p-1.5">
                {more.map((item) => <MenuLink key={item.url} item={item} active={isActive(item.url)} count={badgeFor(item.url, notifications)} />)}
                {more.length > 0 && tools.length > 0 && <DropdownMenuSeparator />}
                {tools.map((item) => <MenuLink key={item.url} item={item} active={isActive(item.url)} count={0} />)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* Cloche : active les notifications de l'appareil tant qu'elles ne le sont pas */}
        {(permission === "default" || total > 0) && (
          <button
            type="button"
            onClick={onBell}
            title={permission === "default" ? "Activer les notifications" : `${total} notification${total > 1 ? "s" : ""}`}
            aria-label={permission === "default" ? "Activer les notifications" : `${total} notification${total > 1 ? "s" : ""}`}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-encre/75 transition-colors hover:bg-bordeaux-100/70 hover:text-bordeaux-600"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
            {total > 0 ? <CountBadge count={total} className="absolute -right-0.5 -top-0.5" />
              : <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-jaune-300 ring-2 ring-blanc" />}
          </button>
        )}

        {/* Compte */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-bordeaux-100/70" aria-label="Mon compte">
              <RoleAvatar path={avatarPath} name={fullName} role={role} size="sm" showBadge={false} />
              <ChevronDown className="h-4 w-4 text-gris-chaud" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl p-1.5">
              <div className="flex items-center gap-3 px-2.5 py-2.5">
                <RoleAvatar path={avatarPath} name={fullName} role={role} size="sm" />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold text-encre">{fullName || "Mon compte"}</p>
                  <p className="truncate text-xs text-gris-chaud">{user.email}</p>
                  <MySchoolBadge className="mt-1" />
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2.5 py-2">
                <Link to="/settings"><Settings className="mr-2 h-4 w-4" />Paramètres</Link>
              </DropdownMenuItem>
              {permission === "default" && (
                <DropdownMenuItem onSelect={enableNotifications} className="cursor-pointer rounded-xl px-2.5 py-2">
                  <Bell className="mr-2 h-4 w-4" />Activer les notifications
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => { await signOut(); navigate({ to: "/" }); }}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-bordeaux-600 focus:text-bordeaux-600"
              >
                <LogOut className="mr-2 h-4 w-4" />Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

function TopLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  return (
    // Texte seul, sans icône : le libellé suffit et la barre reste lisible.
    <Link to={item.url} aria-current={active ? "page" : undefined}
      className={`app-pill whitespace-nowrap ${active ? "is-active" : ""}`}>
      {item.title}
      <CountBadge count={count} />
    </Link>
  );
}

function MenuLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  return (
    <DropdownMenuItem asChild className={`cursor-pointer rounded-xl px-2.5 py-2 ${active ? "bg-bordeaux-100 text-bordeaux-600" : ""}`}>
      <Link to={item.url}>
        {item.title}
        <CountBadge count={count} className="ml-auto" />
      </Link>
    </DropdownMenuItem>
  );
}
