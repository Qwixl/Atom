/**
 * Atom's `data` part codec for A2A v1.0.
 *
 * Every Atom payload — data objects, MLS wire bytes, MLS handshakes — travels in
 * an A2A `data` part, so the v1.0 part shape is confined to this module and the
 * three codecs above it deal only in envelopes.
 *
 * Two things changed in v1.0 and both are handled here. A part is no longer
 * discriminated by `kind`; the content is a protobuf `oneof`, reached through
 * `content.$case`. And `mediaType` is now a field on the part itself, where Atom
 * had to carry it as a key inside the payload because v0.3 gave it nowhere else
 * to live.
 *
 * We write the media type in both places and read it from either. A part built
 * here is legible to any v1.0 tool that knows nothing about Atom, while a peer
 * still running v0.3 — or a module written against the older envelope — keeps
 * working, because the key it looks for is still in the payload. The duplication
 * is deliberate and temporary: the envelope key can be dropped once no peer on
 * the network reads it, which is a decision for a later release, not this one.
 */

import type { Part } from "@a2a-js/sdk";

/** Build an Atom `data` part carrying `envelope` under `mediaType`. */
export function toAtomDataPart(mediaType: string, envelope: object): Part {
  return {
    content: { $case: "data", value: envelope },
    mediaType,
    // Required by the generated type; an Atom envelope is not a file.
    filename: "",
    metadata: undefined,
  };
}

/**
 * Read the payload of an Atom `data` part, or `undefined` if this part is not
 * one. Matches on the part's own `mediaType` first and falls back to the
 * envelope key, so parts from a v0.3 peer are still recognised.
 */
export function readAtomDataPart(part: Part, mediaType: string): unknown {
  if (part.content?.$case !== "data") return undefined;
  const value = part.content.value;
  if (part.mediaType && part.mediaType !== mediaType) return undefined;
  if (!part.mediaType && envelopeMediaType(value) !== mediaType) return undefined;
  return value;
}

function envelopeMediaType(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as { mediaType?: unknown }).mediaType;
  return typeof candidate === "string" ? candidate : undefined;
}
