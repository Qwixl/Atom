import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
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
