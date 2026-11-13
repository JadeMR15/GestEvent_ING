import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listenForNativeOAuth, postLoginTarget } from "@/lib/oauth";
import "./styles.css";

const router = getRouter();
// shellComponent renders <html><head><body> and is only valid for SSR hydration.
// In CSR mode it would render inside <div id="root">, producing invalid HTML.
// Setting it to undefined makes TanStack Router fall back to SafeFragment.
(router.routeTree as any).options.shellComponent = undefined;

// App iOS/Android : retour de Google / Apple via com.plav.app://auth/callback
listenForNativeOAuth(
  async () => {
    const { data } = await supabase.auth.getUser();
    toast.success("Bienvenue !");
    router.navigate({ to: (data.user ? await postLoginTarget(data.user.id) : "/events") as any });
  },
  (message) => toast.error(message),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
