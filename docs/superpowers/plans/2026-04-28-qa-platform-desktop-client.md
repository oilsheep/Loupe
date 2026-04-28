# QA Platform Desktop Client (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows Electron desktop client that mirrors an Android device via scrcpy, lets a QA tester record + mark bugs with a global F8 hotkey, and review/export bug clips locally — all without any cloud backend.

**Architecture:** Electron monorepo (`apps/desktop`) split into a Node main process (handles `adb`/`scrcpy`/`ffmpeg` subprocesses, SQLite, filesystem under `%APPDATA%/qa-tool/`) and a React renderer (UI). All subprocess interaction goes through an `IProcessRunner` abstraction so unit tests can mock it. Bug-time screenshot uses `adb exec-out screencap`; bug-time logcat uses a rolling 30-second in-memory buffer fed by a long-running `adb logcat` process. Bug clip export uses `ffmpeg -c copy` (no re-encode) for instant cuts.

**Tech Stack:** Node 20+, pnpm 9 workspace, TypeScript 5, Electron 32, electron-vite, React 18, Tailwind CSS 4, shadcn/ui, Zustand (UI state), better-sqlite3, `@ffmpeg-installer/ffmpeg` (bundled), Vitest + Testing Library, Playwright (smoke only). External tools (user installs once): `adb` (Android Platform Tools) and `scrcpy`.

**Phase boundary:** This plan does NOT build cloud upload, Google OAuth, or the Web viewer. Spec §3.2 + §3.3 are deferred. The `commit` button does not exist in this phase — Draft is the terminal state.

---

## File Structure

```
E:\projects\Loupe\
├── qa-platform-mvp-spec.md
├── package.json                            # root pnpm workspace
├── pnpm-workspace.yaml
├── .gitignore
├── README.md
├── docs/superpowers/plans/2026-04-28-qa-platform-desktop-client.md
└── apps/
    └── desktop/
        ├── package.json
        ├── electron.vite.config.ts         # electron-vite config (main + preload + renderer)
        ├── tsconfig.json                   # base, references node + web
        ├── tsconfig.node.json              # main + preload (Node target)
        ├── tsconfig.web.json               # renderer (DOM target)
        ├── tailwind.config.ts
        ├── postcss.config.js
        ├── components.json                 # shadcn/ui config
        ├── electron-builder.yml
        ├── index.html
        ├── vitest.config.ts
        ├── shared/
        │   └── types.ts                    # shared between main + renderer (IPC contract)
        ├── electron/
        │   ├── main.ts                     # app entry, BrowserWindow, registers IPC + global F8
        │   ├── preload.ts                  # exposes window.api via contextBridge
        │   ├── ipc.ts                      # IPC handler registry (typed)
        │   ├── process-runner.ts           # IProcessRunner + RealProcessRunner
        │   ├── doctor.ts                   # checks adb/scrcpy on PATH
        │   ├── adb.ts                      # adb wrapper
        │   ├── scrcpy.ts                   # scrcpy wrapper (record + lifecycle)
        │   ├── ffmpeg.ts                   # ffmpeg clip extraction
        │   ├── logcat.ts                   # rolling 30s logcat buffer
        │   ├── screenshot.ts               # adb exec-out screencap → PNG
        │   ├── session.ts                  # session lifecycle orchestrator
        │   ├── db.ts                       # SQLite schema + repository
        │   ├── paths.ts                    # AppData layout helpers
        │   └── __tests__/
        │       ├── process-runner.test.ts
        │       ├── doctor.test.ts
        │       ├── adb.test.ts
        │       ├── scrcpy.test.ts
        │       ├── ffmpeg.test.ts
        │       ├── logcat.test.ts
        │       ├── screenshot.test.ts
        │       ├── session.test.ts
        │       ├── db.test.ts
        │       └── paths.test.ts
        └── src/                            # React renderer
            ├── main.tsx                    # React entry
            ├── App.tsx                     # router shell
            ├── routes/
            │   ├── Home.tsx                # device picker + new session form
            │   ├── Recording.tsx           # in-progress session view
            │   └── Draft.tsx               # post-session review + clip export
            ├── components/
            │   ├── DevicePicker.tsx
            │   ├── NewSessionForm.tsx
            │   ├── BugMarkDialog.tsx       # opened by global F8
            │   ├── BugList.tsx
            │   ├── VideoPlayer.tsx         # HTML5 <video> + bug markers overlay
            │   └── ui/                     # shadcn primitives (button, input, dialog, …)
            ├── lib/
            │   ├── api.ts                  # typed wrapper around window.api
            │   └── store.ts                # Zustand store
            ├── styles.css                  # Tailwind entrypoint
            └── __tests__/
                ├── DevicePicker.test.tsx
                ├── BugMarkDialog.test.tsx
                ├── BugList.test.tsx
                └── VideoPlayer.test.tsx
```

**Per-file responsibility (one-liners):**
- `electron/process-runner.ts` — single seam for spawning subprocesses; everything else uses `IProcessRunner`.
- `electron/adb.ts` — pure command builders + parsers + thin async wrappers; no global state.
- `electron/scrcpy.ts` — owns the long-running scrcpy process for ONE active session.
- `electron/logcat.ts` — owns the long-running `adb logcat` process; maintains rolling 30s buffer in memory.
- `electron/session.ts` — orchestrates start/markBug/stop; depends on adb, scrcpy, logcat, screenshot, db, paths.
- `electron/db.ts` — SQLite repository (no business logic, just CRUD).
- `electron/ipc.ts` — typed glue from renderer requests to main-process modules.
- `shared/types.ts` — single source of truth for shapes that cross the IPC boundary.
- `src/lib/api.ts` — typed wrapper so React components never touch `window.api` directly.

---

## Pre-flight (one-time setup on the user's PC)

These are checked by `doctor` (Task 3) and surfaced in the UI. Document them in `apps/desktop/README.md` (Task 1) so the engineer knows what to install.

1. **Install Android Platform Tools** (provides `adb`):
   - Download: https://developer.android.com/tools/releases/platform-tools
   - Unzip, add the folder to system `PATH`.
   - Verify: `adb --version` returns a version string.

2. **Install scrcpy 2.x**:
   - Download Windows release: https://github.com/Genymobile/scrcpy/releases (latest 2.x)
   - Unzip, add the folder to system `PATH`.
   - Verify: `scrcpy --version` returns a version string.

3. **Enable USB debugging on the Android device** (Settings → About phone → tap Build number 7×; then Developer options → USB debugging → on). Plug in via USB; `adb devices` should list it as `device` (accept the RSA prompt on the phone).

4. **Optional Wi-Fi mode**: with USB connected, run `adb tcpip 5555`, note phone IP from Settings → About → Status, then unplug and `adb connect <ip>:5555`. The client supports manual IP entry; no pairing wizard in Phase 1.

`ffmpeg` is bundled via npm — no manual install.

---

## Task 1: Bootstrap monorepo + Electron + React + Tailwind hello-world

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `.gitignore`, `README.md`
- Create: `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.node.json`, `apps/desktop/tsconfig.web.json`, `apps/desktop/tailwind.config.ts`, `apps/desktop/postcss.config.js`, `apps/desktop/index.html`, `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/electron/main.ts`, `apps/desktop/electron/preload.ts`
- Create: `apps/desktop/src/main.tsx`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`

- [ ] **Step 1.1: Initialize git + workspace**

```bash
cd E:/projects/Loupe
git init
git add qa-platform-mvp-spec.md docs/
git commit -m "chore: initial spec and plan"
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
```

Create root `package.json`:
```json
{
  "name": "loupe",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "desktop:dev": "pnpm --filter desktop dev",
    "desktop:build": "pnpm --filter desktop build",
    "desktop:test": "pnpm --filter desktop test"
  }
}
```

Create `.gitignore`:
```
node_modules/
dist/
out/
*.log
.DS_Store
.env
.env.local
%APPDATA%/
*.tsbuildinfo
coverage/
```

Create `README.md`:
```markdown
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
```

- [ ] **Step 1.2: Scaffold the desktop app**

```bash
mkdir -p apps/desktop/electron apps/desktop/src apps/desktop/shared
cd apps/desktop
```

Create `apps/desktop/package.json`:
```json
{
  "name": "desktop",
  "version": "0.0.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "electron": "^32.1.2",
    "electron-builder": "^25.0.5",
    "electron-vite": "^2.3.0",
    "happy-dom": "^15.7.4",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
```

> Note: Tailwind 3.4 is used (not 4.x) for stable shadcn/ui compatibility.

- [ ] **Step 1.3: TypeScript configs**

Create `apps/desktop/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `apps/desktop/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "out",
    "noEmit": true
  },
  "include": ["electron/**/*", "shared/**/*", "electron.vite.config.ts", "vitest.config.ts"]
}
```

Create `apps/desktop/tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*", "shared/**/*"]
}
```

- [ ] **Step 1.4: electron-vite config**

Create `apps/desktop/electron.vite.config.ts`:
```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main' },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload' },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: { outDir: 'out/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
    resolve: { alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') } },
  },
})
```

- [ ] **Step 1.5: Tailwind + PostCSS**

Create `apps/desktop/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

Create `apps/desktop/postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 1.6: Renderer entry + hello world**

Create `apps/desktop/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Loupe — QA Recorder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/desktop/src/styles.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `apps/desktop/src/main.tsx`:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

Create `apps/desktop/src/App.tsx`:
```typescript
export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Loupe — QA Recorder</h1>
    </div>
  )
}
```

- [ ] **Step 1.7: Electron main + preload**

Create `apps/desktop/electron/main.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

