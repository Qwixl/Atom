import { describe, expect, it } from "vitest";
import {
  filterRegistryModulesByCategory,
  formatRegistryCategoryLabel,
  moduleRegistryCategory,
  moduleRegistryTags,
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

  it("unions index categories with namespace for filters", () => {
    const modules = [
      {
        id: "games/tictactoe",
        version: "1.0.0",
        manifestUrl: "a",
        categories: ["games"],
      },
      {
        id: "scheduling/meeting-picker",
        version: "1.0.0",
        manifestUrl: "b",
        categories: ["scheduling", "coordination"],
      },
    ];
    expect(moduleRegistryTags(modules[1]!)).toEqual(["coordination", "scheduling"]);
    expect(uniqueRegistryCategories(modules)).toEqual(["coordination", "games", "scheduling"]);
    expect(filterRegistryModulesByCategory(modules, "coordination")).toEqual([modules[1]]);
    expect(filterRegistryModulesByCategory(modules, "games")).toHaveLength(1);
    expect(filterRegistryModulesByCategory(modules, "all")).toHaveLength(2);
  });
});
