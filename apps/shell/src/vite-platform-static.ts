import type { Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platformIndex = path.join(shellRoot, "public", "index.html");

/**
 * Dev: minimal platform landing at / + React SPA at /app.
 * Qwixl commercial marketing lives in private Atom-MC (not this repo).
 */
export function platformStaticPlugin(): Plugin {
  return {
    name: "atom-platform-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? "/";
        const urlPath = raw.split("?")[0] ?? "/";
        const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";

        if (urlPath.startsWith("/app/modules/")) {
          req.url = `${urlPath.slice("/app".length)}${qs}`;
          return next();
        }

        if (urlPath === "/install" || urlPath.startsWith("/install/")) {
          req.url = `/app.html${qs}`;
          return next();
        }

        if (urlPath === "/app" || urlPath.startsWith("/app/")) {
          req.url = `/app.html${qs}`;
          return next();
        }

        if (
          urlPath.startsWith("/src") ||
          urlPath.startsWith("/@") ||
          urlPath.startsWith("/node_modules") ||
          urlPath.startsWith("/agent-api") ||
          urlPath.startsWith("/fonts/") ||
          urlPath.startsWith("/icons/") ||
          urlPath.startsWith("/modules/") ||
          (urlPath.includes(".") && urlPath !== "/")
        ) {
          return next();
        }

        if ((urlPath === "/" || urlPath === "") && existsSync(platformIndex)) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(readFileSync(platformIndex, "utf8"));
          return;
        }

        return next();
      });
    },
  };
}