Create `apps/desktop/electron/preload.ts`:
```typescript
import { contextBridge } from 'electron'

// Phase-1 placeholder; populated in Task 11.
contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 1.8: Vitest config**

Create `apps/desktop/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['electron/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 1.9: Install + run**

```bash
cd E:/projects/Loupe
pnpm install
pnpm desktop:dev
```

Expected: an Electron window opens showing "Loupe — QA Recorder" on a dark background. Close the window.

- [ ] **Step 1.10: Commit**

```bash
git add .
git commit -m "feat(desktop): bootstrap electron + react + tailwind hello world"
```

---

## Task 2: ProcessRunner abstraction

**Files:**
- Create: `apps/desktop/electron/process-runner.ts`
- Create: `apps/desktop/electron/__tests__/process-runner.test.ts`

- [ ] **Step 2.1: Write failing test**

Create `apps/desktop/electron/__tests__/process-runner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { RealProcessRunner } from '../process-runner'

describe('RealProcessRunner.run', () => {
  const runner = new RealProcessRunner()

  it('captures stdout and exit code 0', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.stdout.write("hello")'])
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('hello')
  })

  it('captures stderr', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.stderr.write("oops")'])
    expect(r.stderr).toBe('oops')
  })

  it('captures non-zero exit code', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.exit(7)'])
    expect(r.code).toBe(7)
  })

  it('rejects when binary missing', async () => {
    await expect(runner.run('this-binary-does-not-exist-xyz', [])).rejects.toThrow()
  })
})

describe('RealProcessRunner.spawn', () => {
  const runner = new RealProcessRunner()

  it('returns a SpawnedProcess that emits exit', async () => {
    const proc = runner.spawn(process.execPath, ['-e', 'process.exit(0)'])
    const code = await new Promise<number | null>((r) => proc.onExit(r))
    expect(code).toBe(0)
  })

  it('kill() terminates the process', async () => {
    const proc = runner.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    proc.kill('SIGTERM')
    const code = await new Promise<number | null>((r) => proc.onExit(r))
    expect(code).not.toBe(0)
  })
})
```

- [ ] **Step 2.2: Run test, verify fail**

```bash
pnpm --filter desktop test
```
Expected: FAIL — `Cannot find module '../process-runner'`.

- [ ] **Step 2.3: Implement `process-runner.ts`**

Create `apps/desktop/electron/process-runner.ts`:
```typescript
import { spawn, type SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export interface SpawnedProcess {
  readonly pid: number | undefined
  readonly stdout: Readable
  readonly stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
  onExit(handler: (code: number | null) => void): void
}

export interface IProcessRunner {
  run(cmd: string, args: string[], opts?: SpawnOptions): Promise<RunResult>
  spawn(cmd: string, args: string[], opts?: SpawnOptions): SpawnedProcess
}

export class RealProcessRunner implements IProcessRunner {
  run(cmd: string, args: string[], opts: SpawnOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (d) => { stdout += d.toString() })
      child.stderr?.on('data', (d) => { stderr += d.toString() })
      child.once('error', reject)
      child.once('exit', (code) => resolve({ stdout, stderr, code: code ?? -1 }))
    })
  }

  spawn(cmd: string, args: string[], opts: SpawnOptions = {}): SpawnedProcess {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    return {
      get pid() { return child.pid },
      stdout: child.stdout!,
      stderr: child.stderr!,
      kill: (sig?) => child.kill(sig),
      onExit: (h) => { child.once('exit', h) },
    }
  }
}
```

- [ ] **Step 2.4: Run test, verify pass**

```bash
pnpm --filter desktop test process-runner
```
Expected: PASS (6 tests).

- [ ] **Step 2.5: Commit**

```bash
git add apps/desktop/electron/process-runner.ts apps/desktop/electron/__tests__/process-runner.test.ts
git commit -m "feat(desktop): add IProcessRunner abstraction with real impl"
```

---

## Task 3: Doctor (external dependency check)

**Files:**
- Create: `apps/desktop/electron/doctor.ts`
- Create: `apps/desktop/electron/__tests__/doctor.test.ts`

- [ ] **Step 3.1: Write failing test**

Create `apps/desktop/electron/__tests__/doctor.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { doctor } from '../doctor'
import type { IProcessRunner } from '../process-runner'

function fakeRunner(behaviour: Record<string, { code: number; stdout?: string; stderr?: string } | Error>): IProcessRunner {
  return {
    async run(cmd) {
      const r = behaviour[cmd]
      if (r instanceof Error) throw r
      if (!r) throw new Error(`unexpected cmd: ${cmd}`)
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.code }
    },
    spawn: vi.fn() as any,
  }
}

describe('doctor', () => {
  it('reports ok when all tools present', async () => {
    const r = fakeRunner({
      adb: { code: 0, stdout: 'Android Debug Bridge version 1.0.41' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks).toHaveLength(2)
    expect(checks.every(c => c.ok)).toBe(true)
    expect(checks[0].version).toContain('1.0.41')
    expect(checks[1].version).toContain('2.7')
  })

  it('reports not ok when binary missing', async () => {
    const r = fakeRunner({
      adb: new Error("ENOENT: spawn adb"),
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('ENOENT')
    expect(checks[1].ok).toBe(true)
  })

  it('reports not ok when binary returns non-zero', async () => {
    const r = fakeRunner({
      adb: { code: 1, stderr: 'broken' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('broken')
  })
})
```

- [ ] **Step 3.2: Run test, verify fail**

```bash
pnpm --filter desktop test doctor
```
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `doctor.ts`**

Create `apps/desktop/electron/doctor.ts`:
```typescript
import type { IProcessRunner } from './process-runner'

export interface ToolCheck {
  name: 'adb' | 'scrcpy'
  ok: boolean
  version?: string
  error?: string
}

const TOOLS: { name: ToolCheck['name']; cmd: string; args: string[] }[] = [
  { name: 'adb',    cmd: 'adb',    args: ['--version'] },
  { name: 'scrcpy', cmd: 'scrcpy', args: ['--version'] },
]

export async function doctor(runner: IProcessRunner): Promise<ToolCheck[]> {
  const out: ToolCheck[] = []
  for (const t of TOOLS) {
    try {
      const r = await runner.run(t.cmd, t.args)
      if (r.code === 0) {
        const firstLine = ((r.stdout || r.stderr).split('\n')[0] || '').trim()
        out.push({ name: t.name, ok: true, version: firstLine })
      } else {
        out.push({ name: t.name, ok: false, error: (r.stderr || `exit ${r.code}`).trim() })
      }
    } catch (e) {
      out.push({ name: t.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
```

- [ ] **Step 3.4: Run test, verify pass**

```bash
pnpm --filter desktop test doctor
```
Expected: PASS (3 tests).

- [ ] **Step 3.5: Commit**

```bash
git add apps/desktop/electron/doctor.ts apps/desktop/electron/__tests__/doctor.test.ts
git commit -m "feat(desktop): add doctor() for adb/scrcpy presence check"
```

---

## Task 4: adb wrapper

**Files:**
- Create: `apps/desktop/electron/adb.ts`
- Create: `apps/desktop/electron/__tests__/adb.test.ts`
- Create: `apps/desktop/shared/types.ts` (Device shape)

- [ ] **Step 4.1: Define shared Device type**

Create `apps/desktop/shared/types.ts`:
```typescript
export interface Device {
  id: string                              // adb serial OR `ip:port` for wifi
  type: 'usb' | 'wifi'
  state: 'device' | 'offline' | 'unauthorized'
  model?: string
  androidVersion?: string
}
```

- [ ] **Step 4.2: Write failing test**

Create `apps/desktop/electron/__tests__/adb.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { Adb, parseDevicesOutput } from '../adb'
import type { IProcessRunner } from '../process-runner'

describe('parseDevicesOutput', () => {
  it('parses USB device line with model', () => {
    const out = `List of devices attached\nABC123  device usb:1-2 product:foo model:Pixel_7 device:panther transport_id:1\n\n`
    const devs = parseDevicesOutput(out)
    expect(devs).toEqual([
      { id: 'ABC123', type: 'usb', state: 'device' }
    ])
  })

  it('parses ip:port as wifi', () => {
    const out = `List of devices attached\n192.168.1.42:5555 device product:foo model:Galaxy_S22\n`
    const devs = parseDevicesOutput(out)
    expect(devs[0]).toMatchObject({ id: '192.168.1.42:5555', type: 'wifi', state: 'device' })
  })

  it('parses offline / unauthorized states', () => {
    const out = `List of devices attached\nABC offline\nDEF unauthorized\n`
    const devs = parseDevicesOutput(out)
    expect(devs.map(d => d.state)).toEqual(['offline', 'unauthorized'])
  })

  it('returns empty for header-only output', () => {
    expect(parseDevicesOutput('List of devices attached\n')).toEqual([])
  })
})

function fake(map: Record<string, string>): IProcessRunner {
  return {
    async run(_cmd, args) {
      const key = args.join(' ')
      const stdout = map[key] ?? ''
      return { stdout, stderr: '', code: 0 }
    },
    spawn: vi.fn() as any,
  }
}

describe('Adb', () => {
  it('listDevices returns parsed list', async () => {
    const adb = new Adb(fake({
      'devices -l': 'List of devices attached\nABC device\n',
    }))
    const ds = await adb.listDevices()
    expect(ds).toHaveLength(1)
    expect(ds[0].id).toBe('ABC')
  })

  it('connect returns ok=true when output contains "connected"', async () => {
    const adb = new Adb({
      async run() { return { stdout: 'connected to 192.168.1.42:5555', stderr: '', code: 0 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.connect('192.168.1.42')
    expect(r.ok).toBe(true)
  })

  it('connect returns ok=false on failure message', async () => {
    const adb = new Adb({
      async run() { return { stdout: '', stderr: 'unable to connect', code: 1 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.connect('1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('unable')
  })

  it('getDeviceInfo combines model + version', async () => {
    const adb = new Adb(fake({
      '-s ABC shell getprop ro.product.model':         'Pixel 7',
      '-s ABC shell getprop ro.build.version.release': '14',
    }))
    const info = await adb.getDeviceInfo('ABC')
    expect(info).toEqual({ model: 'Pixel 7', androidVersion: '14' })
  })
})
```

- [ ] **Step 4.3: Run test, verify fail**

```bash
pnpm --filter desktop test adb
```
Expected: FAIL — module not found.

- [ ] **Step 4.4: Implement `adb.ts`**

Create `apps/desktop/electron/adb.ts`:
```typescript
import type { IProcessRunner, SpawnedProcess } from './process-runner'
import type { Device } from '@shared/types'

const IP_PORT = /^\d{1,3}(\.\d{1,3}){3}:\d+$/

export function parseDevicesOutput(stdout: string): Device[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
  const devs: Device[] = []
  for (const line of lines) {
    if (line.toLowerCase().startsWith('list of devices')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [id, state] = parts
    if (state !== 'device' && state !== 'offline' && state !== 'unauthorized') continue
    devs.push({
      id,
      type: IP_PORT.test(id) ? 'wifi' : 'usb',
      state: state as Device['state'],
    })
  }
  return devs
}

export class Adb {
  constructor(private runner: IProcessRunner) {}

  async listDevices(): Promise<Device[]> {
    const r = await this.runner.run('adb', ['devices', '-l'])
    return parseDevicesOutput(r.stdout)
  }

  async connect(ip: string, port = 5555): Promise<{ ok: boolean; message: string }> {
    const r = await this.runner.run('adb', ['connect', `${ip}:${port}`])
    const out = (r.stdout + r.stderr).trim()
    return { ok: out.toLowerCase().includes('connected') && r.code === 0, message: out }
  }

  async disconnect(idOrIp: string): Promise<void> {
    await this.runner.run('adb', ['disconnect', idOrIp])
  }

  async getProp(deviceId: string, prop: string): Promise<string> {
    const r = await this.runner.run('adb', ['-s', deviceId, 'shell', 'getprop', prop])
    return r.stdout.trim()
  }

  async getDeviceInfo(deviceId: string): Promise<{ model: string; androidVersion: string }> {
    const [model, androidVersion] = await Promise.all([
      this.getProp(deviceId, 'ro.product.model'),
      this.getProp(deviceId, 'ro.build.version.release'),
    ])
    return { model, androidVersion }
  }

  /** Spawns a long-running process for streaming (used by logcat + screenshot binary streams). */
  spawnRaw(args: string[]): SpawnedProcess {
    return this.runner.spawn('adb', args)
  }
}
```

- [ ] **Step 4.5: Run test, verify pass**

```bash
pnpm --filter desktop test adb
```
Expected: PASS (8 tests).

- [ ] **Step 4.6: Commit**

```bash
git add apps/desktop/electron/adb.ts apps/desktop/electron/__tests__/adb.test.ts apps/desktop/shared/types.ts
git commit -m "feat(desktop): add adb wrapper (devices, connect, getprop)"
```

---

## Task 5: scrcpy wrapper

**Files:**
- Create: `apps/desktop/electron/scrcpy.ts`
- Create: `apps/desktop/electron/__tests__/scrcpy.test.ts`

- [ ] **Step 5.1: Write failing test**

Create `apps/desktop/electron/__tests__/scrcpy.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Scrcpy } from '../scrcpy'
import type { IProcessRunner } from '../process-runner'

function makeMock() {
  const exitHandlers: ((c: number | null) => void)[] = []
  const proc = {
    pid: 999,
    stdout: new EventEmitter() as any,
    stderr: new EventEmitter() as any,
    kill: vi.fn().mockReturnValue(true),
    onExit: vi.fn((h: any) => { exitHandlers.push(h) }),
  }
  const runner: IProcessRunner = {
    run: vi.fn() as any,
    spawn: vi.fn().mockReturnValue(proc) as any,
  }
  const triggerExit = (code = 0) => exitHandlers.forEach(h => h(code))
  return { runner, proc, triggerExit }
}

describe('Scrcpy', () => {
  it('start passes -s deviceId and --record path', () => {
    const { runner, proc } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'ABC', recordPath: 'C:/tmp/v.mp4' })
    const args = (runner.spawn as any).mock.calls[0][1] as string[]
    expect(args).toContain('-s'); expect(args).toContain('ABC')
    expect(args).toContain('--record'); expect(args).toContain('C:/tmp/v.mp4')
    expect(s.isRunning()).toBe(true)
    expect(proc.pid).toBe(999)
  })

  it('throws when start called twice', () => {
    const { runner } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    expect(() => s.start({ deviceId: 'B', recordPath: 'b.mp4' })).toThrow()
  })

  it('elapsedMs grows over time', async () => {
    const { runner } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    await new Promise(r => setTimeout(r, 30))
    const e = s.elapsedMs()
    expect(e).not.toBeNull()
    expect(e!).toBeGreaterThanOrEqual(20)
  })

  it('elapsedMs is null before start', () => {
    const { runner } = makeMock()
    expect(new Scrcpy(runner).elapsedMs()).toBeNull()
  })

  it('stop kills with SIGINT and resolves on exit', async () => {
    const { runner, proc, triggerExit } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    const p = s.stop()
    expect(proc.kill).toHaveBeenCalledWith('SIGINT')
    triggerExit(0)
    await p
    expect(s.isRunning()).toBe(false)
  })

  it('stop is no-op when not running', async () => {
    const { runner } = makeMock()
    await new Scrcpy(runner).stop()  // does not throw
  })
})
```

- [ ] **Step 5.2: Run test, verify fail**

```bash
pnpm --filter desktop test scrcpy
```
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `scrcpy.ts`**

Create `apps/desktop/electron/scrcpy.ts`:
```typescript
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface ScrcpyOptions {
  deviceId: string
  recordPath: string
  windowTitle?: string
}

export class Scrcpy {
  private process?: SpawnedProcess
  private startTime?: number

  constructor(private runner: IProcessRunner) {}

  start(opts: ScrcpyOptions): void {
    if (this.process) throw new Error('scrcpy already running')
    const args = [
      '-s', opts.deviceId,
      '--record', opts.recordPath,
      '--window-title', opts.windowTitle ?? 'Loupe Mirror',
      // helpful defaults for QA workflow:
      '--stay-awake',
      '--no-audio',
      '--max-fps=60',
    ]
    this.process = this.runner.spawn('scrcpy', args)
    this.startTime = Date.now()
  }

  /** ms since start(), or null if not running. */
  elapsedMs(): number | null {
    return this.startTime !== undefined ? Date.now() - this.startTime : null
  }

  isRunning(): boolean {
    return !!this.process
  }

  /** Sends SIGINT (clean stop, finalises mp4 moov atom), then resolves on exit. */
  async stop(): Promise<void> {
    if (!this.process) return
    const proc = this.process
    this.process = undefined
    return new Promise<void>((resolve) => {
      proc.onExit(() => resolve())
      try { proc.kill('SIGINT') } catch { /* already dead */ }
      // Safety: hard-kill after 5s in case scrcpy is hung.
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 5000).unref()
    })
  }
}
```

> **Why SIGINT:** scrcpy needs a graceful shutdown to finalise the MP4 moov atom; SIGKILL leaves a corrupted file. SIGINT is what scrcpy itself documents.

- [ ] **Step 5.4: Run test, verify pass**

```bash
pnpm --filter desktop test scrcpy
```
Expected: PASS (6 tests).

- [ ] **Step 5.5: Commit**

```bash
git add apps/desktop/electron/scrcpy.ts apps/desktop/electron/__tests__/scrcpy.test.ts
git commit -m "feat(desktop): add scrcpy wrapper with graceful stop"
```

---

## Task 6: ffmpeg clip wrapper

**Files:**
- Create: `apps/desktop/electron/ffmpeg.ts`
- Create: `apps/desktop/electron/__tests__/ffmpeg.test.ts`

- [ ] **Step 6.1: Write failing test**

Create `apps/desktop/electron/__tests__/ffmpeg.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { extractClip, buildClipArgs } from '../ffmpeg'
import type { IProcessRunner } from '../process-runner'

describe('buildClipArgs', () => {
  it('uses -ss/-to in seconds with -c copy and -y', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 12000 })
    expect(args).toEqual(['-y', '-ss', '5.000', '-to', '12.000', '-i', 'in.mp4', '-c', 'copy', 'out.mp4'])
  })

  it('clamps negative start to 0', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: -200, endMs: 5000 })
    expect(args).toContain('0.000')
  })

  it('throws when end<=start', () => {
    expect(() => buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 5000 })).toThrow()
  })
})

describe('extractClip', () => {
  it('invokes runner with ffmpeg path + computed args, resolves on success', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }) as any,
      spawn: vi.fn() as any,
    }
    await extractClip(runner, '/path/to/ffmpeg', { inputPath: 'a.mp4', outputPath: 'b.mp4', startMs: 1000, endMs: 3000 })
    expect(runner.run).toHaveBeenCalledWith('/path/to/ffmpeg', expect.arrayContaining(['-ss', '1.000', '-to', '3.000']))
  })

  it('throws on non-zero exit', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'bad input', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    await expect(extractClip(runner, '/ff', { inputPath: 'a', outputPath: 'b', startMs: 0, endMs: 1000 }))
      .rejects.toThrow(/bad input/)
  })
})
```

- [ ] **Step 6.2: Run test, verify fail**

```bash
pnpm --filter desktop test ffmpeg
```
Expected: FAIL.

- [ ] **Step 6.3: Implement `ffmpeg.ts`**

Create `apps/desktop/electron/ffmpeg.ts`:
```typescript
import type { IProcessRunner } from './process-runner'

export interface ClipOptions {
  inputPath: string
  outputPath: string
  startMs: number
  endMs: number
}

function ms(n: number): string {
  return (Math.max(0, n) / 1000).toFixed(3)
}

export function buildClipArgs(opts: ClipOptions): string[] {
  if (opts.endMs <= opts.startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  return [
    '-y',
    '-ss', ms(opts.startMs),
    '-to', ms(opts.endMs),
    '-i', opts.inputPath,
    '-c', 'copy',
    opts.outputPath,
  ]
}

export async function extractClip(runner: IProcessRunner, ffmpegPath: string, opts: ClipOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildClipArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg failed (code ${r.code}): ${r.stderr.trim()}`)
}

