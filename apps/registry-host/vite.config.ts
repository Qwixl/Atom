import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shellPublic = path.join(repoRoot, "apps/shell/public");

function staticMount(mountRoot: string): Connect.NextHandleFunction {
  const normalizedRoot = path.resolve(mountRoot);
  return (req, res, next) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const filePath = path.resolve(normalizedRoot, `.${urlPath}`);
    if (!filePath.startsWith(normalizedRoot) || !existsSync(filePath)) {
      next();
      return;
    }
    if (!statSync(filePath).isFile()) {
      next();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json");
    }
    createReadStream(filePath).pipe(res);
  };
}

export default defineConfig({
  server: {
    port: 5202,
    cors: true,
  },
  plugins: [
    {
      name: "registry-host-static",
      configureServer(server) {
        server.middlewares.use("/registry", staticMount(path.join(shellPublic, "registry")));
        server.middlewares.use("/modules", staticMount(path.join(shellPublic, "modules")));
      },
    },
  ],
});
