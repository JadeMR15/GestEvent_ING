import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();
// shellComponent renders <html><head><body> and is only valid for SSR hydration.
// In CSR mode it would render inside <div id="root">, producing invalid HTML.
// Setting it to undefined makes TanStack Router fall back to SafeFragment.
(router.routeTree as any).options.shellComponent = undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