/** Resolved at runtime so tests don't import the binary. */
export function resolveBundledFfmpegPath(): string {
  // Lazy require so test suite (vitest) doesn't pull binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffmpeg-installer/ffmpeg') as { path: string }
  return installer.path
}
```

- [ ] **Step 6.4: Run test, verify pass**

```bash
pnpm --filter desktop test ffmpeg
```
Expected: PASS (5 tests).

- [ ] **Step 6.5: Commit**

```bash
git add apps/desktop/electron/ffmpeg.ts apps/desktop/electron/__tests__/ffmpeg.test.ts
git commit -m "feat(desktop): add ffmpeg clip extraction (no re-encode)"
```

---

## Task 7: Paths + AppData layout

**Files:**
- Create: `apps/desktop/electron/paths.ts`
- Create: `apps/desktop/electron/__tests__/paths.test.ts`

- [ ] **Step 7.1: Write failing test**

Create `apps/desktop/electron/__tests__/paths.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPaths } from '../paths'

describe('paths', () => {
  it('builds expected per-session structure under root', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-'))
    try {
      const p = createPaths(root)
      expect(p.root()).toBe(root)
      expect(p.dbFile()).toBe(join(root, 'meta.sqlite'))
      expect(p.sessionDir('abc')).toBe(join(root, 'sessions', 'abc'))
      expect(p.videoFile('abc')).toBe(join(root, 'sessions', 'abc', 'video.mp4'))
      expect(p.screenshotFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'screenshots', 'bug1.png'))
      expect(p.logcatFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'logcat', 'bug1.txt'))
      expect(p.clipFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'clips', 'bug1.mp4'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('ensureSessionDirs creates all needed subdirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-'))
    try {
      const p = createPaths(root)
      p.ensureSessionDirs('abc')
      expect(existsSync(join(root, 'sessions', 'abc', 'screenshots'))).toBe(true)
      expect(existsSync(join(root, 'sessions', 'abc', 'logcat'))).toBe(true)
      expect(existsSync(join(root, 'sessions', 'abc', 'clips'))).toBe(true)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
```

- [ ] **Step 7.2: Run test, verify fail**

```bash
pnpm --filter desktop test paths
```
Expected: FAIL.

- [ ] **Step 7.3: Implement `paths.ts`**

Create `apps/desktop/electron/paths.ts`:
```typescript
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface Paths {
  root(): string
  dbFile(): string
  sessionDir(sessionId: string): string
  videoFile(sessionId: string): string
  screenshotsDir(sessionId: string): string
  screenshotFile(sessionId: string, bugId: string): string
  logcatDir(sessionId: string): string
  logcatFile(sessionId: string, bugId: string): string
  clipsDir(sessionId: string): string
  clipFile(sessionId: string, bugId: string): string
  ensureRoot(): void
  ensureSessionDirs(sessionId: string): void
}

export function createPaths(root: string): Paths {
  return {
    root: () => root,
    dbFile: () => join(root, 'meta.sqlite'),
    sessionDir: (id) => join(root, 'sessions', id),
    videoFile: (id) => join(root, 'sessions', id, 'video.mp4'),
    screenshotsDir: (id) => join(root, 'sessions', id, 'screenshots'),
    screenshotFile: (id, bugId) => join(root, 'sessions', id, 'screenshots', `${bugId}.png`),
    logcatDir: (id) => join(root, 'sessions', id, 'logcat'),
    logcatFile: (id, bugId) => join(root, 'sessions', id, 'logcat', `${bugId}.txt`),
    clipsDir: (id) => join(root, 'sessions', id, 'clips'),
    clipFile: (id, bugId) => join(root, 'sessions', id, 'clips', `${bugId}.mp4`),
    ensureRoot() { mkdirSync(root, { recursive: true }) },
    ensureSessionDirs(id) {
      mkdirSync(this.screenshotsDir(id), { recursive: true })
      mkdirSync(this.logcatDir(id),      { recursive: true })
      mkdirSync(this.clipsDir(id),       { recursive: true })
    },
  }
}

/** Default root: %APPDATA%/qa-tool. Resolved via Electron `app.getPath('userData')` in main.ts. */
export function defaultRoot(userDataDir: string): string {
  return join(userDataDir, 'qa-tool')
}
```

- [ ] **Step 7.4: Run test, verify pass**

```bash
pnpm --filter desktop test paths
```
Expected: PASS (2 tests).

- [ ] **Step 7.5: Commit**

```bash
git add apps/desktop/electron/paths.ts apps/desktop/electron/__tests__/paths.test.ts
git commit -m "feat(desktop): add paths helper for AppData layout"
```

---

## Task 8: SQLite repository

**Files:**
- Create: `apps/desktop/electron/db.ts`
- Create: `apps/desktop/electron/__tests__/db.test.ts`
- Modify: `apps/desktop/shared/types.ts` (add Session, Bug)

- [ ] **Step 8.1: Extend shared types**

Edit `apps/desktop/shared/types.ts` — append:
```typescript
export type SessionStatus = 'recording' | 'draft'
export type BugSeverity = 'major' | 'normal'

export interface Session {
  id: string
  buildVersion: string
  testNote: string
  deviceId: string
  deviceModel: string
  androidVersion: string
  connectionMode: 'usb' | 'wifi'
  status: SessionStatus
  durationMs: number | null
  startedAt: number             // epoch ms
  endedAt: number | null
}

export interface Bug {
  id: string
  sessionId: string
  offsetMs: number              // ms since session start (= scrcpy elapsed at mark time)
  severity: BugSeverity
  note: string
  screenshotRel: string | null  // path relative to session dir, e.g. "screenshots/abc.png"
  logcatRel: string | null
  createdAt: number
}
```

- [ ] **Step 8.2: Write failing test**

Create `apps/desktop/electron/__tests__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../db'
import type { Session, Bug } from '@shared/types'

function fixSession(over: Partial<Session> = {}): Omit<Session, never> {
  return {
    id: 'sess-1', buildVersion: '1.0.0', testNote: '', deviceId: 'ABC', deviceModel: 'Pixel 7',
    androidVersion: '14', connectionMode: 'usb', status: 'recording', durationMs: null,
    startedAt: 1700000000000, endedAt: null, ...over,
  }
}
function fixBug(over: Partial<Bug> = {}): Omit<Bug, never> {
  return {
    id: 'bug-1', sessionId: 'sess-1', offsetMs: 5000, severity: 'normal', note: 'cards stuck',
    screenshotRel: null, logcatRel: null, createdAt: 1700000005000, ...over,
  }
}

describe('Db', () => {
  let db: ReturnType<typeof openDb>
  beforeEach(() => { db = openDb(':memory:') })

  it('creates and retrieves a session', () => {
    db.insertSession(fixSession())
    const s = db.getSession('sess-1')
    expect(s?.deviceModel).toBe('Pixel 7')
  })

  it('listSessions returns rows newest-first', () => {
    db.insertSession(fixSession({ id: 's1', startedAt: 100 }))
    db.insertSession(fixSession({ id: 's2', startedAt: 200 }))
    db.insertSession(fixSession({ id: 's3', startedAt: 150 }))
    expect(db.listSessions().map(r => r.id)).toEqual(['s2', 's3', 's1'])
  })

  it('updates session status + duration', () => {
    db.insertSession(fixSession())
    db.finalizeSession('sess-1', { durationMs: 60000, endedAt: 1700000060000 })
    const s = db.getSession('sess-1')!
    expect(s.status).toBe('draft')
    expect(s.durationMs).toBe(60000)
  })

  it('insertBug + listBugs ordered by offsetMs', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'b1', offsetMs: 5000 }))
    db.insertBug(fixBug({ id: 'b2', offsetMs: 1000 }))
    db.insertBug(fixBug({ id: 'b3', offsetMs: 3000 }))
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['b2', 'b3', 'b1'])
  })

  it('updateBug changes note + severity', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.updateBug('bug-1', { note: 'fixed text', severity: 'major' })
    const b = db.listBugs('sess-1')[0]
    expect(b.note).toBe('fixed text'); expect(b.severity).toBe('major')
  })

  it('deleteBug removes one bug', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'b1' })); db.insertBug(fixBug({ id: 'b2' }))
    db.deleteBug('b1')
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['b2'])
  })

  it('deleteSession cascades to bugs', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.deleteSession('sess-1')
    expect(db.getSession('sess-1')).toBeUndefined()
    expect(db.listBugs('sess-1')).toEqual([])
  })
})
```

- [ ] **Step 8.3: Run test, verify fail**

```bash
pnpm --filter desktop test db
```
Expected: FAIL — module not found.

- [ ] **Step 8.4: Implement `db.ts`**

Create `apps/desktop/electron/db.ts`:
```typescript
import Database from 'better-sqlite3'
import type { Session, Bug, BugSeverity, SessionStatus } from '@shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  build_version TEXT NOT NULL,
  test_note TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  device_model TEXT NOT NULL,
  android_version TEXT NOT NULL,
  connection_mode TEXT NOT NULL CHECK(connection_mode IN ('usb','wifi')),
  status TEXT NOT NULL CHECK(status IN ('recording','draft')),
  duration_ms INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  offset_ms INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('major','normal')),
  note TEXT NOT NULL,
  screenshot_rel TEXT,
  logcat_rel TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bugs_session_offset ON bugs(session_id, offset_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_started   ON sessions(started_at DESC);
`

type Row<T> = { [K in keyof T]: T[K] }

function rowToSession(r: any): Session {
  return {
    id: r.id, buildVersion: r.build_version, testNote: r.test_note, deviceId: r.device_id,
    deviceModel: r.device_model, androidVersion: r.android_version,
    connectionMode: r.connection_mode, status: r.status,
    durationMs: r.duration_ms, startedAt: r.started_at, endedAt: r.ended_at,
  }
}
function rowToBug(r: any): Bug {
  return {
    id: r.id, sessionId: r.session_id, offsetMs: r.offset_ms,
    severity: r.severity, note: r.note,
    screenshotRel: r.screenshot_rel, logcatRel: r.logcat_rel,
    createdAt: r.created_at,
  }
}

export function openDb(file: string) {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (id, build_version, test_note, device_id, device_model, android_version,
                          connection_mode, status, duration_ms, started_at, ended_at)
    VALUES (@id, @buildVersion, @testNote, @deviceId, @deviceModel, @androidVersion,
            @connectionMode, @status, @durationMs, @startedAt, @endedAt)
  `)
  const finalizeSessionStmt = db.prepare(`
    UPDATE sessions SET status='draft', duration_ms=@durationMs, ended_at=@endedAt WHERE id=@id
  `)
  const getSessionStmt   = db.prepare(`SELECT * FROM sessions WHERE id = ?`)
  const listSessionsStmt = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`)
  const deleteSessionStmt= db.prepare(`DELETE FROM sessions WHERE id = ?`)

  const insertBugStmt = db.prepare(`
    INSERT INTO bugs (id, session_id, offset_ms, severity, note, screenshot_rel, logcat_rel, created_at)
    VALUES (@id, @sessionId, @offsetMs, @severity, @note, @screenshotRel, @logcatRel, @createdAt)
  `)
  const updateBugStmt = db.prepare(`UPDATE bugs SET note=@note, severity=@severity WHERE id=@id`)
  const deleteBugStmt = db.prepare(`DELETE FROM bugs WHERE id = ?`)
  const listBugsStmt  = db.prepare(`SELECT * FROM bugs WHERE session_id = ? ORDER BY offset_ms ASC`)

  return {
    raw: db,
    insertSession(s: Session) { insertSessionStmt.run(s) },
    finalizeSession(id: string, args: { durationMs: number; endedAt: number }) {
      finalizeSessionStmt.run({ id, ...args })
    },
    getSession(id: string): Session | undefined {
      const r = getSessionStmt.get(id) as any
      return r ? rowToSession(r) : undefined
    },
    listSessions(): Session[] {
      return (listSessionsStmt.all() as any[]).map(rowToSession)
    },
    deleteSession(id: string) { deleteSessionStmt.run(id) },
    insertBug(b: Bug) { insertBugStmt.run(b) },
    updateBug(id: string, patch: { note: string; severity: BugSeverity }) {
      updateBugStmt.run({ id, ...patch })
    },
    deleteBug(id: string) { deleteBugStmt.run(id) },
    listBugs(sessionId: string): Bug[] {
      return (listBugsStmt.all(sessionId) as any[]).map(rowToBug)
    },
    close() { db.close() },
  }
}

export type Db = ReturnType<typeof openDb>
```

