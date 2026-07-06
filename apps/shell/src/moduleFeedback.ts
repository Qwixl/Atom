import { CONTROL_PLANE_URL } from "./hostConfig.js";

export async function submitModuleFeedback(opts: {
  moduleId: string;
  version: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  const rating = Math.round(opts.rating);
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }
  const response = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/module-feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: opts.moduleId.trim(),
      version: opts.version.trim(),
      rating,
      comment: opts.comment?.trim() || undefined,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Feedback failed (${response.status})`);
  }
}
