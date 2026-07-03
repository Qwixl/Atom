import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ScaffoldOptions {
  moduleId: string;
  outDir: string;
  publisher?: string;
}

const TEMPLATE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../templates/module",
);

function substitute(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function bundleSlug(moduleId: string): string {
  return moduleId.replace(/\//g, "-");
}

export function scaffoldModule(options: ScaffoldOptions): void {
  const { moduleId, outDir } = options;
  if (!/^[\w-]+\/[\w-]+$/.test(moduleId)) {
    throw new Error(`Invalid module id "${moduleId}" — use namespace/name (e.g. acme/widget)`);
  }
  if (!existsSync(TEMPLATE_ROOT)) {
    throw new Error(`Module template not found at ${TEMPLATE_ROOT}`);
  }
  if (existsSync(outDir)) {
    throw new Error(`Output directory already exists: ${outDir}`);
  }

  const publisher = options.publisher ?? "did:key:z6MkreplaceWithYourDid";
  const componentName = moduleId;
  const vars = {
    MODULE_ID: moduleId,
    COMPONENT_NAME: componentName,
    SEMANTIC_ROLE: "display/card",
    PUBLISHER: publisher,
    BUNDLE_SLUG: bundleSlug(moduleId),
  };

  mkdirSync(path.join(outDir, "bundle"), { recursive: true });

  for (const rel of ["manifest.json", "README.md", "bundle/index.html"] as const) {
    const src = path.join(TEMPLATE_ROOT, rel);
    const dest = path.join(outDir, rel);
    const raw = readFileSync(src, "utf8");
    writeFileSync(dest, substitute(raw, vars));
  }

  console.log(`Scaffolded module ${moduleId} → ${outDir}`);
  console.log(`  Next: edit bundle/index.html, then atom-registry publish`);
}
