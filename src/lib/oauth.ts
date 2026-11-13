import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";

export type OAuthProvider = "google" | "apple";

// Lien de retour vers l'app iOS (déclaré dans ios/App/App/Info.plist)
const NATIVE_CALLBACK = "com.plav.app://auth/callback";

export async function signInWithProvider(provider: OAuthProvider) {
  if (!Capacitor.isNativePlatform()) {
    // Site : Supabase redirige vers /auth/callback, qui lit la session dans l'URL.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return;
  }

  // App : la page Google/Apple s'ouvre dans un navigateur intégré,
  // puis revient dans l'app via com.plav.app://auth/callback.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  await Browser.open({ url: data.url, presentationStyle: "popover" });
}

// À appeler une fois au démarrage de l'app : récupère la session renvoyée par Supabase.
export function listenForNativeOAuth(onSignedIn: () => void, onError: (message: string) => void) {
  if (!Capacitor.isNativePlatform()) return;

  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_CALLBACK)) return;
    await Browser.close().catch(() => {});

    // Supabase renvoie les jetons dans le fragment (#access_token=...&refresh_token=...)
    const params = new URLSearchParams(url.split("#")[1] ?? url.split("?")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      onError(params.get("error_description") ?? "Connexion annulée.");
      return;
    }
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) onError(error.message);
    else onSignedIn();
  });
}

// Où envoyer quelqu'un juste après sa connexion.
export async function postLoginTarget(userId: string): Promise<string> {
  const redirect = sessionStorage.getItem("loginRedirect");
  if (redirect) {
    sessionStorage.removeItem("loginRedirect");
    return redirect;
  }
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  return roleSet.has("admin") || roleSet.has("organizer") ? "/dashboard" : "/events";
}
