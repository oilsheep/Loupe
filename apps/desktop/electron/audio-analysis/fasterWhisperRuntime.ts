import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { managedToolsDir, platformKey } from '../tool-paths'

export const DEFAULT_FASTER_WHISPER_MODEL = 'small'
export const DEFAULT_FASTER_WHISPER_MODEL_REPO = 'Systran/faster-whisper-small'

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

export function managedFasterWhisperModelDir(model = DEFAULT_FASTER_WHISPER_MODEL): string {
  return join(managedToolsDir(), 'faster-whisper', 'models', model)
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

function looksLikeFasterWhisperModel(dir: string): boolean {
  if (!existsSync(dir)) return false
  const required = ['config.json', 'model.bin', 'tokenizer.json']
  if (required.every(file => existsSync(join(dir, file)))) return true
  try {
    const entries = new Set(readdirSync(dir))
    return entries.has('config.json') && (entries.has('model.bin') || entries.has('pytorch_model.bin'))
  } catch {
    return false
  }
}

export function bundledFasterWhisperModelDir(model = DEFAULT_FASTER_WHISPER_MODEL): string | null {
  const rels = [
    join('vendor', 'faster-whisper', 'models', model),
    join('vendor', 'faster-whisper', platformKey(), 'models', model),
  ]
  for (const root of resourceRootCandidates()) {
    for (const rel of rels) {
      const candidate = join(root, rel)
      if (looksLikeFasterWhisperModel(candidate)) return candidate
    }
  }
  return null
}

export function resolveFasterWhisperModelPath(configuredModel: string): string {
  const trimmed = configuredModel.trim()
  if (trimmed && trimmed !== DEFAULT_FASTER_WHISPER_MODEL) return trimmed
  const bundled = bundledFasterWhisperModelDir(DEFAULT_FASTER_WHISPER_MODEL)
  if (bundled) return bundled
  const managed = managedFasterWhisperModelDir(DEFAULT_FASTER_WHISPER_MODEL)
  if (looksLikeFasterWhisperModel(managed)) return managed
  return trimmed || DEFAULT_FASTER_WHISPER_MODEL
}

export function hasFasterWhisperModel(configuredModel = DEFAULT_FASTER_WHISPER_MODEL): { ok: boolean; path?: string } {
  const resolved = resolveFasterWhisperModelPath(configuredModel)
  if (resolved !== configuredModel || resolved.includes('/') || resolved.includes('\\')) {
    return looksLikeFasterWhisperModel(resolved) ? { ok: true, path: resolved } : { ok: false, path: resolved }
  }
  return { ok: false, path: resolved }
}
