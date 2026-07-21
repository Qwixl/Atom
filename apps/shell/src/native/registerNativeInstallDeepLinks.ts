import { acceptInstallHandoffUrl } from "../install/installHandoff.js";

/**
 * Capacitor remote WebView loads https://atom.qwixl.com/app/ — custom-scheme
 * intents do not change location.href. Bridge atom:// via @capacitor/app.
 */
export async function registerNativeInstallDeepLinks(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import("@capacitor/app");

    const handle = (url: string | undefined) => {
      if (!url?.trim()) return;
      acceptInstallHandoffUrl(url);
    };

    const launch = await App.getLaunchUrl();
    handle(launch?.url);

    await App.addListener("appUrlOpen", (event) => {
      handle(event.url);
    });
  } catch {
    /* browser / plugin missing */
  }
}
