import { supabase } from "@/integrations/supabase/client";

// Vérification par adresse email d'école (supabase/school_email.sql + fonction school-email).

// "unavailable" : la base n'a pas répondu ; le serveur fera le contrôle à l'envoi.
export type EmailKind = "known" | "unknown" | "public" | "invalid" | "unavailable";

export interface EmailClassification {
  kind: EmailKind;
  domain?: string;
  school?: string;
}

export interface SchoolDomainRequest {
  id: string;
  user_id: string;
  email: string;
  domain: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
}

export interface SchoolDomain {
  id: string;
  school_name: string;
  domain: string;
  active: boolean;
  created_at: string;
}

// Tables et fonctions pas encore dans les types générés.
export const db = supabase as any;

/** Indication immédiate pendant la saisie (le serveur refait le contrôle à l'envoi et au clic). */
export async function classifyEmail(email: string): Promise<EmailClassification> {
  const { data, error } = await db.rpc("classify_school_email", { _email: email });
  if (error || !data) {
    console.error("classify_school_email", error);
    return { kind: "unavailable" };
  }
  return data as EmailClassification;
}

async function call<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  const { data, error } = await supabase.functions.invoke("school-email", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    return { error: detail?.error ?? "Service indisponible. Réessaie plus tard." } as T & { error?: string };
  }
  return (data ?? {}) as T & { error?: string };
}

export const requestSchoolEmailLink = (email: string) =>
  call<{ status?: "sent" | "unknown"; school?: string; domain?: string }>({ action: "request", email });

export const confirmSchoolEmail = (token: string) =>
  call<{ ok?: boolean; school?: string }>({ action: "confirm", token });

export const approveDomainRequest = (requestId: string, schoolName: string, domain: string) =>
  call<{ ok?: boolean; notified?: number }>({ action: "approve_domain", request_id: requestId, school_name: schoolName, domain });

export const rejectDomainRequest = (requestId: string, note: string) =>
  call<{ ok?: boolean }>({ action: "reject_domain", request_id: requestId, note });

export const KIND_HINT: Record<EmailKind, string> = {
  known: "",
  unknown: "Ton école n'est pas encore reconnue : tu peux demander son ajout.",
  public: "Une messagerie personnelle (Gmail, Outlook…) ne prouve pas ton école. Utilise l'adresse fournie par ton école.",
  invalid: "Adresse email invalide.",
  unavailable: "Impossible de vérifier le domaine pour l'instant : envoie quand même, le serveur le contrôlera.",
};