- [ ] **Step 8.5: Run test, verify pass**

```bash
pnpm --filter desktop test db
```
Expected: PASS (7 tests).

- [ ] **Step 8.6: Commit**

```bash
git add apps/desktop/electron/db.ts apps/desktop/electron/__tests__/db.test.ts apps/desktop/shared/types.ts
git commit -m "feat(desktop): add SQLite repository for sessions and bugs"
```

---

## Task 9: Logcat rolling 30s buffer

**Files:**
- Create: `apps/desktop/electron/logcat.ts`
- Create: `apps/desktop/electron/__tests__/logcat.test.ts`

- [ ] **Step 9.1: Write failing test**

Create `apps/desktop/electron/__tests__/logcat.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { LogcatBuffer } from '../logcat'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

function mockSpawnedProcess(): { proc: SpawnedProcess; emitLine: (s: string) => void; close: () => void } {
  const stdout = new EventEmitter() as any as Readable
  const stderr = new EventEmitter() as any as Readable
  const exitHandlers: any[] = []
  const proc: SpawnedProcess = {
    pid: 1, stdout, stderr,
    kill: vi.fn().mockReturnValue(true),
    onExit: (h) => exitHandlers.push(h),
  }
  return {
    proc,
    emitLine: (s) => stdout.emit('data', Buffer.from(s + '\n')),
    close: () => exitHandlers.forEach(h => h(0)),
  }
}

describe('LogcatBuffer', () => {
  it('appends incoming lines and dumps recent ones within window', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC', { windowMs: 30_000, nowFn: () => 1000 })
    buf.start()
    m.emitLine('line @ t=0 (kept)')
    m.emitLine('line @ t=0 (kept 2)')
    const snap = buf.dumpRecent(/* now */ 1000)
    expect(snap.split('\n').filter(Boolean)).toEqual(['line @ t=0 (kept)', 'line @ t=0 (kept 2)'])
  })

  it('drops lines older than windowMs', () => {
    const buf = new LogcatBuffer({ run: vi.fn() as any, spawn: vi.fn() as any }, 'ABC', { windowMs: 5_000 })
    buf.appendLineForTest('old', 1000)
    buf.appendLineForTest('mid', 4000)
    buf.appendLineForTest('new', 6000)
    expect(buf.dumpRecent(7000)).toBe('mid\nnew')   // window: [2000, 7000]
  })

  it('stop kills the process', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC')
    buf.start()
    buf.stop()
    expect(m.proc.kill).toHaveBeenCalled()
  })

  it('passes correct adb args', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    new LogcatBuffer(runner, 'ABC').start()
    const args = (runner.spawn as any).mock.calls[0][1] as string[]
    expect(args).toEqual(['-s', 'ABC', 'logcat', '-v', 'threadtime'])
  })
})
```

- [ ] **Step 9.2: Run test, verify fail**

```bash
pnpm --filter desktop test logcat
```
Expected: FAIL.

- [ ] **Step 9.3: Implement `logcat.ts`**

Create `apps/desktop/electron/logcat.ts`:
```typescript
import { writeFileSync } from 'node:fs'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface LogcatOptions {
  windowMs?: number
  nowFn?: () => number
}

interface Entry { t: number; line: string }

export class LogcatBuffer {
  private process?: SpawnedProcess
  private entries: Entry[] = []
  private partial = ''
  private windowMs: number
  private now: () => number

  constructor(private runner: IProcessRunner, private deviceId: string, opts: LogcatOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000
    this.now = opts.nowFn ?? Date.now
  }

  start(): void {
    if (this.process) return
    const proc = this.runner.spawn('adb', ['-s', this.deviceId, 'logcat', '-v', 'threadtime'])
    proc.stdout.on('data', (chunk: Buffer) => this.consume(chunk.toString()))
    this.process = proc
  }

  stop(): void {
    if (!this.process) return
    try { this.process.kill('SIGTERM') } catch {}
    this.process = undefined
  }

  /** Returns the recent window as a single string (lines joined by \n). */
  dumpRecent(now: number = this.now()): string {
    const cutoff = now - this.windowMs
    return this.entries
      .filter(e => e.t >= cutoff)
      .map(e => e.line)
      .join('\n')
  }

  /** Convenience: dump and write to file. */
  dumpRecentToFile(filePath: string, now: number = this.now()): void {
    writeFileSync(filePath, this.dumpRecent(now), 'utf8')
  }

  /** Test-only seam — bypass spawn pipe. */
  appendLineForTest(line: string, at: number) {
    this.entries.push({ t: at, line })
    this.gc(at)
  }

  private consume(chunk: string) {
    const text = this.partial + chunk
    const lines = text.split(/\r?\n/)
    this.partial = lines.pop() ?? ''
    const t = this.now()
    for (const line of lines) {
      if (line) this.entries.push({ t, line })
    }
    this.gc(t)
  }

  private gc(now: number) {
    const cutoff = now - this.windowMs
    if (this.entries.length === 0 || this.entries[0].t >= cutoff) return
    // entries are pushed in time order, so a single splice up to first kept index works.
    let i = 0
    while (i < this.entries.length && this.entries[i].t < cutoff) i++
    if (i > 0) this.entries.splice(0, i)
  }
}
```

- [ ] **Step 9.4: Run test, verify pass**

```bash
pnpm --filter desktop test logcat
```
Expected: PASS (4 tests).

- [ ] **Step 9.5: Commit**

```bash
git add apps/desktop/electron/logcat.ts apps/desktop/electron/__tests__/logcat.test.ts
git commit -m "feat(desktop): add rolling 30s logcat buffer"
```

---

## Task 10: Screenshot capture

**Files:**
- Create: `apps/desktop/electron/screenshot.ts`
- Create: `apps/desktop/electron/__tests__/screenshot.test.ts`

- [ ] **Step 10.1: Write failing test**

Create `apps/desktop/electron/__tests__/screenshot.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { captureScreenshot } from '../screenshot'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

function mockProc(payload: Buffer): { proc: SpawnedProcess; complete: () => void } {
  const stdout = Readable.from([payload])
  const stderr = new EventEmitter() as any
  const exitHandlers: any[] = []
  return {
    proc: {
      pid: 1, stdout: stdout as any, stderr,
      kill: () => true,
      onExit: (h) => exitHandlers.push(h),
    },
    complete: () => exitHandlers.forEach(h => h(0)),
  }
}

describe('captureScreenshot', () => {
  it('writes adb stdout bytes to outPath', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-'))
    const out = join(dir, 'a.png')
    try {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const m = mockProc(png)
      const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
      const p = captureScreenshot(runner, 'ABC', out)
      // Readable.from emits 'end' immediately after data; trigger exit:
      m.complete()
      await p
      const args = (runner.spawn as any).mock.calls[0][1] as string[]
      expect(args).toEqual(['-s', 'ABC', 'exec-out', 'screencap', '-p'])
      expect(readFileSync(out).equals(png)).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
```

- [ ] **Step 10.2: Run test, verify fail**

```bash
pnpm --filter desktop test screenshot
```
Expected: FAIL.

- [ ] **Step 10.3: Implement `screenshot.ts`**

Create `apps/desktop/electron/screenshot.ts`:
```typescript
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { IProcessRunner } from './process-runner'

export async function captureScreenshot(runner: IProcessRunner, deviceId: string, outPath: string): Promise<void> {
  const proc = runner.spawn('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'])
  await pipeline(proc.stdout, createWriteStream(outPath))
}
```

- [ ] **Step 10.4: Run test, verify pass**

```bash
pnpm --filter desktop test screenshot
```
Expected: PASS (1 test).

- [ ] **Step 10.5: Commit**

```bash
git add apps/desktop/electron/screenshot.ts apps/desktop/electron/__tests__/screenshot.test.ts
git commit -m "feat(desktop): add adb screencap capture to file"
```

---

## Task 11: Session lifecycle orchestrator

**Files:**
- Create: `apps/desktop/electron/session.ts`
- Create: `apps/desktop/electron/__tests__/session.test.ts`

This is the most important module. It owns the active session, ties together scrcpy + logcat + screenshot + db, and exposes a small API consumed by the IPC layer.

- [ ] **Step 11.1: Write failing test**

