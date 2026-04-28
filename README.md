# Loupe — QA Recording Platform

Phase 1: Electron desktop client (`apps/desktop`). See `qa-platform-mvp-spec.md` for the full product spec and `docs/superpowers/plans/` for implementation plans.

## Quick start

```bash
pnpm install
pnpm rebuild:electron        # build better-sqlite3 native binding for Electron's Node ABI
pnpm desktop:dev
```

## Pre-flight

Before running the desktop client, install:
- **Android Platform Tools** (`adb`) — https://developer.android.com/tools/releases/platform-tools
- **scrcpy 2.x** — https://github.com/Genymobile/scrcpy/releases

Add both to your system `PATH`. Verify with `adb --version` and `scrcpy --version`.

For Wi-Fi auto-discovery, enable **Wireless debugging** on the phone (Settings → System → Developer options → Wireless debugging). The app's "Scan Wi-Fi devices" button uses `adb mdns services` to find devices broadcasting that mode.

## Native rebuild dance

`better-sqlite3` is a native dep with different ABIs for system Node vs Electron's bundled Node. Switch as needed:

```bash
pnpm rebuild:electron        # before `pnpm desktop:dev` or `pnpm desktop:build`
pnpm rebuild:node            # before `pnpm desktop:test`
```

If you switch between dev and tests in one session, you'll need to flip back. If you see `NODE_MODULE_VERSION` mismatch errors, you're running the wrong binary for the current context.
