export function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function readFlagValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      index += 1;
      if (index < args.length) out.push(args[index]!);
    }
  }
  return out;
}

export function collectPositional(args: string[], skipFlags = new Set(["--kind", "--host", "--did", "--peer", "--message", "--ttl", "--after", "--email", "--handle", "--platform", "--control-plane"])): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token.startsWith("-")) {
      if (skipFlags.has(token)) index += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

/** Global CLI flags applied before subcommand routing. */
export function applyGlobalFlags(argv: string[]): string[] {
  const args = [...argv];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--platform") {
      const value = args[index + 1]?.trim();
      if (!value) {
        console.error("Usage: atom --platform <url> <command…>");
        process.exit(1);
      }
      process.env.ATOM_PLATFORM_URL = value.replace(/\/$/, "");
      args.splice(index, 2);
      index -= 1;
      continue;
    }
    if (args[index] === "--control-plane") {
      const value = args[index + 1]?.trim();
      if (!value) {
        console.error("Usage: atom --control-plane <url> <command…>");
        process.exit(1);
      }
      process.env.ATOM_CONTROL_PLANE_URL = value.replace(/\/$/, "");
      args.splice(index, 2);
      index -= 1;
    }
  }
  return args;
}
