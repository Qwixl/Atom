import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findRegistryIndexDuplicateErrors,
  hasLfLineEndings,
  lfLineEndingError,
  normalizeRegistryText,
  normalizeRegistryTextFile,
} from "./verify.js";

describe("registry text normalization", () => {
  it("normalizes CRLF and lone CR to LF", () => {
    const crlf = Buffer.from("a\r\nb\rc\n", "utf8");
    expect(Buffer.from(normalizeRegistryText(crlf)).toString("utf8")).toBe("a\nb\nc\n");
  });

  it("detects non-LF line endings on disk", () => {
    const crlf = Buffer.from("<html>\r\n</html>\r\n", "utf8");
    expect(hasLfLineEndings(crlf, "bundle.html")).toBe(false);
    expect(lfLineEndingError("demo/mod", "bundle.html", crlf)).toMatch(/LF line endings/);
  });

  it("rewrites text files to LF on publish normalize", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-registry-test-"));
    const filePath = path.join(dir, "bundle.html");
    await writeFile(filePath, "<html>\r\n</html>\r\n", "utf8");
    const normalized = await normalizeRegistryTextFile(filePath);
    expect(Buffer.from(normalized).toString("utf8")).toBe("<html>\n</html>\n");
    const onDisk = await readFile(filePath);
    expect(onDisk.equals(normalized)).toBe(true);
  });
});

describe("registry index duplicates", () => {
  it("flags duplicate id@version rows", () => {
    const errors = findRegistryIndexDuplicateErrors([
      {
        id: "demo/mod",
        version: "0.1.0",
        manifestUrl: "demo/mod/manifest.json",
        integrity: "sha256:abc",
        bundleIntegrity: "sha256:def",
        publisher: "did:key:demo",
      },
      {
        id: "demo/mod",
        version: "0.1.0",
        manifestUrl: "demo/mod/manifest.json",
        integrity: "sha256:abc",
        bundleIntegrity: "sha256:def",
        publisher: "did:key:demo",
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duplicate index entry demo\/mod@0\.1\.0/);
  });

  it("passes when each id@version appears once", () => {
    const errors = findRegistryIndexDuplicateErrors([
      {
        id: "demo/a",
        version: "0.1.0",
        manifestUrl: "demo/a/manifest.json",
        integrity: "sha256:abc",
        bundleIntegrity: "sha256:def",
        publisher: "did:key:demo",
      },
      {
        id: "demo/b",
        version: "0.1.0",
        manifestUrl: "demo/b/manifest.json",
        integrity: "sha256:abc",
        bundleIntegrity: "sha256:def",
        publisher: "did:key:demo",
      },
    ]);
    expect(errors).toEqual([]);
  });
});
