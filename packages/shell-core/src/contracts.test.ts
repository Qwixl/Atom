import { describe, expect, it } from "vitest";
import {
  PRODUCTION_REGISTRY_INDEX_URL,
  PRODUCTION_REGISTRY_ORIGIN,
  PRODUCTION_SHELL_ORIGIN,
} from "./platformUrls.js";
import { AttestationLog } from "./attestation.js";
import {
  parseAgentProtocolMessage,
  parseCompositionValue,
} from "./agentOutput.js";
import { validateModuleManifest } from "./registry/manifest.js";
import { formatIntegrity, integrityMatches, parseIntegrity } from "./registry/hash.js";
import {
  bundleStatementReferencesDigest,
  isSigstoreBundleShape,
} from "./registry/signature.js";
import { isRevoked } from "./registry/trust.js";
import { createRevocationEntry, upsertRevocation } from "./registry/revocationOps.js";
import { resolveRegistryUrl } from "./registry/resolveUrl.js";
import { validateHttpsUrl, isCrossOriginModuleBundle } from "./security/url.js";
import { validateComposition, validateConsequentialAction } from "./validate.js";

const validComposition = {
  version: 1,
  surfaceId: "surf-1",
  root: {
    id: "root",
    component: "core/text",
    props: { text: "Hello" },
  },
};

const validAction = {
  id: "act-1",
  kind: "confirmation" as const,
  title: "Confirm booking",
  terms: { flight: "AA100", total: "$420" },
};

