import { Capacitor } from "@capacitor/core";

// Dans l'app iOS/Android, il n'y a pas de serveur local : on vise l'API déployée sur Vercel.
const NATIVE_API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://plavv.vercel.app";

export function apiUrl(path: string): string {
  return Capacitor.isNativePlatform() ? `${NATIVE_API_ORIGIN}${path}` : path;
}
