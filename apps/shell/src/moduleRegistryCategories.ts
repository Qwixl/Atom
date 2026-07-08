import type { RegistryModuleEntry } from "@qwixl/shell-core";

/** Category from module id namespace (`scheduling/meeting-picker` → `scheduling`). */
export function moduleRegistryCategory(moduleId: string): string {
  const slash = moduleId.indexOf("/");
  if (slash <= 0) return moduleId;
  return moduleId.slice(0, slash);
}

export function formatRegistryCategoryLabel(category: string): string {
  if (!category) return category;
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");
}

export function uniqueRegistryCategories(modules: RegistryModuleEntry[]): string[] {
  const categories = new Set(modules.map((entry) => moduleRegistryCategory(entry.id)));
  return [...categories].sort((a, b) => a.localeCompare(b));
}

export function filterRegistryModulesByCategory(
  modules: RegistryModuleEntry[],
  category: string | "all",
): RegistryModuleEntry[] {
  if (category === "all") return modules;
  return modules.filter((entry) => moduleRegistryCategory(entry.id) === category);
}
