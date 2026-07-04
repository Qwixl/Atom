import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import readline from "node:readline";

const execFileAsync = promisify(execFile);

export function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, host);
  });
}

export async function findListeningPid(host: string, port: number): Promise<number | null> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("netstat", ["-ano"], { encoding: "utf8" });
    const portSuffix = `:${port}`;
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const local = line.trim().split(/\s+/)[1] ?? "";
      if (!local.endsWith(portSuffix) && !local.includes(`${portSuffix} `)) continue;
      const pid = Number(line.trim().split(/\s+/).at(-1));
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    );
    const pid = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function killProcess(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/F"]);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") throw error;
  }
}

export type PortConflictChoice = "next" | "kill";

export async function promptPortConflict(
  port: number,
  ask: (message: string) => Promise<string> = promptLine,
): Promise<PortConflictChoice> {
  const raw = await ask(`Port ${port} is in use. Try another port [p] or kill and retry [k]? `);
  const choice = raw.trim().toLowerCase();
  if (choice === "p" || choice.startsWith("p")) return "next";
  if (choice === "k" || choice.startsWith("k")) return "kill";
  throw new Error(`Startup cancelled (expected [p] or [k], got "${raw.trim() || "(empty)"}").`);
}

function promptLine(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("Cannot prompt: stdin is not a TTY.");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on("error", reject);
  });
}

export interface ResolvePortOptions {
  host: string;
  startPort: number;
  interactive: boolean;
  ask?: (message: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
}

/** Resolve a listen port, prompting on conflict when `interactive` is true. */
export async function resolvePortWithPrompt(options: ResolvePortOptions): Promise<number> {
  let port = options.startPort;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  while (true) {
    if (await isPortAvailable(options.host, port)) return port;

    if (!options.interactive) {
      throw new Error(
        `Port ${port} is in use on ${options.host}. Set PORT to another value or free the port.`,
      );
    }

    const choice = await promptPortConflict(port, options.ask);
    if (choice === "next") {
      port += 1;
      continue;
    }

    const pid = await findListeningPid(options.host, port);
    if (pid === null) {
      console.warn(`No listener found on port ${port}; retrying...`);
    } else if (pid === process.pid) {
      throw new Error(`Port ${port} is held by this process; choose another port [p].`);
    } else {
      console.warn(`Stopping process ${pid} on port ${port}...`);
      await killProcess(pid);
      await sleep(400);
    }
  }
}

export function publicBaseUrlForPort(host: string, port: number): string {
  return `http://${host}:${port}`;
}
