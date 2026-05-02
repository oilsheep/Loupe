import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { managedToolsDir, platformKey } from '../tool-paths'

function pythonExe(): string {
  return process.platform === 'win32' ? 'python.exe' : 'python'
}

function binDir(): string {
  return process.platform === 'win32' ? 'Scripts' : 'bin'
}

function resourceRootCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    resourcesPath,
    process.cwd(),
    join(process.cwd(), 'apps', 'desktop'),
  ].filter(Boolean) as string[]
}

export function managedFasterWhisperVenvDir(): string {
  return join(managedToolsDir(), 'faster-whisper-venv')
}

export function managedFasterWhisperPython(): string {
  return join(managedFasterWhisperVenvDir(), binDir(), pythonExe())
}

export function bundledFasterWhisperPython(): string | null {
  const rels = [
    join('vendor', 'faster-whisper', platformKey(), binDir(), pythonExe()),
    join('vendor', 'faster-whisper', binDir(), pythonExe()),
  ]
  for (const root of resourceRootCandidates()) {
    for (const rel of rels) {
      const candidate = join(root, rel)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export function resolveFasterWhisperPython(): string {
  const explicit = process.env.LOUPE_PYTHON?.trim()
  if (explicit) return explicit
  const bundled = bundledFasterWhisperPython()
  if (bundled) return bundled
  const managed = managedFasterWhisperPython()
  if (existsSync(managed)) return managed
  return process.platform === 'win32' ? 'python' : 'python3'
}
