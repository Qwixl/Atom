import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRegistryText } from "./verify.js";

/** Default max bundle size for curated registry (512 KiB). */
export const DEFAULT_MAX_BUNDLE_BYTES = 512 * 1024;

export interface BundleScanIssue {
  moduleId: string;
  bundlePath: string;
  rule: string;
  detail: string;
  severity: "error" | "warning";
}

export interface BundleScanOptions {
  registryDir: string;
  bundleBase: string;
  maxBytes?: number;
  /** When true, external script/fetch patterns fail the scan (not just warn). */
  strictExternal?: boolean;
}

const FORBIDDEN_PATTERNS: Array<{ rule: string; pattern: RegExp; detail: string }> = [
  { rule: "no-eval", pattern: /\beval\s*\(/, detail: "eval() is not allowed in module bundles" },
  {
    rule: "no-new-function",
    pattern: /\bnew\s+Function\s*\(/,
    detail: "new Function() is not allowed in module bundles",
  },
  {
    rule: "no-document-write",
    pattern: /\bdocument\.write\s*\(/,
    detail: "document.write() is not allowed in module bundles",
  },
];

const EXTERNAL_PATTERNS: Array<{ rule: string; pattern: RegExp; detail: string }> = [
  {
    rule: "external-script-src",
    pattern: /<script[^>]+src=["']https?:\/\//i,
    detail: "External script src — prefer bundling assets or same-origin static files",
  },
  {
    rule: "external-fetch",
    pattern: /\bfetch\s*\(\s*["']https?:\/\//,
    detail: "Hard-coded external fetch URL — review for data exfiltration",
  },
];

function resolveBundlePath(bundleUrl: string, manifestPath: string, bundleBase: string): string {
  if (bundleUrl.startsWith("/")) {
    return path.join(bundleBase, bundleUrl.slice(1));
  }
  return path.resolve(path.dirname(manifestPath), bundleUrl);
}

export function scanText(moduleId: string, bundlePath: string, text: string, strictExternal: boolean): BundleScanIssue[] {
  const issues: BundleScanIssue[] = [];
  for (const { rule, pattern, detail } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({ moduleId, bundlePath, rule, detail, severity: "error" });
    }
  }
  for (const { rule, pattern, detail } of EXTERNAL_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        moduleId,
        bundlePath,
        rule,
        detail,
        severity: strictExternal ? "error" : "warning",
      });
    }
  }
  return issues;
}

export async function scanRegistryBundles(options: BundleScanOptions): Promise<BundleScanIssue[]> {
  const indexPath = path.join(options.registryDir, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as {
    modules: Array<{ id: string; manifestUrl: string }>;
  };
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BUNDLE_BYTES;
  const strictExternal = options.strictExternal === true;
  const issues: BundleScanIssue[] = [];

  for (const entry of index.modules) {
    const manifestPath = path.resolve(options.registryDir, entry.manifestUrl);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { bundleUrl?: string };
    if (!manifest.bundleUrl) continue;

    const bundlePath = resolveBundlePath(manifest.bundleUrl, manifestPath, options.bundleBase);
    const raw = await readFile(bundlePath);
    if (raw.byteLength > maxBytes) {
      issues.push({
        moduleId: entry.id,
        bundlePath,
        rule: "max-size",
        detail: `Bundle ${raw.byteLength} bytes exceeds limit ${maxBytes}`,
        severity: "error",
      });
    }

    const text = Buffer.from(normalizeRegistryText(raw)).toString("utf8");
    issues.push(...scanText(entry.id, bundlePath, text, strictExternal));
  }

  return issues;
}

export function formatBundleScanReport(issues: BundleScanIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((issue) => `${issue.moduleId}: [${issue.severity}] ${issue.rule} — ${issue.detail}`)
    .join("\n");
}
