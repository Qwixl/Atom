/** Chat feed surfaces opened by shell intent (not LLM composition). */
export function isChatOwnedSurface(surfaceId: string): boolean {
  return /-chat-\d+$/.test(surfaceId);
}
