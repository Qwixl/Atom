/** Keep Android/iOS system chrome in sync with the black app header. */
export async function syncNativeChrome() {
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

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#000000" });
    // Light icons/text on the black status bar.
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Browser / plugin not available — theme-color meta is enough for many WebViews.
  }
}
