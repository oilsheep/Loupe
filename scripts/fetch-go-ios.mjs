#!/usr/bin/env node
// Fetch the go-ios npm package and extract the binary for a target platform
// into apps/desktop/vendor/go-ios/<platform>/bin/.
//
// Rayark's GitLab CI cross-builds Windows from a Linux container, so it can't
// run scripts/prepare-vendor-binaries.ps1 (PowerShell-only) and the .sh
// counterpart only prepares for the host platform. This standalone helper
// works in any Node environment and is invoked explicitly by build:win.
//
// Usage: node scripts/fetch-go-ios.mjs [--platform <key>]
//   <key> = win32-x64 | linux-x64 | darwin-arm64 | darwin-x64
//   defaults to the host's platform-arch
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, chmodSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR_DIR = join(REPO_ROOT, 'apps', 'desktop', 'vendor', 'go-ios')
const GO_IOS_VERSION = process.env.GO_IOS_VERSION || 'latest'

const args = process.argv.slice(2)
let target = `${process.platform}-${process.arch}`
const platformIdx = args.indexOf('--platform')
if (platformIdx !== -1 && args[platformIdx + 1]) target = args[platformIdx + 1]

// Map Loupe-style platform-arch keys to the substring used inside go-ios's
// `dist/` folder names (e.g. `go-ios-windows-amd64_windows_amd64/ios.exe`).
const NPM_SUBPATH = {
  'win32-x64': 'windows-amd64',
  'linux-x64': 'linux-amd64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-amd64',
  'darwin-arm64': 'darwin-arm64',
}
const subpath = NPM_SUBPATH[target]
if (!subpath) {
  console.error(`[fetch-go-ios] unsupported target platform: ${target}`)
  process.exit(2)
}

const isWin = target.startsWith('win32-')
const binaryName = isWin ? 'ios.exe' : 'ios'
const destDir = join(VENDOR_DIR, target, 'bin')
const destPath = join(destDir, binaryName)

if (existsSync(destPath)) {
  console.log(`[fetch-go-ios] already prepared: ${destPath}`)
  process.exit(0)
}

const workDir = join(tmpdir(), `loupe-go-ios-${Date.now()}`)
mkdirSync(workDir, { recursive: true })

try {
  console.log(`[fetch-go-ios] npm pack go-ios@${GO_IOS_VERSION} -> ${workDir}`)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const pack = spawnSync(npmCmd, ['pack', `go-ios@${GO_IOS_VERSION}`, '--pack-destination', workDir], {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  })
  if (pack.status !== 0) {
    console.error('[fetch-go-ios] npm pack failed')
    process.exit(1)
  }

  const tgz = readdirSync(workDir).find(f => f.endsWith('.tgz'))
  if (!tgz) {
    console.error('[fetch-go-ios] npm did not produce a tarball')
    process.exit(1)
  }
  execFileSync('tar', ['-xzf', join(workDir, tgz), '-C', workDir], { stdio: 'inherit' })

  // Walk extracted package/ tree looking for the binary whose path includes
  // the platform substring.
  const packageDir = join(workDir, 'package')
  const found = findBinary(packageDir, subpath, binaryName)
  if (!found) {
    console.error(`[fetch-go-ios] could not find ${binaryName} for ${subpath} in tarball`)
    process.exit(1)
  }

  mkdirSync(destDir, { recursive: true })
  copyFileSync(found, destPath)
  if (!isWin) chmodSync(destPath, 0o755)

  // Best-effort license copy.
  const license = findFile(packageDir, name => /^LICENSE/i.test(name), 2)
  if (license) {
    copyFileSync(license, join(VENDOR_DIR, 'LICENSE.go-ios'))
  }

  console.log(`[fetch-go-ios] ready: ${destPath}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

function findBinary(root, pathSubstring, fileName) {
  for (const entry of readdirSync(root)) {
    const p = join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) {
      const child = findBinary(p, pathSubstring, fileName)
      if (child) return child
    } else if (entry === fileName && p.includes(pathSubstring)) {
      return p
    }
  }
  return null
}

function findFile(root, predicate, maxDepth, depth = 0) {
  if (depth > maxDepth) return null
  for (const entry of readdirSync(root)) {
    const p = join(root, entry)
    const s = statSync(p)
    if (s.isFile() && predicate(entry)) return p
    if (s.isDirectory()) {
      const c = findFile(p, predicate, maxDepth, depth + 1)
      if (c) return c
    }
  }
  return null
}
