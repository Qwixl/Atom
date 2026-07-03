import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["development", "import", "module", "browser", "default"],
  },
  server: {
    port: 5200,
    strictPort: true,
    // Allow resolving workspace packages symlinked under packages/
    fs: { allow: [repoRoot] },
  },
  optimizeDeps: {
    include: [
      "@ag-ui/client",
      "@atom/a2ui-adapter",
      "@atom/ag-ui-adapter",
      "@atom/renderer-web",
      "@atom/secret-store",
      "@atom/shell-core",
    ],
  },
});
