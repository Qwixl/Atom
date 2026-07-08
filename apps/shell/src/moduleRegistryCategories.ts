import type { RegistryModuleEntry } from "@qwixl/shell-core";

/** Category from module id namespace (`scheduling/meeting-picker` → `scheduling`). */
export function moduleRegistryCategory(moduleId: string): string {
  const slash = moduleId.indexOf("/");
  if (slash <= 0) return moduleId;
  return moduleId.slice(0, slash);
}

/** Index `categories` plus id namespace — used for filter chips and row labels. */
export function moduleRegistryTags(entry: RegistryModuleEntry): string[] {
  const tags = new Set<string>();
  const ns = moduleRegistryCategory(entry.id);
  if (ns) tags.add(ns);
  for (const tag of entry.categories ?? []) {
    const trimmed = tag.trim();
    if (trimmed) tags.add(trimmed);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function formatRegistryCategoryLabel(category: string): string {
  if (!category) return category;
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");
}

export function uniqueRegistryCategories(modules: RegistryModuleEntry[]): string[] {
  const categories = new Set<string>();
  for (const entry of modules) {
    for (const tag of moduleRegistryTags(entry)) categories.add(tag);
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

export function filterRegistryModulesByCategory(
  modules: RegistryModuleEntry[],
  category: string | "all",
): RegistryModuleEntry[] {
  if (category === "all") return modules;
  return modules.filter((entry) => moduleRegistryTags(entry).includes(category));
}
