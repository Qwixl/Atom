# Atom native shell (`@qwixl/native`)

Thin **Capacitor** WebView that remote-loads the hosted shell (`https://atom.qwixl.com/app/`). UI is not bundled into the store binary — web deploys reach phones without a Play Store update. Decision: **D076**.

## Prerequisites

- JDK 17+
- [Android Studio](https://developer.android.com/studio) with Android SDK + an emulator or USB device
- From repo root: `pnpm install`

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

## Layout

| Path | Role |
|---|---|
| `capacitor.config.ts` | App id, remote `server.url`, navigation allowlist |
| `www/` | Fallback stub if remote URL fails |
| `android/` | Generated Android Studio project |

iOS (`BK-40`) is not added yet — run `pnpm add:ios` on macOS after Android learnings.

## Non-goals (v1)

- Bundled web assets as the primary load path
- Native Chat / Settings UI (Swift/Kotlin widgets)
- Push, deep links, safe-area plugins (later)
