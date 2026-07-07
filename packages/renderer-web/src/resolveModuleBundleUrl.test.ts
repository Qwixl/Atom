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

  it("resolves module paths against production base /app/", () => {
    expect(
      resolveModuleBundleUrlWithBase(
        "/modules/games-tictactoe/index.html",
        "https://atom.qwixl.com",
        "/app/",
      ),
    ).toBe("https://atom.qwixl.com/app/modules/games-tictactoe/index.html");
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
