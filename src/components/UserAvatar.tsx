import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const SIZES = { xs: "h-6 w-6 text-[9px]", sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" } as const;

/** Photo de profil d'une personne (initiales sans photo), pour les listes. */
export function UserAvatar({ path, name, size = "sm", className }: {
  path: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const photo = avatarUrl(path);
  return (
    <Avatar className={cn("shrink-0 border border-border", SIZES[size], className)}>
      {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
      <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">{initials(name ?? "")}</AvatarFallback>
    </Avatar>
  );
}
