import { describe, expect, it } from "vitest";
import {
  filterRegistryModulesByCategory,
  formatRegistryCategoryLabel,
  moduleRegistryCategory,
  uniqueRegistryCategories,
} from "./moduleRegistryCategories.js";

describe("moduleRegistryCategories", () => {
  it("derives category from module id namespace", () => {
    expect(moduleRegistryCategory("scheduling/meeting-picker")).toBe("scheduling");
    expect(moduleRegistryCategory("games/tictactoe")).toBe("games");
    expect(moduleRegistryCategory("widget")).toBe("widget");
  });

  it("formats category labels for display", () => {
    expect(formatRegistryCategoryLabel("coordination")).toBe("Coordination");
  });

  it("filters modules by category", () => {
    const modules = [
      { id: "games/tictactoe", version: "1.0.0", manifestUrl: "a" },
      { id: "scheduling/meeting-picker", version: "1.0.0", manifestUrl: "b" },
    ];
    expect(uniqueRegistryCategories(modules)).toEqual(["games", "scheduling"]);
    expect(filterRegistryModulesByCategory(modules, "games")).toHaveLength(1);
    expect(filterRegistryModulesByCategory(modules, "all")).toHaveLength(2);
  });
});