Create `apps/desktop/electron/__tests__/session.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '../session'
import { openDb } from '../db'
import { createPaths } from '../paths'
import type { Adb } from '../adb'
import type { Scrcpy } from '../scrcpy'
import type { LogcatBuffer } from '../logcat'

let nowMs = 1_700_000_000_000
const advance = (ms: number) => { nowMs += ms }

function makeStubs() {
  const adb = {
    getDeviceInfo: vi.fn().mockResolvedValue({ model: 'Pixel 7', androidVersion: '14' }),
  } as unknown as Adb
  const scrcpy = {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    elapsedMs: vi.fn().mockImplementation(() => nowMs - 1_700_000_000_000),
    isRunning: vi.fn().mockReturnValue(true),
  } as unknown as Scrcpy
  const logcat = {
    start: vi.fn(),
    stop: vi.fn(),
    dumpRecentToFile: vi.fn().mockImplementation((path: string) => writeFileSync(path, 'log line\n')),
  } as unknown as LogcatBuffer
  const screenshot = vi.fn().mockImplementation(async (_runner, _id, out: string) => {
    writeFileSync(out, Buffer.from([0x89, 0x50]))
  })
  return { adb, scrcpy, logcat, screenshot }
}

describe('SessionManager', () => {
  let root: string
  let db: ReturnType<typeof openDb>
  let paths: ReturnType<typeof createPaths>
  let stubs: ReturnType<typeof makeStubs>
  let mgr: SessionManager

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sess-'))
    paths = createPaths(root)
    paths.ensureRoot()
    db = openDb(paths.dbFile())
    stubs = makeStubs()
    nowMs = 1_700_000_000_000
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner: { run: vi.fn() as any, spawn: vi.fn() as any },
      captureScreenshot: stubs.screenshot,
      now: () => nowMs,
      newId: ((seq) => () => `id-${seq++}`)(1),
    })
  })

  afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }) })

  it('start creates session row, starts scrcpy + logcat, ensures dirs', async () => {
    const s = await mgr.start({
      deviceId: 'ABC', connectionMode: 'usb', buildVersion: '1.0', testNote: 'note',
    })
    expect(s.id).toBe('id-1')
    expect(s.deviceModel).toBe('Pixel 7')
    expect(s.status).toBe('recording')
    expect(stubs.scrcpy.start).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'ABC', recordPath: paths.videoFile('id-1'),
    }))
    expect(stubs.logcat.start).toHaveBeenCalled()
    expect(existsSync(paths.screenshotsDir('id-1'))).toBe(true)
  })

  it('throws when starting while already active', async () => {
    await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    await expect(mgr.start({ deviceId: 'B', connectionMode: 'usb', buildVersion: '', testNote: '' }))
      .rejects.toThrow(/already/)
  })

  it('markBug snapshots scrcpy elapsed, captures screenshot+logcat, inserts row', async () => {
    await mgr.start({ deviceId: 'ABC', connectionMode: 'usb', buildVersion: '', testNote: '' })
    advance(7000)
    const bug = await mgr.markBug({ severity: 'major', note: 'crash' })
    expect(bug.offsetMs).toBe(7000)
    expect(bug.severity).toBe('major')
    expect(existsSync(paths.screenshotFile('id-1', bug.id))).toBe(true)
    expect(existsSync(paths.logcatFile('id-1', bug.id))).toBe(true)
    expect(stubs.logcat.dumpRecentToFile).toHaveBeenCalledWith(paths.logcatFile('id-1', bug.id))
    expect(db.listBugs('id-1')).toHaveLength(1)
  })

  it('markBug throws when no active session', async () => {
    await expect(mgr.markBug({ severity: 'normal', note: 'x' })).rejects.toThrow(/no active/)
  })

  it('stop transitions session to draft, stops scrcpy + logcat, sets duration', async () => {
    await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    advance(60_000)
    const s = await mgr.stop()
    expect(s.status).toBe('draft')
    expect(s.durationMs).toBe(60_000)
    expect(stubs.scrcpy.stop).toHaveBeenCalled()
    expect(stubs.logcat.stop).toHaveBeenCalled()
    expect(mgr.activeSessionId()).toBeNull()
  })

  it('discard deletes session row + files', async () => {
    const s = await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    await mgr.stop()
    await mgr.discard(s.id)
    expect(db.getSession(s.id)).toBeUndefined()
    expect(existsSync(paths.sessionDir(s.id))).toBe(false)
  })
})
```

> Note: tests above import `afterEach` indirectly — add `import { afterEach } from 'vitest'` at top.

- [ ] **Step 11.2: Run test, verify fail**

```bash
pnpm --filter desktop test session
```
Expected: FAIL — module not found.

- [ ] **Step 11.3: Implement `session.ts`**

Create `apps/desktop/electron/session.ts`:
```typescript
import { rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Adb } from './adb'
import type { Scrcpy } from './scrcpy'
import type { LogcatBuffer } from './logcat'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { Paths } from './paths'
import type { Session, Bug, BugSeverity } from '@shared/types'
import { captureScreenshot as defaultCapture } from './screenshot'

export interface SessionDeps {
  db: Db
  paths: Paths
  adb: Adb
  scrcpy: Scrcpy
  logcat: LogcatBuffer
  runner: IProcessRunner
  captureScreenshot?: typeof defaultCapture
  now?: () => number
  newId?: () => string
}

export interface StartArgs {
  deviceId: string
  connectionMode: 'usb' | 'wifi'
  buildVersion: string
  testNote: string
}

export interface MarkBugArgs {
  severity: BugSeverity
  note: string
}

export class SessionManager {
  private active: Session | null = null
  private capture: typeof defaultCapture
  private now: () => number
  private newId: () => string

  constructor(private deps: SessionDeps) {
    this.capture = deps.captureScreenshot ?? defaultCapture
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
  }

  activeSessionId(): string | null { return this.active?.id ?? null }

  async start(args: StartArgs): Promise<Session> {
    if (this.active) throw new Error('a session is already active')
    const { db, paths, adb, scrcpy, logcat } = this.deps
    const info = await adb.getDeviceInfo(args.deviceId)
    const id = this.newId()
    paths.ensureSessionDirs(id)
    const sess: Session = {
      id, buildVersion: args.buildVersion, testNote: args.testNote,
      deviceId: args.deviceId, deviceModel: info.model, androidVersion: info.androidVersion,
      connectionMode: args.connectionMode, status: 'recording',
      durationMs: null, startedAt: this.now(), endedAt: null,
    }
    db.insertSession(sess)
    scrcpy.start({ deviceId: args.deviceId, recordPath: paths.videoFile(id), windowTitle: `Loupe — ${info.model}` })
    logcat.start()
    this.active = sess
    return sess
  }

  async markBug(args: MarkBugArgs): Promise<Bug> {
    if (!this.active) throw new Error('no active session')
    const { db, paths, scrcpy, logcat, runner } = this.deps
    const sess = this.active
    const offsetMs = scrcpy.elapsedMs() ?? 0
    const bugId = this.newId()
    const screenshotPath = paths.screenshotFile(sess.id, bugId)
    const logcatPath = paths.logcatFile(sess.id, bugId)

    // Run side effects in parallel; tolerate screenshot failure (don't block bug record).
    const shotP = this.capture(runner, sess.deviceId, screenshotPath).then(() => true).catch(() => false)
    logcat.dumpRecentToFile(logcatPath)
    const shotOk = await shotP

    const bug: Bug = {
      id: bugId, sessionId: sess.id, offsetMs, severity: args.severity, note: args.note,
      screenshotRel: shotOk ? `screenshots/${bugId}.png` : null,
      logcatRel: `logcat/${bugId}.txt`,
      createdAt: this.now(),
    }
    db.insertBug(bug)
    return bug
  }

  async stop(): Promise<Session> {
    if (!this.active) throw new Error('no active session')
    const { db, scrcpy, logcat } = this.deps
    const sess = this.active
    await scrcpy.stop()
    logcat.stop()
    const endedAt = this.now()
    const durationMs = endedAt - sess.startedAt
    db.finalizeSession(sess.id, { durationMs, endedAt })
    this.active = null
    const updated = db.getSession(sess.id)!
    return updated
  }

  async discard(sessionId: string): Promise<void> {
    if (this.active?.id === sessionId) {
      try { await this.deps.scrcpy.stop() } catch {}
      this.deps.logcat.stop()
      this.active = null
    }
    rmSync(this.deps.paths.sessionDir(sessionId), { recursive: true, force: true })
    this.deps.db.deleteSession(sessionId)
  }

  // Pass-throughs used by IPC layer:
  listSessions() { return this.deps.db.listSessions() }
  getSession(id: string) { return this.deps.db.getSession(id) }
  listBugs(sessionId: string) { return this.deps.db.listBugs(sessionId) }
  updateBug(id: string, patch: { note: string; severity: BugSeverity }) {
    this.deps.db.updateBug(id, patch)
  }
  deleteBug(id: string) { this.deps.db.deleteBug(id) }
}
```

- [ ] **Step 11.4: Run test, verify pass**

```bash
pnpm --filter desktop test session
```
Expected: PASS (6 tests).

- [ ] **Step 11.5: Commit**

```bash
git add apps/desktop/electron/session.ts apps/desktop/electron/__tests__/session.test.ts
git commit -m "feat(desktop): add SessionManager orchestrating scrcpy + logcat + screenshot + db"
```

---

## Task 12: IPC bridge (typed)

**Files:**
- Modify: `apps/desktop/shared/types.ts` — add IPC contract
- Create: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/main.ts` — wire up
- Modify: `apps/desktop/electron/preload.ts` — expose typed api
- Create: `apps/desktop/src/lib/api.ts` — typed renderer-side wrapper

- [ ] **Step 12.1: Define IPC contract in shared types**

Edit `apps/desktop/shared/types.ts` — append:
```typescript
import type { ToolCheck } from '../electron/doctor'    // type-only import is fine across boundaries
export type { ToolCheck }

