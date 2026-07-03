import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const shellPublic = path.join(repoRoot, "apps/shell/public");
const outDir = path.join(here, "..", "dist");

mkdirSync(path.join(outDir, "registry"), { recursive: true });
mkdirSync(path.join(outDir, "modules"), { recursive: true });

cpSync(path.join(shellPublic, "registry"), path.join(outDir, "registry"), { recursive: true });
cpSync(path.join(shellPublic, "modules"), path.join(outDir, "modules"), { recursive: true });

writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Atom module registry</title></head>
  <body>
    <h1>Atom module registry</h1>
    <p>Static registry host. Browse <a href="/registry/index.json">/registry/index.json</a>.</p>
  </body>
</html>
`,
);

console.log(`Registry host static bundle written to ${outDir}`);
