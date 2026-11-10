import { GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Mention « Fait partie de [école] » pour un compte étudiant vérifié (affichage uniquement). */
export function SchoolBadge({ school, onDark, className }: { school: string; onDark?: boolean; className?: string }) {
  return (
    <span
      title={`Étudiant(e) vérifié(e) de ${school}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        onDark ? "bg-[#F3D27A]/90 text-[#4A0F20]" : "bg-[#F3D27A] text-[#4A0F20]",
        className,
      )}
    >
      <GraduationCap className="h-3 w-3 shrink-0" />
      <span className="truncate">Fait partie de {school}</span>
    </span>
  );
}

/** Badge de l'utilisateur connecté, seulement s'il est vérifié (hors admin sans école). */
export function MySchoolBadge(props: { onDark?: boolean; className?: string }) {
  const { verificationStatus, isVerified, school } = useAuth();
  if (!isVerified || verificationStatus !== "verified" || !school) return null;
  return <SchoolBadge school={school} {...props} />;
}
