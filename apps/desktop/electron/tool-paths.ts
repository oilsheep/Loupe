import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import type { SpawnOptions } from 'node:child_process'

const TOOL_NAMES = new Set(['adb', 'scrcpy', 'uxplay', 'ios', 'pymobiledevice3', 'brew', 'git', 'cmake', 'npm', 'pipx'])

function exeName(cmd: string): string {
  return process.platform === 'win32' ? `${cmd}.exe` : cmd
}

export function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

function candidateDirs(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    process.env.LOUPE_TOOLS_DIR,
    join(managedToolsDir(), 'bin'),
    join(managedToolsDir(), 'uxplay', platformKey(), 'bin'),
    join(managedToolsDir(), 'uxplay', 'bin'),
    resourcesPath ? join(resourcesPath, 'vendor', 'uxplay', platformKey(), 'bin') : null,
    resourcesPath ? join(resourcesPath, 'vendor', 'uxplay', 'bin') : null,
    resourcesPath ? join(resourcesPath, 'vendor', 'scrcpy') : null,
    join(process.cwd(), 'vendor', 'uxplay', platformKey(), 'bin'),
    join(process.cwd(), 'vendor', 'uxplay', 'bin'),
    join(process.cwd(), 'apps', 'desktop', 'vendor', 'uxplay', platformKey(), 'bin'),
    join(process.cwd(), 'apps', 'desktop', 'vendor', 'uxplay', 'bin'),
    join(process.cwd(), 'vendor', 'scrcpy'),
    join(process.cwd(), 'apps', 'desktop', 'vendor', 'scrcpy'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homedir(), '.local', 'bin'),
  ].filter(Boolean) as string[]
}

export function managedToolsDir(): string {
  return process.env.LOUPE_MANAGED_TOOLS_DIR || join(homedir(), '.loupe', 'tools')
}

export function toolSearchPath(existingPath = process.env.PATH ?? ''): string {
  return [...candidateDirs(), existingPath].filter(Boolean).join(delimiter)
}

export function resolveBundledTool(cmd: string): string {
  if (!TOOL_NAMES.has(cmd)) return cmd
  const exe = exeName(cmd)
  for (const dir of candidateDirs()) {
    const candidate = join(dir, exe)
    if (existsSync(candidate)) return candidate
  }
  return cmd
}

export function withToolPath(cmd: string, opts: SpawnOptions = {}): SpawnOptions {
  const resolved = resolveBundledTool(cmd)
  if (resolved === cmd) return opts
  const dir = dirname(resolved)
  return {
    ...opts,
    cwd: opts.cwd ?? dir,
    env: {
      ...process.env,
      ...opts.env,
      PATH: `${dir}${delimiter}${toolSearchPath(opts.env?.PATH ?? process.env.PATH ?? '')}`,
    },
  }
}
