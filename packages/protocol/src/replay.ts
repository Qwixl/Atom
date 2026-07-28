/**
 * Replay rejection for Governed Objects (draft {{replay}}).
 *
 * A Relying Receiver MUST reject an object whose `id` it has previously accepted
 * from the same `issuerDid`. Retention should cover at least the maximum object
 * lifetime the receiver will accept.
 */
export class ReplayGuard {
  #seen = new Set<string>();

  static key(issuerDid: string, id: string): string {
    return `${issuerDid}\u0000${id}`;
  }

  /** True when this `(issuerDid, id)` has not been admitted before. */
  admit(object: { issuerDid: string; id: string }): boolean {
    const key = ReplayGuard.key(object.issuerDid, object.id);
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return true;
  }

  has(object: { issuerDid: string; id: string }): boolean {
    return this.#seen.has(ReplayGuard.key(object.issuerDid, object.id));
  }

  get size(): number {
    return this.#seen.size;
  }
}
