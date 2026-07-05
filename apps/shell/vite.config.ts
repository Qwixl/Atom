import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Keep in sync with scripts/dev-demo.mjs */
const DEMO_ALICE_URL = "http://127.0.0.1:5204";
const DEMO_ALICE_TOKEN = "atom-demo-alice-token";
const DEMO_BOB_URL = "http://127.0.0.1:5206";
const DEMO_BOB_TOKEN = "atom-demo-bob-token";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_DEMO_MODE": JSON.stringify(process.env.VITE_DEMO_MODE ?? ""),
    "import.meta.env.VITE_DEMO_ALICE_URL": JSON.stringify(
      process.env.VITE_DEMO_ALICE_URL ?? DEMO_ALICE_URL,
    ),
    "import.meta.env.VITE_DEMO_ALICE_TOKEN": JSON.stringify(
      process.env.VITE_DEMO_ALICE_TOKEN ?? DEMO_ALICE_TOKEN,
    ),
    "import.meta.env.VITE_DEMO_BOB_URL": JSON.stringify(process.env.VITE_DEMO_BOB_URL ?? DEMO_BOB_URL),
    "import.meta.env.VITE_DEMO_BOB_TOKEN": JSON.stringify(
      process.env.VITE_DEMO_BOB_TOKEN ?? DEMO_BOB_TOKEN,
    ),
    "import.meta.env.VITE_DEMO_PERSONAL_AGENT_URL": JSON.stringify(
      process.env.VITE_DEMO_PERSONAL_AGENT_URL ?? DEMO_ALICE_URL,
    ),
    "import.meta.env.VITE_DEMO_PERSONAL_AGENT_TOKEN": JSON.stringify(
      process.env.VITE_DEMO_PERSONAL_AGENT_TOKEN ?? DEMO_ALICE_TOKEN,
    ),
    "import.meta.env.VITE_DEMO_PEER_URL": JSON.stringify(
      process.env.VITE_DEMO_PEER_URL ?? "http://127.0.0.1:5205",
    ),
    "import.meta.env.VITE_DEMO_PEER_TOKEN": JSON.stringify(
      process.env.VITE_DEMO_PEER_TOKEN ?? "atom-demo-peer-token",
    ),
    "import.meta.env.VITE_HOSTED_STUB_AGENT_URL": JSON.stringify(
      process.env.VITE_HOSTED_STUB_AGENT_URL ?? "http://127.0.0.1:5301",
    ),
    "import.meta.env.VITE_HOSTED_STUB_AGENT_TOKEN": JSON.stringify(
      process.env.VITE_HOSTED_STUB_AGENT_TOKEN ?? "atom-hosted-dev-token",
    ),
    "import.meta.env.VITE_CONTROL_PLANE_URL": JSON.stringify(
      process.env.VITE_CONTROL_PLANE_URL ?? "http://127.0.0.1:5300",
    ),
    "import.meta.env.VITE_ATOM_BROWSER_MODE": JSON.stringify(process.env.VITE_ATOM_BROWSER_MODE ?? ""),
    "import.meta.env.VITE_ATOM_AGENT_API": JSON.stringify(process.env.VITE_ATOM_AGENT_API ?? "/agent-api"),
    "import.meta.env.VITE_ATOM_AGENT_TOKEN": JSON.stringify(process.env.VITE_ATOM_AGENT_TOKEN ?? ""),
  },
  resolve: {
    conditions: ["development", "import", "module", "browser", "default"],
  },
  server: {
    port: 5200,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/agent-api": {
        target: `http://127.0.0.1:${process.env.VITE_ATOM_INTERNAL_AGENT_PORT ?? "5204"}`,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/agent-api/, ""),
      },
    },
  },
});
