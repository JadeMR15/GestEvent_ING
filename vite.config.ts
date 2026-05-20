import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: process.env.VERCEL ? false : undefined,
  vite: { server: { host: true } },
});
