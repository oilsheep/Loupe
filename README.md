# Loupe — QA Recording Platform

Phase 1: Electron desktop client (`apps/desktop`). See `qa-platform-mvp-spec.md` for the full product spec and `docs/superpowers/plans/` for implementation plans.

## Quick start

```bash
pnpm install
pnpm desktop:dev
```

## Pre-flight

Before running the desktop client, install:
- **Android Platform Tools** (`adb`) — https://developer.android.com/tools/releases/platform-tools
- **scrcpy 2.x** — https://github.com/Genymobile/scrcpy/releases

Add both to your system `PATH`. Verify with `adb --version` and `scrcpy --version`.
