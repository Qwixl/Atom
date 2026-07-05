import path from "node:path";

export function defaultDataDir(): string {
  if (process.env.ATOM_DATA_DIR?.trim()) return process.env.ATOM_DATA_DIR.trim();
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".atom");
}

export function resolveDataPath(fileName: string): string {
  const identityOverride = process.env.ATOM_AGENT_IDENTITY_PATH?.trim();
  if (identityOverride) {
    return path.join(path.dirname(identityOverride), fileName);
  }
  return path.join(defaultDataDir(), fileName);
}