describe("validateComposition", () => {
  it("accepts a well-formed composition", () => {
    const result = validateComposition(validComposition);
    expect(result.ok).toBe(true);
  });

  it("rejects missing surfaceId", () => {
    const result = validateComposition({ ...validComposition, surfaceId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("surfaceId"))).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const result = validateComposition({
      ...validComposition,
      root: {
        id: "dup",
        component: "core/form",
        children: [
          { id: "dup", component: "core/text", props: { text: "a" } },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateConsequentialAction", () => {
  it("accepts a well-formed action", () => {
    const result = validateConsequentialAction(validAction);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown kind", () => {
    const result = validateConsequentialAction({ ...validAction, kind: "wire-transfer" });
    expect(result.ok).toBe(false);
  });
});

describe("AttestationLog", () => {
  it("builds a verifiable hash chain", async () => {
    const log = new AttestationLog();
    await log.append({
      surfaceId: "surf-1",
      action: validAction,
      decision: "approved",
    });
    await log.append({
      surfaceId: "surf-1",
      action: { ...validAction, id: "act-2" },
      decision: "declined",
    });
    expect(await log.verify()).toBeNull();
    expect(log.list()).toHaveLength(2);
    expect(log.list()[1]?.previousHash).toBe(log.list()[0]?.hash);
  });

  it("detects tampering", async () => {
    const log = new AttestationLog();
    await log.append({
      surfaceId: "surf-1",
      action: validAction,
      decision: "approved",
    });
    const entries = [...log.list()];
    entries[0] = { ...entries[0]!, decision: "declined" };
    const tampered = new AttestationLog({ restore: entries });
    expect(await tampered.verify()).toBe(0);
  });
});

describe("parseAgentProtocolMessage", () => {
  it("parses text messages", () => {
    const result = parseAgentProtocolMessage({ type: "text", text: "Hi" });
    expect(result?.kind).toBe("output");
    if (result?.kind === "output") {
      expect(result.output).toEqual({ type: "text", text: "Hi" });
    }
  });

  it("rejects invalid compositions", () => {
    const result = parseCompositionValue({ version: 1 });
    expect(result.kind).toBe("reject");
  });

  it("parses consequential-action with surfaceId", () => {
    const result = parseAgentProtocolMessage({
      type: "consequential-action",
      surfaceId: "surf-1",
      action: validAction,
    });
    expect(result?.kind).toBe("output");
  });

  it("parses game-move messages", () => {
    const result = parseAgentProtocolMessage({
      type: "game-move",
      surfaceId: "ttt-1",
      move: { cell: 4 },
    });
    expect(result?.kind).toBe("output");
    if (result?.kind === "output") {
      expect(result.output).toEqual({
        type: "game-move",
        surfaceId: "ttt-1",
        move: { cell: 4 },
      });
    }
  });

  it("rejects malformed game-move messages", () => {
    const result = parseAgentProtocolMessage({ type: "game-move", move: { cell: 4 } });
    expect(result?.kind).toBe("reject");
  });
});

describe("registry integrity", () => {
  it("round-trips sha256 integrity format", async () => {
    const bytes = new TextEncoder().encode("module bundle");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const formatted = formatIntegrity(hex);
    expect(parseIntegrity(formatted).digest).toBe(hex);
    expect(await integrityMatches(new Uint8Array(bytes), formatted)).toBe(true);
    expect(await integrityMatches(new Uint8Array([0]), formatted)).toBe(false);
  });
});

describe("validateModuleManifest", () => {
  it("accepts a v1 pure-renderer manifest", () => {
    const manifest = validateModuleManifest({
      id: "demo/widget",
      version: "1.0.0",
      publisher: "did:key:z6Mk",
      bundleUrl: "https://example.com/bundle.js",
      targets: ["web"],
      components: [{ name: "Widget", semanticRole: "display/card" }],
      capabilities: [],
    });
    expect(manifest.id).toBe("demo/widget");
  });

  it("rejects capability requests in v1", () => {
    expect(() =>
      validateModuleManifest({
        id: "bad/module",
        version: "1.0.0",
        publisher: "did:key:z6Mk",
        bundleUrl: "https://example.com/bundle.js",
        targets: ["web"],
        components: [{ name: "Widget", semanticRole: "display/card" }],
        capabilities: ["storage"],
      }),
    ).toThrow(/pure renderers/);
  });
});

describe("Sigstore bundle validation", () => {
  it("accepts a v0.3 bundle whose DSSE statement references the manifest digest", () => {
    const digest = "abc123";
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: "manifest.json", digest: { sha256: digest } }],
    };
    const payload = btoa(JSON.stringify(statement));
    const bundle = {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      dsseEnvelope: { payload, payloadType: "application/vnd.in-toto+json" },
    };
    expect(isSigstoreBundleShape(bundle)).toBe(true);
    expect(bundleStatementReferencesDigest(bundle, digest)).toBe(true);
  });

  it("rejects bundles with unrelated mediaType", () => {
    expect(
      isSigstoreBundleShape({
        mediaType: "application/json",
        dsseEnvelope: { payload: btoa("{}") },
      }),
    ).toBe(false);
  });
});

describe("resolveRegistryUrl", () => {
  it("joins path-relative revocations against a local index URL", () => {
    expect(resolveRegistryUrl("revocations.json", "/registry/index.json")).toBe(
      "/registry/revocations.json",
    );
  });

  it("resolves against absolute registry hosts", () => {
    expect(
      resolveRegistryUrl(
        "travel/seat-map/manifest.json",
        PRODUCTION_REGISTRY_INDEX_URL,
      ),
    ).toBe(`${PRODUCTION_REGISTRY_ORIGIN}/registry/travel/seat-map/manifest.json`);
  });
});

describe("registry revocations", () => {
  it("matches exact version and wildcard revocations", () => {
    const revocations = {
      revocationsVersion: 1 as const,
      revoked: [
        { id: "demo/a", version: "1.0.0" },
        { id: "demo/b", version: "*" },
      ],
    };
    expect(isRevoked(revocations, "demo/a", "1.0.0")).toBe(true);
    expect(isRevoked(revocations, "demo/a", "2.0.0")).toBe(false);
    expect(isRevoked(revocations, "demo/b", "9.9.9")).toBe(true);
    expect(isRevoked(revocations, "demo/c", "1.0.0")).toBe(false);
  });

  it("upserts revocation entries for operator edits", () => {
    const first = createRevocationEntry({
      id: "games/demo",
      version: "1.0.0",
      reason: "malware",
      revokedAt: "2026-07-08T00:00:00.000Z",
    });
    const doc = upsertRevocation(null, first);
    expect(doc.revoked).toHaveLength(1);
    const updated = upsertRevocation(doc, {
      ...first,
      reason: "confirmed malware",
    });
    expect(updated.revoked).toHaveLength(1);
    expect(updated.revoked[0]?.reason).toBe("confirmed malware");
  });
});

describe("validateHttpsUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateHttpsUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("rejects http, localhost, and private hosts", () => {
    expect(validateHttpsUrl("http://example.com/x")).toBeNull();
    expect(validateHttpsUrl("https://localhost/x")).toBeNull();
    expect(validateHttpsUrl("https://192.168.0.1/x")).toBeNull();
  });
});

describe("isCrossOriginModuleBundle", () => {
  it("detects cross-host registry bundles", () => {
    expect(
      isCrossOriginModuleBundle(
        `${PRODUCTION_REGISTRY_ORIGIN}/modules/travel-seat-map/index.html`,
        PRODUCTION_SHELL_ORIGIN,
      ),
    ).toBe(true);
    expect(
      isCrossOriginModuleBundle("/modules/foo/index.html", PRODUCTION_SHELL_ORIGIN),
    ).toBe(false);
  });
});
