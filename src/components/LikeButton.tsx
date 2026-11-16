import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  count: number;
  liked: boolean;
  onToggle: () => void;
  /** "card" : petit, dans une carte cliquable ; "page" : bouton de la page d'un événement. */
  size?: "card" | "page";
  className?: string;
}

/** Cœur + compteur. Dans une carte (lien), le clic ne doit pas ouvrir l'événement. */
export function LikeButton({ count, liked, onToggle, size = "card", className }: LikeButtonProps) {
  const label = liked ? "Retirer mon like" : "Liker cet événement";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={liked}
      title={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bordeaux-600/40",
        size === "card" ? "px-2.5 py-1 text-xs" : "h-9 px-3 text-sm font-medium",
        liked
          ? "border-bordeaux-600/30 bg-bordeaux-600/10 text-bordeaux-600"
          : "border-bordure bg-white/70 text-muted-foreground hover:text-bordeaux-600 hover:border-bordeaux-600/30",
        className,
      )}
    >
      <Heart className={cn(size === "card" ? "h-3.5 w-3.5" : "h-4 w-4", liked && "fill-current")} />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
