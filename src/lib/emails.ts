import { supabase } from "@/integrations/supabase/client";

export interface EmailResult {
  ok?: boolean;
  sent?: number;
  error?: string;
}

/** Appelle une fonction d'envoi d'email Supabase avec le jeton de l'utilisateur connecté. */
export async function invokeEmail(
  name: "send-confirmation-email" | "send-event-emails",
  body: Record<string, unknown>,
): Promise<EmailResult> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Le message d'erreur renvoyé par la fonction est dans la réponse HTTP.
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    return { error: detail?.error ?? error.message };
  }
  return (data as EmailResult) ?? {};
}