export interface DesktopApi {
  doctor():                                                        Promise<ToolCheck[]>
  device: {
    list():                                                        Promise<Device[]>
    connect(ip: string, port?: number):                            Promise<{ ok: boolean; message: string }>
  }
  session: {
    start(args: {
      deviceId: string; connectionMode: 'usb' | 'wifi';
      buildVersion: string; testNote: string;
    }):                                                            Promise<Session>
    markBug(args: { severity: BugSeverity; note: string }):        Promise<Bug>
    stop():                                                        Promise<Session>
    discard(sessionId: string):                                    Promise<void>
    list():                                                        Promise<Session[]>
    get(id: string):                                               Promise<{ session: Session; bugs: Bug[] } | null>
  }
  bug: {
    update(id: string, patch: { note: string; severity: BugSeverity }): Promise<void>
    delete(id: string):                                            Promise<void>
    /** Extracts a clip [offset-5s, offset+10s] to user-chosen path. Returns saved path or null if cancelled. */
    exportClip(args: { sessionId: string; bugId: string }):        Promise<string | null>
  }
  /** Renderer subscribes to this to know when global F8 fired in main. */
  onBugMarkRequested(cb: () => void):                              () => void   // returns unsubscribe
}
```

- [ ] **Step 12.2: Implement IPC handlers**

Create `apps/desktop/electron/ipc.ts`:
```typescript
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { extractClip, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import { doctor } from './doctor'

export const CHANNEL = {
  doctor:           'app:doctor',
  deviceList:       'device:list',
  deviceConnect:    'device:connect',
  sessionStart:     'session:start',
  sessionMarkBug:   'session:markBug',
  sessionStop:      'session:stop',
  sessionDiscard:   'session:discard',
  sessionList:      'session:list',
  sessionGet:       'session:get',
  bugUpdate:        'bug:update',
  bugDelete:        'bug:delete',
  bugExportClip:    'bug:exportClip',
  bugMarkRequested: 'bug:markRequested',
} as const

export interface IpcDeps {
  adb: Adb
  manager: SessionManager
  paths: Paths
  runner: IProcessRunner
  db: Db
  getWindow: () => BrowserWindow | null
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => deps.manager.start(args))
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => deps.manager.stop())
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => deps.manager.discard(id))
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (_e, id: string) => {
    const session = deps.manager.getSession(id)
    if (!session) return null
    return { session, bugs: deps.manager.listBugs(id) }
  })

  ipcMain.handle(CHANNEL.bugUpdate, async (_e, id: string, patch) => deps.manager.updateBug(id, patch))
  ipcMain.handle(CHANNEL.bugDelete, async (_e, id: string) => deps.manager.deleteBug(id))

  ipcMain.handle(CHANNEL.bugExportClip, async (_e, args: { sessionId: string; bugId: string }): Promise<string | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId)
    const bug = bugs.find(b => b.id === args.bugId)
    if (!session || !bug) throw new Error('session or bug not found')

    const win = deps.getWindow()
    const saveResult = await dialog.showSaveDialog(win ?? undefined, {
      title: 'Export bug clip',
      defaultPath: `bug-${bug.id.slice(0, 8)}-${session.buildVersion || 'session'}.mp4`,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    })
    if (saveResult.canceled || !saveResult.filePath) return null

    const startMs = Math.max(0, bug.offsetMs - 5_000)
    const endMs   = Math.min(session.durationMs ?? bug.offsetMs + 10_000, bug.offsetMs + 10_000)
    await extractClip(deps.runner, resolveBundledFfmpegPath(), {
      inputPath: deps.paths.videoFile(session.id),
      outputPath: saveResult.filePath,
      startMs, endMs,
    })
    return saveResult.filePath
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null) {
  win?.webContents.send(CHANNEL.bugMarkRequested)
}
```

- [ ] **Step 12.3: Wire main.ts**

Replace `apps/desktop/electron/main.ts` with:
```typescript
import { app, BrowserWindow, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { RealProcessRunner } from './process-runner'
import { Adb } from './adb'
import { Scrcpy } from './scrcpy'
import { LogcatBuffer } from './logcat'
import { SessionManager } from './session'
import { openDb } from './db'
import { createPaths, defaultRoot } from './paths'
import { registerIpc, emitBugMarkRequested } from './ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))
let win: BrowserWindow | null = null

async function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const root = defaultRoot(app.getPath('userData'))
  const paths = createPaths(root); paths.ensureRoot()
  const db = openDb(paths.dbFile())
  const runner = new RealProcessRunner()
  const adb = new Adb(runner)
  const scrcpy = new Scrcpy(runner)

  // logcat is recreated per session because it binds to a deviceId; we use a holder so SessionManager owns lifecycle.
  // Simplification for Phase 1: pass a logcat instance that re-targets via .start; only one device active at a time.
  // We construct it with a placeholder deviceId; SessionManager will recreate via dependency injection on real start.
  // To keep the wiring simple for MVP, we expose a factory:
  const logcatHolder = new LogcatBuffer(runner, '__placeholder__')
  // Replace logcat at session start by patching deps via a thin wrapper:

  const manager = new SessionManager({
    db, paths, adb, scrcpy, logcat: logcatHolder, runner,
  })
  // Override SessionManager.start to swap a fresh logcat for the chosen deviceId.
  const origStart = manager.start.bind(manager)
  manager.start = async (args) => {
    ;(manager as any).deps.logcat = new LogcatBuffer(runner, args.deviceId)
    return origStart(args)
  }

  registerIpc({ adb, manager, paths, runner, db, getWindow: () => win })

  await createWindow()

  globalShortcut.register('F8', () => emitBugMarkRequested(win))
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
```

> **Logcat lifecycle note:** The `manager.start` override hot-swaps the logcat instance to bind it to the chosen device. This is a deliberate simplification for Phase 1; if it grows uglier we can lift logcat creation into `SessionManager` proper as a factory.

- [ ] **Step 12.4: Wire preload.ts**

Replace `apps/desktop/electron/preload.ts` with:
```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from './ipc'
import type { DesktopApi } from '@shared/types'

const api: DesktopApi = {
  doctor: () => ipcRenderer.invoke(CHANNEL.doctor),
  device: {
    list:    ()                 => ipcRenderer.invoke(CHANNEL.deviceList),
    connect: (ip, port)         => ipcRenderer.invoke(CHANNEL.deviceConnect, ip, port),
  },
  session: {
    start:   (args)             => ipcRenderer.invoke(CHANNEL.sessionStart, args),
    markBug: (args)             => ipcRenderer.invoke(CHANNEL.sessionMarkBug, args),
    stop:    ()                 => ipcRenderer.invoke(CHANNEL.sessionStop),
    discard: (id)               => ipcRenderer.invoke(CHANNEL.sessionDiscard, id),
    list:    ()                 => ipcRenderer.invoke(CHANNEL.sessionList),
    get:     (id)               => ipcRenderer.invoke(CHANNEL.sessionGet, id),
  },
  bug: {
    update:     (id, patch)     => ipcRenderer.invoke(CHANNEL.bugUpdate, id, patch),
    delete:     (id)            => ipcRenderer.invoke(CHANNEL.bugDelete, id),
    exportClip: (args)          => ipcRenderer.invoke(CHANNEL.bugExportClip, args),
  },
  onBugMarkRequested: (cb) => {
    const handler = () => cb()
    ipcRenderer.on(CHANNEL.bugMarkRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.bugMarkRequested, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window { api: DesktopApi }
}
```

- [ ] **Step 12.5: Renderer-side typed api**

Create `apps/desktop/src/lib/api.ts`:
```typescript
import type { DesktopApi } from '@shared/types'

export const api: DesktopApi = (window as unknown as { api: DesktopApi }).api
```

- [ ] **Step 12.6: Manual verify**

```bash
pnpm desktop:dev
```
Open DevTools (Ctrl+Shift+I) in the Electron window, run in the renderer console:
```javascript
await window.api.doctor()
```
Expected: an array with `adb`/`scrcpy` checks (likely both `ok: false` since user hasn't installed them yet; that's fine).

- [ ] **Step 12.7: Commit**

```bash
git add apps/desktop/electron/ipc.ts apps/desktop/electron/main.ts apps/desktop/electron/preload.ts apps/desktop/src/lib/api.ts apps/desktop/shared/types.ts
git commit -m "feat(desktop): wire typed IPC bridge between main and renderer"
```

---

## Task 13: UI — Home (device picker + new session form)

**Files:**
- Create: `apps/desktop/src/routes/Home.tsx`
- Create: `apps/desktop/src/components/DevicePicker.tsx`
- Create: `apps/desktop/src/components/NewSessionForm.tsx`
- Create: `apps/desktop/src/lib/store.ts`
- Modify: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/__tests__/DevicePicker.test.tsx`

- [ ] **Step 13.1: Zustand store**

Create `apps/desktop/src/lib/store.ts`:
```typescript
import { create } from 'zustand'
import type { Session } from '@shared/types'

type View =
  | { name: 'home' }
  | { name: 'recording'; session: Session }
  | { name: 'draft'; sessionId: string }

interface AppState {
  view: View
  recentBuilds: string[]
  goHome(): void
  goRecording(s: Session): void
  goDraft(id: string): void
  pushRecentBuild(b: string): void
}

const RECENT_KEY = 'recentBuilds'
const initialRecent: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
})()

export const useApp = create<AppState>((set, get) => ({
  view: { name: 'home' },
  recentBuilds: initialRecent,
  goHome:      () => set({ view: { name: 'home' } }),
  goRecording: (session) => set({ view: { name: 'recording', session } }),
  goDraft:     (sessionId) => set({ view: { name: 'draft', sessionId } }),
  pushRecentBuild: (b) => {
    if (!b) return
    const next = [b, ...get().recentBuilds.filter(x => x !== b)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    set({ recentBuilds: next })
  },
}))
```

- [ ] **Step 13.2: DevicePicker component**

Create `apps/desktop/src/components/DevicePicker.tsx`:
```typescript
import { useEffect, useState } from 'react'
import type { Device, DesktopApi } from '@shared/types'

interface Props {
  api: DesktopApi
  selectedId: string | null
  onSelect(id: string, mode: 'usb' | 'wifi'): void
}

export function DevicePicker({ api, selectedId, onSelect }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [wifiIp, setWifiIp] = useState('')
  const [wifiBusy, setWifiBusy] = useState(false)

  async function refresh() {
    try { setDevices(await api.device.list()); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  async function addWifi() {
    if (!wifiIp.trim()) return
    setWifiBusy(true)
    try {
      const r = await api.device.connect(wifiIp.trim())
      if (!r.ok) setError(r.message)
      await refresh()
    } finally { setWifiBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Devices</h2>
        <button onClick={refresh} className="text-xs text-zinc-400 hover:text-zinc-200">refresh</button>
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <div className="space-y-1">
        {devices.length === 0 && <div className="text-xs text-zinc-500">no devices — connect via USB or add a Wi-Fi device below</div>}
        {devices.map(d => (
          <button
            key={d.id}
            onClick={() => onSelect(d.id, d.type)}
            disabled={d.state !== 'device'}
            className={`w-full text-left rounded px-3 py-2 text-sm
              ${selectedId === d.id ? 'bg-blue-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200'}
              ${d.state !== 'device' ? 'opacity-50' : ''}`}
            data-testid={`device-${d.id}`}
          >
            <div className="font-mono text-xs">{d.id}</div>
            <div className="text-xs text-zinc-400">
              {d.type.toUpperCase()} · {d.state}{d.model ? ` · ${d.model}` : ''}
            </div>
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <label className="text-xs text-zinc-400">Add Wi-Fi device (e.g. 192.168.1.42)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={wifiIp} onChange={e => setWifiIp(e.target.value)}
            placeholder="ip[:port]" data-testid="wifi-ip"
            className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            onClick={addWifi} disabled={wifiBusy} data-testid="wifi-connect"
            className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {wifiBusy ? 'connecting…' : 'connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 13.3: NewSessionForm component**

Create `apps/desktop/src/components/NewSessionForm.tsx`:
```typescript
import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { DesktopApi } from '@shared/types'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: 'usb' | 'wifi'
}

export function NewSessionForm({ api, deviceId, connectionMode }: Props) {
  const recent = useApp(s => s.recentBuilds)
  const pushRecent = useApp(s => s.pushRecentBuild)
  const goRecording = useApp(s => s.goRecording)

  const [build, setBuild] = useState(recent[0] ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (!build.trim()) return setError('build version is required')
    setBusy(true); setError(null)
    try {
      const session = await api.session.start({ deviceId, connectionMode, buildVersion: build.trim(), testNote: note.trim() })
      pushRecent(build.trim())
      goRecording(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-zinc-400">Build version *</label>
        <input
          value={build} onChange={e => setBuild(e.target.value)}
          list="recent-builds" placeholder="1.4.2-RC3" data-testid="build-version"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
        <datalist id="recent-builds">{recent.map(b => <option key={b} value={b} />)}</datalist>
      </div>

      <div>
        <label className="text-xs text-zinc-400">Test note (optional)</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. verify BUG-1234 fix" data-testid="test-note"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <button
        onClick={start} disabled={busy || !deviceId} data-testid="start-session"
        className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? 'starting…' : 'Start session'}
      </button>
    </div>
  )
}
```

- [ ] **Step 13.4: Home route**

Create `apps/desktop/src/routes/Home.tsx`:
```typescript
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { ToolCheck } from '@shared/types'

export function Home() {
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])

  useEffect(() => { api.doctor().then(setChecks) }, [])

  const missing = checks.filter(c => !c.ok)

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] bg-zinc-950 text-zinc-100">
      <aside className="border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-semibold">Loupe</h1>
        <DevicePicker
          api={api}
          selectedId={selected?.id ?? null}
          onSelect={(id, mode) => setSelected({ id, mode })}
        />
      </aside>
      <main className="p-8">
        {missing.length > 0 && (
          <div className="mb-6 rounded border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-200">
            <div className="font-medium">Missing tools:</div>
            <ul className="mt-1 list-disc pl-5">
              {missing.map(c => <li key={c.name}><code>{c.name}</code> — {c.error}</li>)}
            </ul>
            <p className="mt-2 text-xs text-yellow-300/80">
              See README → Pre-flight for installation links. The app cannot record until both tools are on PATH.
            </p>
          </div>
        )}

        <h2 className="mb-4 text-sm font-medium text-zinc-300">New session</h2>
        {selected
          ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} />
          : <div className="text-sm text-zinc-500">Select a device on the left to begin.</div>
        }
      </main>
    </div>
  )
}
```

- [ ] **Step 13.5: Mount router shell**

Replace `apps/desktop/src/App.tsx`:
```typescript
import { useApp } from '@/lib/store'
import { Home } from '@/routes/Home'
import { Recording } from '@/routes/Recording'
import { Draft } from '@/routes/Draft'

