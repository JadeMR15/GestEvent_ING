import { supabase } from "@/integrations/supabase/client";

// Les nouvelles tables ne sont pas encore dans les types générés : on passe par un client non typé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export interface School {
  id: string;
  name: string;
  email_domains: string[];
  status: "pending" | "active" | "rejected";
  status_note?: string | null;
  created_at?: string;
}

export interface Association {
  id: string;
  school_id: string;
  name: string;
  description: string;
  status: "pending" | "active" | "suspended";
  requires_approval: boolean;
  logo_path?: string | null;
  created_at?: string;
}

export interface SchoolMessage {
  id: string;
  school_id: string;
  association_id: string;
  event_id: string | null;
  sender_id: string | null;
  from_school: boolean;
  body: string;
  read_at: string | null;
  created_at: string;
}

export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type MembershipStatus = "none" | "pending" | "approved" | "rejected";

export const PUBLIC_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com",
  "outlook.fr", "live.com", "live.fr", "msn.com", "icloud.com", "me.com", "mac.com", "orange.fr", "wanadoo.fr",
  "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "aol.com", "gmx.fr", "gmx.com", "proton.me",
  "protonmail.com", "yandex.com", "mail.com",
];

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** "@Efrei.fr, efrei.net" → ["efrei.fr", "efrei.net"] (null si un domaine est invalide). */
export function parseDomains(input: string): { domains: string[]; error?: string } {
  const domains: string[] = [];
  for (const raw of input.split(/[,;\s]+/)) {
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    if (!d) continue;
    if (!DOMAIN_RE.test(d)) return { domains, error: `Domaine invalide : ${d}` };
    if (PUBLIC_EMAIL_DOMAINS.includes(d)) return { domains, error: `${d} est une messagerie grand public, pas un domaine d'école.` };
    if (!domains.includes(d)) domains.push(d);
  }
  if (domains.length === 0) return { domains, error: "Indique au moins un domaine email de l'école." };
  if (domains.length > 10) return { domains, error: "10 domaines maximum." };
  return { domains };
}

export function emailMatchesDomains(email: string, domains: string[]): boolean {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  return !!d && domains.some((x) => d === x || d.endsWith("." + x));
}

export async function fetchActiveSchools(): Promise<School[]> {
  const { data } = await db.from("schools").select("id, name, email_domains, status").eq("status", "active").order("name");
  return (data as School[] | null) ?? [];
}

export async function fetchSchoolAssociations(schoolId: string): Promise<Association[]> {
  const { data } = await db
    .from("associations")
    .select("id, school_id, name, description, status, requires_approval")
    .eq("school_id", schoolId)
    .neq("status", "suspended")
    .order("name");
  return (data as Association[] | null) ?? [];
}

/** Traduit les erreurs levées par les fonctions SQL en message lisible. */
export function schoolErrorMessage(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  const map: [string, string][] = [
    ["membership_pending", "Ton école doit d'abord valider ton rattachement (ton email n'est pas sur le domaine de l'école)."],
    ["association_inactive", "Ton association doit d'abord être validée par l'école."],
    ["association_required", "Choisis ton association dans Paramètres."],
    ["association_not_found", "Association introuvable."],
    ["school_not_found", "École introuvable ou pas encore validée."],
    ["school_email_domain_mismatch", "L'email doit être sur un des domaines déclarés pour l'école."],
    ["public_domain", "Les messageries grand public (gmail, outlook…) ne peuvent pas être des domaines d'école."],
    ["invalid_domain", "Un des domaines email est invalide."],
    ["domain_required", "Indique au moins un domaine email de l'école."],
    ["message_required", "Écris un message pour expliquer le refus."],
    ["not_pending", "Cet événement a déjà été traité."],
    ["event_not_available", "Cet événement n'est pas encore publié."],
    ["event_private", "Événement réservé aux étudiants vérifiés de l'école."],
    ["account_not_verified", "Vérifie ton compte étudiant pour t'inscrire."],
    ["forbidden", "Action non autorisée."],
    ["duplicate key", "Ce nom est déjà utilisé."],
  ];
  for (const [k, v] of map) if (m.includes(k)) return v;
  return "Une erreur est survenue. Réessaie.";
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_required: "",
  pending: "En attente de l'école",
  approved: "Validé par l'école",
  rejected: "Refusé par l'école",
};

export interface AssociationStats {
  association_id: string;
  events_total: number;
  events_upcoming: number;
  events_pending: number;
  registrations: number;
  attended: number;
  capacity: number;
  revenue: number;
  members: number;
}

export const ASSOCIATION_STATUS_BADGE: Record<Association["status"], { label: string; className: string }> = {
  active:    { label: "Active",     className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  pending:   { label: "À valider",  className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  suspended: { label: "Suspendue",  className: "bg-red-100 text-red-800 hover:bg-red-100" },
};

export const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

export const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  not_required: "",
  pending: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  approved: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  rejected: "bg-red-100 text-red-800 hover:bg-red-100",
};
