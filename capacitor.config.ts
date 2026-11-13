import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.plav.app",
  appName: "Plav'",
  // Build CSR du site (le même que celui déployé sur Vercel)
  webDir: "dist/csr",
  plugins: {
    // Les fetch passent par le réseau natif : pas de blocage CORS vers l'API Vercel
    CapacitorHttp: { enabled: true },
  },
};

export default config;
