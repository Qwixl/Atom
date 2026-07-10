/**
 * Eval baseline hash — ties an exact behavior assessment to the harness that produced it.
 * Ops-only (Node). Not part of the browser-safe package runtime.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(__dirname, "..");

/** Files that define categorization outcomes (relative to package root). */
export const EVAL_BASELINE_SOURCE_PATHS = [
  "evals/scenarios.ts",
  "evals/scorer.ts",
  "src/toolRegistry.ts",
  "src/prompt.ts",
  "src/modelBehavior.ts",
] as const;

export function computeEvalBaselineHash(packageRoot: string = PACKAGE_ROOT): string {
  const hash = createHash("sha256");
  for (const rel of EVAL_BASELINE_SOURCE_PATHS) {
    const abs = path.join(packageRoot, rel);
    hash.update(rel);
    hash.update("\0");
    try {
      hash.update(readFileSync(abs));
    } catch {
      hash.update("missing");
    }
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
