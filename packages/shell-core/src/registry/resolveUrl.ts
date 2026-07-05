/** Resolve registry-relative URLs against an index URL (absolute https or same-origin path). */
export function resolveRegistryUrl(relativeOrAbsolute: string, baseUrl: string): string {
  const target = relativeOrAbsolute.trim();
  if (!target) {
    throw new Error("Empty registry URL");
  }
  if (/^https?:\/\//i.test(target)) {
    return target;
  }

  const base = baseUrl.trim();
  if (/^https?:\/\//i.test(base)) {
    return new URL(target, base).href;
  }

  const basePath = base.startsWith("/") ? base : `/${base}`;
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : "";
  const combined = `${baseDir}/${target}`.replace(/\/\/+/g, "/");
  return combined.startsWith("/") ? combined : `/${combined}`;
}