export default function App() {
  const view = useApp(s => s.view)
  if (view.name === 'home') return <Home />
  if (view.name === 'recording') return <Recording session={view.session} />
  if (view.name === 'draft') return <Draft sessionId={view.sessionId} />
  return null
}
```

(Recording + Draft are stubbed in Step 13.6 below; filled in Tasks 14–15.)

- [ ] **Step 13.6: Stub Recording + Draft routes (will fill in next tasks)**

Create `apps/desktop/src/routes/Recording.tsx`:
```typescript
import type { Session } from '@shared/types'
export function Recording({ session }: { session: Session }) {
  return <div className="p-8 text-zinc-100">Recording: {session.id}</div>
}
```

Create `apps/desktop/src/routes/Draft.tsx`:
```typescript
export function Draft({ sessionId }: { sessionId: string }) {
  return <div className="p-8 text-zinc-100">Draft: {sessionId}</div>
}
```

- [ ] **Step 13.7: Component test for DevicePicker**

Create `apps/desktop/src/__tests__/DevicePicker.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DevicePicker } from '@/components/DevicePicker'
import type { Device, DesktopApi } from '@shared/types'

function fakeApi(devices: Device[], connectImpl?: any): DesktopApi {
  return {
    doctor: vi.fn() as any,
    device: { list: vi.fn().mockResolvedValue(devices), connect: connectImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'connected' }) },
    session: {} as any, bug: {} as any, onBugMarkRequested: () => () => {},
  }
}

describe('DevicePicker', () => {
  it('renders devices and selects one', async () => {
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([{ id: 'ABC', type: 'usb', state: 'device', model: 'Pixel 7' }])} selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByTestId('device-ABC')).toBeTruthy())
    fireEvent.click(screen.getByTestId('device-ABC'))
    expect(onSelect).toHaveBeenCalledWith('ABC', 'usb')
  })

  it('connect Wi-Fi dispatches device.connect with entered IP', async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    render(<DevicePicker api={fakeApi([], connect)} selectedId={null} onSelect={vi.fn()} />)
    fireEvent.change(screen.getByTestId('wifi-ip'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('wifi-connect'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('10.0.0.7', undefined))
  })
})
```

- [ ] **Step 13.8: Run tests, verify pass; manual smoke**

```bash
pnpm --filter desktop test DevicePicker
pnpm desktop:dev
```
Expected:
- Tests: PASS (2 tests).
- App opens with Home view, sidebar shows "no devices" or your USB device if installed adb + plugged in. Yellow banner appears if adb/scrcpy not on PATH.

- [ ] **Step 13.9: Commit**

```bash
git add apps/desktop/src
git commit -m "feat(desktop): home view with device picker + new session form"
```

---

## Task 14: UI — Recording + global F8 BugMarkDialog

**Files:**
- Modify: `apps/desktop/src/routes/Recording.tsx`
- Create: `apps/desktop/src/components/BugMarkDialog.tsx`
- Create: `apps/desktop/src/__tests__/BugMarkDialog.test.tsx`

- [ ] **Step 14.1: BugMarkDialog**

Create `apps/desktop/src/components/BugMarkDialog.tsx`:
```typescript
import { useEffect, useRef, useState } from 'react'
import type { BugSeverity, DesktopApi } from '@shared/types'

interface Props {
  open: boolean
  api: DesktopApi
  onSubmitted(): void
  onCancel(): void
}

export function BugMarkDialog({ open, api, onSubmitted, onCancel }: Props) {
  const [severity, setSeverity] = useState<BugSeverity>('normal')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setNote(''); setSeverity('normal')
      // Focus shortly after render so the modal is mounted.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  async function submit() {
    if (!note.trim()) return
    setBusy(true)
    try {
      await api.session.markBug({ severity, note: note.trim() })
      onSubmitted()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32" data-testid="bug-dialog">
      <div className="w-[420px] rounded-lg bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-2 text-xs text-zinc-400">F8 — Mark bug</div>
        <div className="flex gap-2">
          <button
            onClick={() => setSeverity('major')}
            className={`flex-1 rounded px-3 py-1 text-sm ${severity === 'major' ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}
            data-testid="severity-major"
          >Major</button>
          <button
            onClick={() => setSeverity('normal')}
            className={`flex-1 rounded px-3 py-1 text-sm ${severity === 'normal' ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}
            data-testid="severity-normal"
          >Normal</button>
        </div>
        <input
          ref={inputRef} value={note} onChange={e => setNote(e.target.value)} maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          placeholder="What happened?  (Enter to save · Esc to cancel)" data-testid="bug-note"
          className="mt-3 w-full rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
        <div className="mt-2 text-right text-xs text-zinc-500">{note.length}/200{busy ? ' · saving…' : ''}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 14.2: BugMarkDialog test**

Create `apps/desktop/src/__tests__/BugMarkDialog.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugMarkDialog } from '@/components/BugMarkDialog'
import type { DesktopApi } from '@shared/types'

function fakeApi(markBug = vi.fn().mockResolvedValue({ id: 'b1' })): DesktopApi {
  return {
    doctor: vi.fn() as any, device: {} as any,
    session: { markBug } as any, bug: {} as any, onBugMarkRequested: () => () => {},
  }
}

describe('BugMarkDialog', () => {
  it('Enter submits with note + severity, calls onSubmitted', async () => {
    const markBug = vi.fn().mockResolvedValue({ id: 'b1' })
    const onSubmitted = vi.fn(); const onCancel = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={onSubmitted} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('severity-major'))
    fireEvent.change(screen.getByTestId('bug-note'), { target: { value: 'cards stuck' } })
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Enter' })
    await waitFor(() => expect(markBug).toHaveBeenCalledWith({ severity: 'major', note: 'cards stuck' }))
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('Escape cancels without calling api', () => {
    const markBug = vi.fn(); const onSubmitted = vi.fn(); const onCancel = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={onSubmitted} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Escape' })
    expect(markBug).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not submit empty note', async () => {
    const markBug = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Enter' })
    expect(markBug).not.toHaveBeenCalled()
  })

  it('open=false renders nothing', () => {
    const { container } = render(<BugMarkDialog open={false} api={fakeApi()} onSubmitted={vi.fn()} onCancel={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 14.3: Recording route**

Replace `apps/desktop/src/routes/Recording.tsx`:
```typescript
import { useEffect, useState } from 'react'
import type { Session } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { BugMarkDialog } from '@/components/BugMarkDialog'

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60), r = s % 60
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

export function Recording({ session }: { session: Session }) {
  const goDraft = useApp(s => s.goDraft)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bugCount, setBugCount] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - session.startedAt), 500)
    return () => clearInterval(t)
  }, [session.startedAt])

  useEffect(() => {
    return api.onBugMarkRequested(() => setDialogOpen(true))
  }, [])

  async function stop() {
    setStopping(true)
    try {
      const updated = await api.session.stop()
      goDraft(updated.id)
    } finally { setStopping(false) }
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_360px] bg-zinc-950 text-zinc-100">
      <main className="flex flex-col items-center justify-center p-8">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Recording</div>
        <div className="mt-2 font-mono text-6xl tabular-nums">{fmtElapsed(elapsedMs)}</div>
        <div className="mt-3 text-sm text-zinc-400">{bugCount} bug{bugCount === 1 ? '' : 's'} marked · build {session.buildVersion}</div>
        <div className="mt-1 text-xs text-zinc-500">
          The scrcpy mirror window is separate. Press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">F8</kbd> from anywhere to mark a bug.
        </div>
        <button
          onClick={stop} disabled={stopping} data-testid="stop-session"
          className="mt-10 rounded bg-zinc-800 px-6 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
        >{stopping ? 'stopping…' : 'Stop session'}</button>
      </main>

      <aside className="border-l border-zinc-800 p-4 text-xs text-zinc-400">
        <div className="font-medium text-zinc-300">{session.deviceModel}</div>
        <div>Android {session.androidVersion} · {session.connectionMode.toUpperCase()}</div>
        {session.testNote && <div className="mt-3 italic text-zinc-500">{session.testNote}</div>}
      </aside>

      <BugMarkDialog
        open={dialogOpen} api={api}
        onSubmitted={() => { setDialogOpen(false); setBugCount(c => c + 1) }}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 14.4: Run tests, verify pass**

```bash
pnpm --filter desktop test BugMarkDialog
```
Expected: PASS (4 tests).

- [ ] **Step 14.5: Manual smoke (without device)**

```bash
pnpm desktop:dev
```
Open DevTools, run:
```javascript
// simulate the IPC event so we can see the dialog without F8 / device:
window.dispatchEvent(new CustomEvent('test-open'))   // not used; alternative below
```
Or temporarily add a "Mark bug" button to Recording for manual UI testing. (Removed before commit.) Actual F8 + real device tested in Task 15.

- [ ] **Step 14.6: Commit**

```bash
git add apps/desktop/src
git commit -m "feat(desktop): recording view with global F8 bug-mark dialog"
```

---

## Task 15: UI — Draft (video player + bug list + clip export)

**Files:**
- Modify: `apps/desktop/src/routes/Draft.tsx`
- Create: `apps/desktop/src/components/VideoPlayer.tsx`
- Create: `apps/desktop/src/components/BugList.tsx`
- Modify: `apps/desktop/electron/ipc.ts` — register a `protocol` for serving local files (see step 15.4)
- Modify: `apps/desktop/electron/main.ts` — register custom protocol
- Create: `apps/desktop/src/__tests__/BugList.test.tsx`

- [ ] **Step 15.1: VideoPlayer with bug markers**

