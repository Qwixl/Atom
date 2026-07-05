import { createHash } from "node:crypto";

export function hashConsequentialAction(action: {
  id: string;
  kind: string;
  title: string;
  terms: Record<string, string>;
}): string {
  const canonical = JSON.stringify({
    id: action.id,
    kind: action.kind,
    title: action.title,
    terms: Object.fromEntries(Object.entries(action.terms).sort(([a], [b]) => a.localeCompare(b))),
  });
  return createHash("sha256").update(canonical).digest("base64url");
}
