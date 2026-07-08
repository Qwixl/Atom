import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bundleStatementReferencesDigest,
  isSigstoreBundleShape,
} from "@qwixl/shell-core";
import { buildDigestAnchoredSigstoreBundle } from "./sign.js";

describe("buildDigestAnchoredSigstoreBundle", () => {
  it("produces a Sigstore-shaped bundle bound to the manifest digest", () => {
    const bytes = Buffer.from('{"id":"games/tictactoe","version":"1.0.0"}\n', "utf8");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const bundle = buildDigestAnchoredSigstoreBundle(bytes);
    expect(isSigstoreBundleShape(bundle)).toBe(true);
    expect(bundleStatementReferencesDigest(bundle as never, digest)).toBe(true);
  });
});
