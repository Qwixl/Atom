/**
 * Atom message construction for A2A v1.0.
 *
 * The v1.0 `Message` type is generated from protobuf, so every field is present
 * on the type even where the protocol treats it as optional — `contextId` and
 * `taskId` are plain strings rather than `string | undefined`, and `extensions`
 * and `referenceTaskIds` are arrays that must exist. Building a literal at each
 * call site would mean repeating six pieces of boilerplate to say one thing, so
 * it is said once here.
 *
 * `role` stays a string in Atom's own API and is translated to the `Role` enum on
 * the way out. Callers in `agent-backend` and the shell speak in terms of "user"
 * and "agent"; there is no reason to push a protobuf enum through them.
 *
 * Outgoing **Governed Object** messages declare `ATOM_A2A_EXTENSION` in
 * `extensions` (D130). MLS-only messages must not (Option A): set
 * `declareDataObjectExtension: false` so the GO URI is not stamped on MLS wire
 * or handshake traffic.
 */

import { v4 as uuidv4 } from "uuid";
import { Role, type Message, type Part } from "@a2a-js/sdk";
import { ATOM_A2A_EXTENSION } from "./constants.js";

/** Atom's spelling of a message sender, translated to the v1.0 `Role` enum. */
export type AtomRole = "user" | "agent";

export interface AtomMessageParams {
  parts: Part[];
  role?: AtomRole;
  contextId?: string;
  taskId?: string;
  /**
   * When true (default), declare `ATOM_A2A_EXTENSION`. MLS-only sends set false
   * so the GO extension URI is not claimed on non-GO traffic (D130 Option A).
   */
  declareDataObjectExtension?: boolean;
  /** Extension URIs to declare in addition to (or instead of, when GO is off) the defaults. */
  extensions?: string[];
}

export function toRole(role: AtomRole | undefined): Role {
  return role === "agent" ? Role.ROLE_AGENT : Role.ROLE_USER;
}

export function fromRole(role: Role): AtomRole {
  return role === Role.ROLE_AGENT ? "agent" : "user";
}

/** Build an A2A v1.0 message carrying Atom parts. */
export function atomMessage(params: AtomMessageParams): Message {
  const declareGo = params.declareDataObjectExtension !== false;
  const extensions = [
    ...(declareGo ? [ATOM_A2A_EXTENSION] : []),
    ...(params.extensions ?? []),
  ].filter((uri, i, all) => all.indexOf(uri) === i);
  return {
    messageId: uuidv4(),
    role: toRole(params.role),
    parts: params.parts,
    // Absent ids are the empty string in v1.0, not `undefined`.
    contextId: params.contextId ?? "",
    taskId: params.taskId ?? "",
    extensions,
    referenceTaskIds: [],
    metadata: undefined,
  };
}

/** A plain text part, used for the acknowledgement when there is nothing to return. */
export function textPart(text: string): Part {
  return {
    content: { $case: "text", value: text },
    mediaType: "text/plain",
    filename: "",
    metadata: undefined,
  };
}
