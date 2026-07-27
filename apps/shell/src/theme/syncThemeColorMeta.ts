/** Keep the browser theme-color in sync with the black app header. */
export function syncThemeColorMeta() {
  if (typeof document === "undefined") return;

  const meta =
    document.querySelector('meta[name="theme-color"]:not([media])') ??
    (() => {
      const el = document.createElement("meta");
      el.setAttribute("name", "theme-color");
      document.head.prepend(el);
      return el;
    })();
  meta.setAttribute("content", "#000000");

  for (const el of document.querySelectorAll('meta[name="theme-color"][media]')) {
    el.setAttribute("content", "#000000");
  }
}
