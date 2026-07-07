import type { Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketingRoot = path.join(shellRoot, "marketing");

function resolveMarketingPath(urlPath: string): string | null {
  const clean = urlPath.split("?")[0]?.replace(/\/+$/, "") || "/";
  if (clean === "/") return path.join(marketingRoot, "index.html");
  const named = path.join(marketingRoot, `${clean.slice(1)}.html`);
  if (existsSync(named)) return named;
  const index = path.join(marketingRoot, clean.slice(1), "index.html");
  if (existsSync(index)) return index;
  return null;
}

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveMarketingAsset(urlPath: string): { file: string; type: string } | null {
  if (!urlPath.startsWith("/css/") && !urlPath.startsWith("/js/")) return null;
  const file = path.join(marketingRoot, urlPath.slice(1));
  if (!existsSync(file)) return null;
  const ext = path.extname(file);
  return { file, type: MIME[ext] ?? "application/octet-stream" };
}

/** Dev: static HTML at / + React SPA at /app via app.html */
export function marketingStaticPlugin(): Plugin {
  return {
    name: "atom-marketing-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? "/";
        const urlPath = raw.split("?")[0] ?? "/";
        const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";

        // Module bundles are served from /modules/ in dev (public dir root).
        // Do not rewrite /app/modules/* to the React shell.
        if (urlPath.startsWith("/app/modules/")) {
          req.url = `${urlPath.slice("/app".length)}${qs}`;
          return next();
        }

        if (urlPath === "/app" || urlPath.startsWith("/app/")) {
          req.url = `/app.html${qs}`;
          return next();
        }

        const asset = resolveMarketingAsset(urlPath);
        if (asset) {
          res.statusCode = 200;
          res.setHeader("Content-Type", asset.type);
          res.end(readFileSync(asset.file));
          return;
        }

        if (
          urlPath.startsWith("/src") ||
          urlPath.startsWith("/@") ||
          urlPath.startsWith("/node_modules") ||
          urlPath.startsWith("/agent-api") ||
          urlPath.startsWith("/fonts/") ||
          urlPath.startsWith("/icons/") ||
          urlPath.includes(".")
        ) {
          return next();
        }

        const file = resolveMarketingPath(urlPath);
        if (!file) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readFileSync(file, "utf8"));
      });
    },
  };
}
