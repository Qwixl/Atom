# Atom native shell (`@qwixl/native`)

Thin **Capacitor** WebView that remote-loads the hosted shell (`https://atom.qwixl.com/app/`). UI is not bundled into the store binary — web deploys reach phones without a Play Store update. Decision: **D076**.

## Prerequisites

- JDK 17+
- [Android Studio](https://developer.android.com/studio) with Android SDK + an emulator or USB device
- From repo root: `pnpm install`
- For push (FCM): a Firebase Android app + `google-services.json` (see below)

## Commands (repo root)

```bash
pnpm native:sync      # cap sync
pnpm native:android   # open Android Studio on apps/native/android
```

Or from this package:

```bash
pnpm sync
pnpm open:android
```

## Local shell against the emulator

Point the WebView at Vite on the host (Android emulator loopback is `10.0.2.2`):

```bash
# terminal 1 — shell
pnpm dev:shell-only

# terminal 2 — sync with override, then open Android Studio
$env:ATOM_NATIVE_SERVER_URL="http://10.0.2.2:5200/"
pnpm native:sync
pnpm native:android
```

Physical device: use your LAN IP instead of `10.0.2.2`, and ensure cleartext is allowed (config sets `cleartext` when the URL is `http://`).

## Push notifications (FCM)

1. Create a Firebase project → add Android app with package `com.qwixl.atom`.
2. Download `google-services.json` into `apps/native/android/app/` (gitignored — never commit).
3. Run `pnpm native:sync` so `@capacitor/push-notifications` is linked into the Android project.
4. On the agent / fleet host, set a Firebase **service account** for FCM HTTP v1
   (`ATOM_FCM_SERVICE_ACCOUNT_PATH`, `_JSON`, or `_B64`) so `sendPush` can deliver.
   The legacy `ATOM_FCM_SERVER_KEY` is no longer supported by Google.
5. In the shell: Settings → Standing intents / Push — opt in after vault unlock.

Notification taps open `/app/` (or the `url` field in the FCM data payload).

## Layout

| Path | Role |
|---|---|
| `capacitor.config.ts` | App id, remote `server.url`, navigation allowlist |
| `www/` | Fallback stub if remote URL fails |
| `android/` | Generated Android Studio project |

iOS (`BK-40`) is not added yet — run `pnpm add:ios` on macOS after Android learnings.

## Passkeys / vault unlock (Android)

Capacitor’s WebView does not expose WebAuthn until:

1. `MainActivity` enables `WebSettingsCompat.setWebAuthenticationSupport(...FOR_APP)`
2. `https://atom.qwixl.com/.well-known/assetlinks.json` lists package `com.qwixl.atom` + signing cert SHA-256
3. Hosted agents accept optional `ATOM_WEBAUTHN_EXTRA_ORIGINS` (e.g. `android:apk-key-hash:…`) if the assertion origin is app-bound

Debug APK fingerprint (current Optimus debug keystore):
`F3:9E:E5:59:6E:0B:7A:F9:65:46:78:1F:EF:BF:51:52:D1:FF:F7:A3:E4:EF:06:36:8D:E6:3E:C5:03:2E:05:76`

## Non-goals (v1)

- Bundled web assets as the primary load path
- Native Chat / Settings UI (Swift/Kotlin widgets)
- Store release signing / Play Console upload (operator step)
