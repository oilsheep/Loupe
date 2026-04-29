import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import type { SpawnOptions } from 'node:child_process'

const TOOL_NAMES = new Set(['adb', 'scrcpy'])

function exeName(cmd: string): string {
  return process.platform === 'win32' ? `${cmd}.exe` : cmd
}

function candidateDirs(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    process.env.LOUPE_TOOLS_DIR,
    resourcesPath ? join(resourcesPath, 'vendor', 'scrcpy') : null,
    join(process.cwd(), 'vendor', 'scrcpy'),
    join(process.cwd(), 'apps', 'desktop', 'vendor', 'scrcpy'),
  ].filter(Boolean) as string[]
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
      PATH: `${dir}${delimiter}${opts.env?.PATH ?? process.env.PATH ?? ''}`,
    },
  }
}
