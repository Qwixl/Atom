import { describe, expect, it } from "vitest";
import { resolveModuleBundleUrlWithBase } from "./resolveModuleBundleUrl.js";

describe("resolveModuleBundleUrlWithBase", () => {
  it("resolves module paths against dev base /", () => {
    expect(
      resolveModuleBundleUrlWithBase(
        "/modules/games-tictactoe/index.html",
        "http://localhost:5200",
        "/",
      ),
    ).toBe("http://localhost:5200/modules/games-tictactoe/index.html");
  });

  it("keeps /modules paths at origin root even when shell base is /app/", () => {
    expect(
      resolveModuleBundleUrlWithBase(
        "/modules/games-tictactoe/index.html",
        "https://atom.qwixl.com",
        "/app/",
      ),
    ).toBe("https://atom.qwixl.com/modules/games-tictactoe/index.html");
  });

  it("still prefixes non-module relative paths with the shell base", () => {
    expect(
      resolveModuleBundleUrlWithBase(
        "/assets/foo.js",
        "https://atom.qwixl.com",
        "/app/",
      ),
    ).toBe("https://atom.qwixl.com/app/assets/foo.js");
  });

  it("passes through absolute URLs", () => {
    expect(
      resolveModuleBundleUrlWithBase(
        "https://cdn.example.com/mod/index.html",
        "http://localhost:5200",
        "/",
      ),
    ).toBe("https://cdn.example.com/mod/index.html");
  });
});
