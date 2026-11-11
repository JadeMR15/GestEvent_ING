import type { AppRole } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

// Photo de profil avec un cadre selon le rôle (affichage uniquement : les droits
// restent contrôlés par le serveur).
//   admin       → cadre bordeaux et doré + petit badge « Admin »
//   organizer   → cadre doré illustré « ORGANISATEUR » (image)
//   participant / bénévole → pas de cadre

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { avatar: string; ring: string; text: string; badge: string }> = {
  sm: { avatar: "h-8 w-8", ring: "p-[2px]", text: "text-xs", badge: "text-[8px] px-1 py-0 -bottom-1.5" },
  md: { avatar: "h-12 w-12", ring: "p-[3px]", text: "text-sm", badge: "text-[9px] px-1.5 py-0 -bottom-2" },
  lg: { avatar: "h-24 w-24", ring: "p-1", text: "text-2xl", badge: "text-[11px] px-2 py-0.5 -bottom-2.5" },
};

const FRAMES: Partial<Record<AppRole, string>> = {
  admin: "bg-[linear-gradient(135deg,#6B1A2F_0%,#E8B22E_45%,#F3D27A_55%,#6B1A2F_100%)]",
};

// Organisateur : cadre illustré (public/frames/organisateur.webp, laurier doré + banderole).
// Le cadre est plus grand que la photo seule : il faut la place pour la banderole.
const ORGANIZER_BOX: Record<Size, string> = { sm: "h-11 w-11", md: "h-16 w-16", lg: "h-32 w-32" };

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  organizer: "Organisateur",
  participant: "Participant",
  volunteer: "Bénévole",
};

interface Props {
  /** Chemin de la photo dans le stockage "avatars" (colonne avatar_path). */
  path: string | null | undefined;
  name: string | null | undefined;
  role: AppRole | null | undefined;
  size?: Size;
  /** Afficher le badge « Admin » (masqué par exemple dans le menu replié). */
  showBadge?: boolean;
  className?: string;
}

export function RoleAvatar({ path, name, role, size = "md", showBadge = true, className }: Props) {
  const s = SIZES[size];
  const photo = avatarUrl(path ?? null);
  const frame = role ? FRAMES[role] : undefined;
  const title = role && role !== "participant" ? `${name || "Compte"} · ${ROLE_LABEL[role]}` : undefined;

  if (role === "organizer") {
    return (
      <span className={cn("relative inline-block shrink-0", ORGANIZER_BOX[size], className)} title={title}>
        {/* Photo placée dans le trou du cadre (mesuré sur l'image : centre à 44 % de la hauteur, 76 % de large). */}
        <Avatar className="absolute left-[12%] top-[6%] h-[76%] w-[76%]">
          {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
          <AvatarFallback className={cn("bg-secondary font-semibold text-secondary-foreground", s.text)}>
            {initials(name ?? "")}
          </AvatarFallback>
        </Avatar>
        <img src="/frames/organisateur.webp" alt="" aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full select-none" draggable={false} />
      </span>
    );
  }

  const avatar = (
    <Avatar className={cn(s.avatar, !frame && "border border-border")}>
      {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
      <AvatarFallback className={cn("bg-secondary font-semibold text-secondary-foreground", s.text)}>
        {initials(name ?? "")}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      title={title}
    >
      {frame ? (
        <span className={cn("inline-flex rounded-full", s.ring, frame)}>
          {/* Liseré crème entre le cadre et la photo, pour que la photo ressorte. */}
          <span className="inline-flex rounded-full bg-[#FFFDF8] p-[1.5px]">{avatar}</span>
        </span>
      ) : (
        avatar
      )}
      {role === "admin" && showBadge && (
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#E8B22E] bg-[#6B1A2F] font-bold uppercase leading-tight tracking-wide text-[#F3D27A] shadow-sm",
            s.badge,
          )}
        >
          Admin
        </span>
      )}
    </span>
  );
}
