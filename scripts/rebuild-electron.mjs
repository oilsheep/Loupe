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

const child = spawn('pnpm', [...pnpmStoreArgs(), '--filter', 'desktop', 'rebuild', 'better-sqlite3'], {
  stdio: 'inherit',
  env,
  shell: true,
})
child.on('exit', (code) => process.exit(code ?? 1))
