// Espace administration Plav' : appels aux fonctions de supabase/admin_space.sql.
import { db } from "@/lib/schools";

export interface PlatformStats {
  users_total: number;
  users_new_7d: number;
  users_new_30d: number;
  users_blocked: number;
  users_by_role: Partial<Record<UserRole, number>>;
  students_verified: number;
  schools_active: number;
  schools_pending: number;
  domains_active: number;
  domains_pending: number;
  verifications_review: number;
  associations_active: number;
  associations_total: number;
  events_total: number;
  events_upcoming: number;
  tickets_total: number;
  tickets_30d: number;
  schools: { id: string; name: string; status: string; users: number; associations: number; events_upcoming: number }[];
}

export type UserRole = "admin" | "school_admin" | "organizer" | "volunteer" | "participant";
/** Rôles qu'un admin peut attribuer (les comptes école passent par l'inscription de l'école). */
export const ASSIGNABLE_ROLES = ["participant", "organizer", "volunteer", "admin"] as const;

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin Plav'",
  school_admin: "Compte école",
  organizer: "Organisateur",
  volunteer: "Bénévole",
  participant: "Participant",
};

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  avatar_path: string | null;
  role: UserRole;
  school_name: string | null;
  association_name: string | null;
  verification_status: string;
  created_at: string;
  last_sign_in_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  total_count: number;
}

const ERRORS: Record<string, string> = {
  forbidden: "Réservé aux admins Plav'.",
  cannot_change_self: "Tu ne peux pas modifier ton propre compte ici.",
  invalid_role: "Rôle invalide.",
  school_admin_locked: "C'est un compte école : il se gère depuis l'onglet Écoles.",
  cannot_block_admin: "Retire d'abord le rôle admin avant de bloquer ce compte.",
  reason_required: "Indique la raison du blocage.",
  user_not_found: "Compte introuvable.",
};

export function adminErrorMessage(message: string): string {
  for (const [code, text] of Object.entries(ERRORS)) if (message.includes(code)) return text;
  if (/admin_platform_stats|admin_list_users|admin_set_|function .* does not exist|schema cache/i.test(message)) {
    return "Lance d'abord supabase/admin_space.sql dans Supabase.";
  }
  return message;
}

export async function fetchPlatformStats(): Promise<{ data: PlatformStats | null; error?: string }> {
  const { data, error } = await db.rpc("admin_platform_stats");
  if (error) return { data: null, error: adminErrorMessage(error.message) };
  return { data: data as PlatformStats };
}

export async function listUsers(params: { search?: string; role?: string; limit?: number; offset?: number }) {
  const { data, error } = await db.rpc("admin_list_users", {
    _search: params.search || null,
    _role: params.role || null,
    _limit: params.limit ?? 30,
    _offset: params.offset ?? 0,
  });
  if (error) return { data: [] as AdminUser[], error: adminErrorMessage(error.message) };
  return { data: (data ?? []) as AdminUser[] };
}

export async function setUserRole(userId: string, role: string) {
  const { error } = await db.rpc("admin_set_role", { _user_id: userId, _role: role });
  return error ? adminErrorMessage(error.message) : null;
}

export async function setUserBlocked(userId: string, blocked: boolean, reason?: string) {
  const { error } = await db.rpc("admin_set_blocked", { _user_id: userId, _blocked: blocked, _reason: reason ?? null });
  return error ? adminErrorMessage(error.message) : null;
}
