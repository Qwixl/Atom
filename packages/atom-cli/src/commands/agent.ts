import { spawn } from "node:child_process";
import { findMonorepoRoot } from "../connection.js";
import { isLocalPlatformUrl, probePlatform, resolveControlPlaneUrl, resolvePlatformUrl, DEFAULT_PLATFORM_URL } from "../platform.js";

export function startAgent(args: string[]): void {
  const communityHost = args.includes("--community-host");
  const platformUrl = resolvePlatformUrl();
  const shellOrigins = new Set(
    (process.env.ATOM_SHELL_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  shellOrigins.add(platformUrl);
  if (isLocalPlatformUrl(platformUrl)) {
    shellOrigins.add("http://localhost:5200");
    shellOrigins.add("http://127.0.0.1:5200");
  }

  const env = {
    ...process.env,
    ATOM_PLATFORM_URL: platformUrl,
    ATOM_DISCOVER_INDEX_BASE: platformUrl,
    ATOM_SHELL_ORIGINS: [...shellOrigins].join(","),
    ...(communityHost ? { ATOM_COMMUNITY_HOST: "1" } : {}),
  };

  console.log(`Atom platform: ${platformUrl}`);
  console.log("Starting your agent (CLI mode — Atom stays on the hosted platform)…");
  console.log(`Credentials: ~/.atom/agent-connection.json after startup`);

  const repoRoot = findMonorepoRoot();
  if (repoRoot) {
    const build = spawn("pnpm", ["--filter", "@qwixl/business-index", "build"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env,
    });
    build.on("exit", (code) => {
      if (code !== 0) process.exit(code ?? 1);
      const agent = spawn("pnpm", ["--filter", "@qwixl/agent-backend", "dev"], {
        cwd: repoRoot,
        stdio: "inherit",
        shell: true,
        env,
      });
      agent.on("exit", (agentCode) => process.exit(agentCode ?? 0));
    });
    return;
  }

  const child = spawn("atom-agent", [], { stdio: "inherit", shell: true, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

export async function showPlatform(): Promise<void> {
  const platformUrl = resolvePlatformUrl();
  const controlPlaneUrl = resolveControlPlaneUrl();
  const online = await probePlatform(platformUrl);
  const usingDefault = platformUrl === DEFAULT_PLATFORM_URL.replace(/\/$/, "");
  console.log(`Atom platform:  ${platformUrl}${online ? " (reachable)" : " (not reachable from here)"}`);
  console.log(`Control plane:  ${controlPlaneUrl}`);
  if (usingDefault && !process.env.ATOM_PLATFORM_URL) {
    console.log(`Default:        ${DEFAULT_PLATFORM_URL}`);
  } else {
    console.log("Override:       ATOM_PLATFORM_URL or atom --platform <url>");
  }
  console.log("");
  console.log("Atom is always on. Start only your agent with: atom agent start");
  console.log("Open Atom in a browser at the platform URL when you want the UI.");
  console.log("");
  console.log("Local/fork override examples:");
  console.log("  atom --platform http://localhost:5200 agent start");
  console.log("  ATOM_PLATFORM_URL=http://localhost:5200 atom discover search coffee");
}