Create `apps/desktop/src/components/VideoPlayer.tsx`:
```typescript
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Bug } from '@shared/types'

export interface VideoPlayerHandle {
  seekToMs(ms: number): void
}

interface Props {
  src: string
  bugs: Bug[]
  durationMs: number
  selectedBugId: string | null
  onMarkerClick(bug: Bug): void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ src, bugs, durationMs, selectedBugId, onMarkerClick }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [, force] = useState(0)

  useImperativeHandle(ref, () => ({
    seekToMs(ms: number) {
      const v = videoRef.current; if (!v) return
      v.currentTime = Math.max(0, ms / 1000)
      v.play().catch(() => {})
    },
  }), [])

  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onLoaded = () => force(x => x + 1)
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <video ref={videoRef} src={src} controls className="w-full rounded-lg bg-black" data-testid="video-el" />
      <div className="relative h-3 rounded bg-zinc-800" data-testid="timeline">
        {bugs.map(b => {
          const left = durationMs ? (b.offsetMs / durationMs) * 100 : 0
          const colour = b.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'
          const ring = b.id === selectedBugId ? 'ring-2 ring-white' : ''
          return (
            <button
              key={b.id}
              onClick={() => onMarkerClick(b)}
              title={b.note}
              data-testid={`marker-${b.id}`}
              style={{ left: `calc(${left}% - 6px)` }}
              className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${colour} ${ring}`}
            />
          )
        })}
      </div>
    </div>
  )
})
VideoPlayer.displayName = 'VideoPlayer'
```

- [ ] **Step 15.2: BugList**

Create `apps/desktop/src/components/BugList.tsx`:
```typescript
import { useState } from 'react'
import type { Bug, BugSeverity, DesktopApi } from '@shared/types'

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  onSelect(bug: Bug): void
  onMutated(): void               // refetch parent
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState(''); const [draftSev, setDraftSev] = useState<BugSeverity>('normal')

  function startEdit(b: Bug) {
    setEditingId(b.id); setDraftNote(b.note); setDraftSev(b.severity)
  }
  async function saveEdit(id: string) {
    await api.bug.update(id, { note: draftNote.trim() || '(empty)', severity: draftSev })
    setEditingId(null); onMutated()
  }
  async function del(id: string) {
    if (!confirm('Delete this bug?')) return
    await api.bug.delete(id); onMutated()
  }
  async function exportClip(id: string) {
    const path = await api.bug.exportClip({ sessionId, bugId: id })
    if (path) alert(`Exported to:\n${path}`)
  }

  return (
    <ul className="divide-y divide-zinc-800" data-testid="bug-list">
      {bugs.length === 0 && <li className="p-4 text-sm text-zinc-500">No bugs marked.</li>}
      {bugs.map(b => {
        const isSel = b.id === selectedBugId
        const sevColor = b.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'
        const isEditing = editingId === b.id
        return (
          <li
            key={b.id}
            data-testid={`bug-row-${b.id}`}
            className={`flex gap-3 p-3 ${isSel ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}
          >
            <button onClick={() => onSelect(b)} className="flex-shrink-0 self-start">
              <div className={`h-2 w-2 rounded-full ${sevColor}`} />
            </button>
            <div className="min-w-0 flex-1">
              <button onClick={() => onSelect(b)} className="text-left">
                <div className="text-xs font-mono text-zinc-400">{fmt(b.offsetMs)} · {b.severity}</div>
              </button>
              {isEditing ? (
                <div className="mt-1 space-y-2">
                  <input
                    value={draftNote} onChange={e => setDraftNote(e.target.value)}
                    className="w-full rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                    data-testid={`edit-note-${b.id}`}
                  />
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setDraftSev('major')}  className={`rounded px-2 py-0.5 ${draftSev === 'major'  ? 'bg-red-700' : 'bg-zinc-800'}`}>Major</button>
                    <button onClick={() => setDraftSev('normal')} className={`rounded px-2 py-0.5 ${draftSev === 'normal' ? 'bg-amber-700' : 'bg-zinc-800'}`}>Normal</button>
                    <button onClick={() => saveEdit(b.id)} data-testid={`save-${b.id}`} className="ml-auto rounded bg-blue-700 px-2 py-0.5">Save</button>
                    <button onClick={() => setEditingId(null)} className="rounded bg-zinc-800 px-2 py-0.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-0.5 truncate text-sm text-zinc-200">{b.note}</div>
                  <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                    <button onClick={() => startEdit(b)} data-testid={`edit-${b.id}`} className="hover:text-zinc-300">edit</button>
                    <button onClick={() => del(b.id)} data-testid={`delete-${b.id}`} className="hover:text-red-400">delete</button>
                    <button onClick={() => exportClip(b.id)} data-testid={`export-${b.id}`} className="hover:text-blue-400">export clip</button>
                  </div>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 15.3: BugList test**

Create `apps/desktop/src/__tests__/BugList.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugList } from '@/components/BugList'
import type { Bug, DesktopApi } from '@shared/types'

const bug = (over: Partial<Bug> = {}): Bug => ({
  id: 'b1', sessionId: 's1', offsetMs: 5000, severity: 'normal', note: 'note',
  screenshotRel: null, logcatRel: null, createdAt: 0, ...over,
})

function fakeApi(): DesktopApi {
  return {
    doctor: vi.fn() as any, device: {} as any, session: {} as any,
    bug: {
      update:     vi.fn().mockResolvedValue(undefined),
      delete:     vi.fn().mockResolvedValue(undefined),
      exportClip: vi.fn().mockResolvedValue('/path/out.mp4'),
    } as any,
    onBugMarkRequested: () => () => {},
  }
}

describe('BugList', () => {
  it('clicking a row triggers onSelect', () => {
    const onSelect = vi.fn()
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={onSelect} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByText('note'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('edit + save calls api.bug.update and onMutated', async () => {
    const api = fakeApi(); const onMutated = vi.fn()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={onMutated} />)
    fireEvent.click(screen.getByTestId('edit-b1'))
    fireEvent.change(screen.getByTestId('edit-note-b1'), { target: { value: 'updated' } })
    fireEvent.click(screen.getByTestId('save-b1'))
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', { note: 'updated', severity: 'normal' }))
    expect(onMutated).toHaveBeenCalled()
  })

  it('export-clip calls api.bug.exportClip', async () => {
    const api = fakeApi()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith({ sessionId: 's1', bugId: 'b1' }))
  })
})
```

- [ ] **Step 15.4: Register `loupe-file://` protocol so renderer can play local mp4**

Modify `apps/desktop/electron/main.ts` — at the top of the `app.whenReady().then(...)` callback (before `createWindow`), insert:

```typescript
import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
// …
protocol.handle('loupe-file', (req) => {
  const url = new URL(req.url)
  const localPath = decodeURIComponent(url.pathname.replace(/^\//, ''))
  // localPath is an absolute filesystem path like "C:/Users/..."
  return net.fetch(pathToFileURL(localPath).toString())
})
```

And register the privilege at the very top of the file (before `app.whenReady()`):
```typescript
protocol.registerSchemesAsPrivileged([
  { scheme: 'loupe-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])
```

Helper for the renderer URL — add to `apps/desktop/src/lib/api.ts`:
```typescript
export function localFileUrl(absolutePath: string): string {
  // Encode windows backslashes and turn drive letter into URL host-less path.
  const normalised = absolutePath.replace(/\\/g, '/')
  return `loupe-file:///${encodeURI(normalised)}`
}
```

- [ ] **Step 15.5: Draft route**

Replace `apps/desktop/src/routes/Draft.tsx`:
```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, Session } from '@shared/types'
import { api, localFileUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { VideoPlayer, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { BugList } from '@/components/BugList'

interface Loaded { session: Session; bugs: Bug[]; videoPath: string }

export function Draft({ sessionId }: { sessionId: string }) {
  const goHome = useApp(s => s.goHome)
  const [data, setData] = useState<Loaded | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const playerRef = useRef<VideoPlayerHandle>(null)

  const refresh = useCallback(async () => {
    const r = await api.session.get(sessionId)
    if (!r) { goHome(); return }
    // Resolve absolute video path: <userData>/qa-tool/sessions/<id>/video.mp4
    // We expose this from main as session.videoUrl in a future iteration; for Phase 1 we know the layout.
    // Cleaner approach: add a tiny IPC `session:resolveVideoPath` — but we keep symmetry by computing here:
    // (This works because main wires `paths` to the same default root.)
    const videoPath = await (window as any).api._resolveVideoPath?.(sessionId)
      // see Step 15.6 for the IPC seam.
    setData({ session: r.session, bugs: r.bugs, videoPath })
  }, [sessionId, goHome])

  useEffect(() => { refresh() }, [refresh])

  if (!data) return <div className="p-8 text-zinc-300">Loading…</div>
  const { session, bugs, videoPath } = data
  const dur = session.durationMs ?? 0

  function selectBug(b: Bug) {
    setSelectedBugId(b.id)
    playerRef.current?.seekToMs(Math.max(0, b.offsetMs - 5_000))
  }

  async function discard() {
    if (!confirm('Discard this session and all its bugs? This cannot be undone.')) return
    await api.session.discard(session.id)
    goHome()
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_420px] grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="col-span-2 flex items-center justify-between border-b border-zinc-800 p-3 text-sm">
        <div>
          <button onClick={goHome} className="text-zinc-400 hover:text-zinc-200">← Home</button>
          <span className="ml-4 font-medium">{session.deviceModel} · build {session.buildVersion}</span>
          <span className="ml-3 text-zinc-500">{bugs.length} bugs · {Math.round(dur/1000)}s</span>
        </div>
        <button onClick={discard} className="rounded bg-zinc-800 px-3 py-1 text-xs text-red-300 hover:bg-zinc-700">Discard session</button>
      </header>

      <main className="overflow-auto p-4">
        <VideoPlayer
          ref={playerRef}
          src={localFileUrl(videoPath)}
          bugs={bugs}
          durationMs={dur}
          selectedBugId={selectedBugId}
          onMarkerClick={selectBug}
        />
      </main>

      <aside className="overflow-auto border-l border-zinc-800">
        <BugList
          api={api}
          sessionId={session.id}
          bugs={bugs}
          selectedBugId={selectedBugId}
          onSelect={selectBug}
          onMutated={refresh}
        />
      </aside>
    </div>
  )
}
```

- [ ] **Step 15.6: Add `session:resolveVideoPath` IPC seam**

The Draft view needs to play a local `mp4`; the renderer can't compute the absolute filesystem path, so add a tiny helper.

Edit `apps/desktop/electron/ipc.ts` — add channel + handler:
```typescript
// In the CHANNEL object:
sessionResolveVideoPath: 'session:resolveVideoPath',
```
```typescript
// In registerIpc():
ipcMain.handle(CHANNEL.sessionResolveVideoPath, async (_e, id: string) => deps.paths.videoFile(id))
```

Edit `apps/desktop/electron/preload.ts` — extend `api`:
```typescript
// Inside the `const api: DesktopApi = { … }` object — but DesktopApi doesn't declare _resolveVideoPath.
// Add it to DesktopApi in shared/types.ts:
//
//     /** Phase-1 internal helper: returns absolute filesystem path of a session's video.mp4 */
//     _resolveVideoPath(sessionId: string): Promise<string>
//
// Then in preload:
_resolveVideoPath: (id) => ipcRenderer.invoke(CHANNEL.sessionResolveVideoPath, id),
```

Edit `apps/desktop/shared/types.ts` — add to `DesktopApi`:
```typescript
/** Returns the absolute filesystem path of <sessionId>/video.mp4. Used by the renderer to construct a loupe-file:// URL. */
_resolveVideoPath(sessionId: string): Promise<string>
```

- [ ] **Step 15.7: Run tests**

```bash
pnpm --filter desktop test BugList
```
Expected: PASS (3 tests).

- [ ] **Step 15.8: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): draft view with video player, bug timeline, and clip export"
```

---

## Task 16: Manual integration test on a real Android device

This is the verification step that covers what unit tests can't: the actual subprocess interplay, scrcpy window behaviour, F8 hotkey, and the end-to-end UX.

**Pre-requisites (one-time):**
- `adb` and `scrcpy` on PATH (see Pre-flight section above).
- An Android device with USB debugging enabled, connected via USB.

- [ ] **Step 16.1: Run the app**

```bash
pnpm desktop:dev
```
Expected: Home view; sidebar lists your USB device under its serial; no yellow "missing tools" banner.

- [ ] **Step 16.2: Start a session**

1. Click the device row.
2. Enter build version `0.0.1-test`.
3. Click **Start session**.

Expected:
- A separate **scrcpy window** opens showing the phone's screen.
- The Loupe window switches to the Recording view with a running timer.

- [ ] **Step 16.3: Mark 3 bugs**

While interacting with the phone (in the scrcpy window):
1. Press **F8** → bug dialog appears in Loupe window.
2. Pick severity, type a note, press Enter. Dialog closes within ~1 second.
3. Repeat 2 more times at different timestamps.

Expected: bug counter increments to 3.

- [ ] **Step 16.4: Stop session**

Click **Stop session**.

Expected:
- scrcpy window closes cleanly.
- Loupe transitions to Draft view.
- Video plays from t=0 with 3 coloured markers on the timeline strip.

- [ ] **Step 16.5: Bug interactions**

1. Click a marker → video seeks to ~5s before the bug.
2. Click a bug row in the right panel → same.
3. Click "edit" on a bug, change the note, save → list reflects the change.
4. Click "delete" on a bug → it disappears from list and timeline.
5. Click "export clip" → save dialog appears; pick Desktop; confirm. A `bug-….mp4` file should appear and play correctly in any media player.

- [ ] **Step 16.6: Restart and check persistence**

1. Close the Loupe window.
2. Re-run `pnpm desktop:dev`.
3. (For Phase 1 we have not yet built a sessions list page; verify persistence by inspecting `%APPDATA%/Loupe/qa-tool/meta.sqlite` with a SQLite browser, or temporarily add a button that calls `await api.session.list()` from DevTools.)

- [ ] **Step 16.7: Discard session**

In the Draft view, click **Discard session** → confirm.

Expected: returns to Home; the session directory under `%APPDATA%/Loupe/qa-tool/sessions/` is gone; the SQLite row is gone.

- [ ] **Step 16.8: Fix any issues found, then commit**

If any step above failed, treat it as a bug, write a regression test in the relevant `__tests__` file, fix the code, and commit.

```bash
git status
git add -A
git commit -m "fix(desktop): address issues found during manual integration test"
```

---

## Self-review checklist (run after writing this plan)

- **Spec coverage** (limited to Phase 1 = §3.1 minus deferred bullets):
  - §3.1.1 4 statuses → reduced to `recording` + `draft` (cloud statuses skipped) ✅ Task 8 schema
  - §3.1.2 USB + Wi-Fi (manual IP) ✅ Tasks 4, 13
  - §3.1.3 Build version + recent 5 + connection mode + device + test note ✅ Task 13
  - §3.1.4 scrcpy mirror, F8, severity Major/Normal, note ≤200 chars, screenshot, logcat 30s ✅ Tasks 5, 9, 10, 11, 14
  - §3.1.5 Draft review: list bugs, preview clip, edit/delete bug, delete session ✅ Task 15
  - §3.1.6 Commit → **deferred** (Phase 2). ✅ Documented in plan header.
  - §3.1.7 Local storage layout ✅ Task 7
  - **User addition (export clip)** ✅ Task 6 + Task 12 + Task 15 (`bug.exportClip`)
- **Placeholder scan**: no "TBD/TODO/implement later" — all step bodies contain runnable content. ✅
- **Type consistency**: `Session`, `Bug`, `Device`, `BugSeverity`, `DesktopApi` defined in Task 4 + 8 + 12 and used identically downstream. ✅
- **Phase boundaries**: `commit`, OAuth, cloud upload, Wi-Fi pairing wizard, latency indicator, sessions-list page (UI for cross-session browse) are intentionally out. ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-qa-platform-desktop-client.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Recommended here because the plan has 16 tasks; one session would balloon.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review. Good if you want to watch each step land but expect to need ~2-3 hours of session time.

**Which approach?**
