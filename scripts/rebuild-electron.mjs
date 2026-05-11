#!/usr/bin/env node
// Force-rebuild native deps (better-sqlite3) against Electron's Node ABI.
// `electron-builder install-app-deps` is unreliable here — when a prebuilt binary
// exists for system Node it skips the rebuild silently. Setting the npm_config_*
// env vars makes node-gyp compile from source for the right target.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const desktopPkg = JSON.parse(readFileSync(join(here, '..', 'apps', 'desktop', 'package.json'), 'utf8'))
const electronVersion = (desktopPkg.devDependencies?.electron ?? '').replace(/^[\^~]/, '')
if (!electronVersion) {
  console.error('Could not read electron version from apps/desktop/package.json')
  process.exit(1)
}

console.log(`[rebuild-electron] target electron@${electronVersion}, building from source...`)

const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_build_from_source: 'true',
}

function pnpmStoreArgs() {
  const modulesYaml = join(repoRoot, 'node_modules', '.modules.yaml')
  if (!existsSync(modulesYaml)) return []
  const match = readFileSync(modulesYaml, 'utf8').match(/^storeDir:\s*(.+)$/m)
  return match?.[1]?.trim() ? ['--store-dir', match[1].trim()] : []
}

function pnpmInvocation(args) {
  // npm_execpath usually points to a Node-executable JS file we can pass to
  // `node`. Some Windows pnpm installs (e.g. pnpm-setup-action's newer
  // single-binary layout) make it pnpm.exe instead — `node pnpm.exe` then
  // crashes with "SyntaxError: Invalid or unexpected token" on the PE header.
  // Use the Node-via-script path only when npm_execpath really is a script.
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath && /pnpm/i.test(npmExecPath) && /\.c?js$/i.test(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args], shell: false }
  }
  // shell:true on Windows lets PATHEXT resolve to either pnpm.cmd (npm-style
  // shim) or pnpm.exe (single-binary distribution) without us hard-coding one.
  return {
    command: 'pnpm',
    args,
    shell: process.platform === 'win32',
  }
}

const pnpm = pnpmInvocation([...pnpmStoreArgs(), '--filter', 'desktop', 'rebuild', 'better-sqlite3'])
const child = spawn(pnpm.command, pnpm.args, {
  stdio: 'inherit',
  env,
  shell: pnpm.shell,
})
child.on('exit', (code) => process.exit(code ?? 1))
