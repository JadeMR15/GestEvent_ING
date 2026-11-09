import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { localApi } from "./vite-plugin-local-api";

export default defineConfig({
  cloudflare: process.env.VERCEL ? false : undefined,
  vite: { server: { host: true }, plugins: [localApi()] },
});
