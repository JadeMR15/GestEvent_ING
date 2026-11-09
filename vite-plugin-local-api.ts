// En développement uniquement : fait tourner les fonctions du dossier api/ (comme Vercel en ligne)
// pour que "npm run dev" puisse appeler /api/verify-student.
import { loadEnv, runnerImport, type Plugin } from "vite";
import path from "node:path";

export function localApi(): Plugin {
  return {
    name: "plav-local-api",
    apply: "serve",
    configureServer(server) {
      // Rend SUPABASE_SERVICE_ROLE_KEY (sans préfixe VITE_) visible côté serveur, jamais dans le navigateur.
      const env = loadEnv(server.config.mode, server.config.root, "");
      for (const [k, v] of Object.entries(env)) {
        if (k.startsWith("SUPABASE_") && !process.env[k]) process.env[k] = v;
      }

      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z0-9-]+)(?:\?.*)?$/);
        if (!match) return next();
        try {
          const file = path.join(server.config.root, "api", `${match[1]}.ts`);
          const { module } = await runnerImport<Record<string, (r: Request) => Promise<Response>>>(file);
          const handler = module[req.method ?? "GET"];
          if (!handler) { res.statusCode = 405; res.end(); return; }

          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const response = await handler(
            new Request(`http://localhost${req.url}`, {
              method: req.method,
              headers,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}
