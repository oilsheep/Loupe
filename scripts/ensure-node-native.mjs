import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { createRequire } from 'node:module'

const packageName = process.argv[2]
if (!packageName) {
  console.error('Usage: node scripts/ensure-node-native.mjs <package-name>')
  process.exit(2)
}

const requireFromCwd = createRequire(join(process.cwd(), 'package.json'))

function findRepoRoot(startDir) {
  let dir = startDir
  const root = parse(dir).root
  while (dir !== root) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  return startDir
}

function pnpmStoreDir(repoRoot) {
  const modulesYaml = join(repoRoot, 'node_modules', '.modules.yaml')
  if (!existsSync(modulesYaml)) return null
  const match = readFileSync(modulesYaml, 'utf8').match(/^storeDir:\s*(.+)$/m)
  return match?.[1]?.trim() || null
}

function requireNative() {
  try {
    const mod = requireFromCwd(packageName)
    if (packageName === 'better-sqlite3') {
      const db = new mod(':memory:')
      db.close()
    }
    return null
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

const firstError = requireNative()
if (!firstError) process.exit(0)

const message = firstError.message
const looksLikeAbiMismatch = message.includes('NODE_MODULE_VERSION') || message.includes('was compiled against a different Node.js version')
if (!looksLikeAbiMismatch) {
  throw firstError
}

const repoRoot = findRepoRoot(process.cwd())
const storeDir = pnpmStoreDir(repoRoot)
const args = [...(storeDir ? ['--store-dir', storeDir] : []), 'rebuild', packageName]

console.warn(`${packageName} native module ABI is stale for Node ${process.version}; rebuilding once before tests...`)
execFileSync('pnpm', args, { cwd: process.cwd(), stdio: 'inherit' })

const secondError = requireNative()
if (secondError) throw secondError
