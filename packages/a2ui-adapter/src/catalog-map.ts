/**
 * Maps A2UI basic catalog component names to Atom catalog references.
 * Custom/module components pass through when name contains `/`.
 * Precedent: A2UI catalog.json → client-native widgets; Atom maps to core/* vocabulary.
 */
export const A2UI_BASIC_CATALOG_MAP: Record<string, string> = {
  Text: "core/text",
  Card: "core/card",
  Row: "core/stack",
  Column: "core/stack",
  Button: "core/action",
  TextField: "core/text-field",
  Image: "core/image",
  List: "core/list",
  Divider: "core/text",
  Icon: "core/text",
  Checkbox: "core/choice",
};

export function mapA2uiComponentName(a2uiName: string): string {
  if (a2uiName.includes("/")) return a2uiName;
  return A2UI_BASIC_CATALOG_MAP[a2uiName] ?? `a2ui/${a2uiName}`;
}
