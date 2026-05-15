import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

// Find TanStack Start manifest in dist/server/assets/
const serverAssets = readdirSync("dist/server/assets");
const manifestFile = serverAssets.find((f) =>
  f.startsWith("_tanstack-start-manifest")
);
if (!manifestFile) throw new Error("Manifest not found in dist/server/assets/");

const manifest = readFileSync(
  join("dist/server/assets", manifestFile),
  "utf-8"
);

// Extract clientEntry
const entryMatch = manifest.match(/clientEntry:\s*["']([^"']+)["']/);
if (!entryMatch) throw new Error("clientEntry not found in manifest");
const clientEntry = entryMatch[1]; // e.g. "/assets/index-DUHDOmj1.js"

// Find main CSS file
const clientAssets = readdirSync("dist/client/assets");
const cssFile = clientAssets.find(
  (f) => f.startsWith("styles-") && f.endsWith(".css")
);
const cssLink = cssFile
  ? `<link rel="stylesheet" href="/assets/${cssFile}" />`
  : "";

const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Plav'</title>
    ${cssLink}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${clientEntry}"></script>
  </body>
</html>`;

writeFileSync("dist/client/index.html", html);
console.log("✓ Generated dist/client/index.html");
console.log("  clientEntry:", clientEntry);
console.log("  CSS:", cssFile ?? "none");
