import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IProcessRunner } from '../process-runner'
import { normalizeTranscriptJson, type TranscriptSegment } from './transcript'

export interface SpeechEngine {
  id: 'whisper-cpp' | 'faster-whisper'
  isAvailable(): Promise<boolean>
  transcribe(inputWav: string, outputBase: string, opts?: { language?: string; signal?: AbortSignal }): Promise<{ transcriptPath: string; segments: TranscriptSegment[] }>
}

function localResourceCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  return [
    process.cwd(),
    join(process.cwd(), 'apps', 'desktop'),
    join(here, '..', '..', '..'),
    join(here, '..', '..', '..', '..', 'apps', 'desktop'),
  ]
}

function resourceRoot(): string {
  const resources = process.resourcesPath
  if (resources && existsSync(join(resources, 'vendor'))) return resources
  const local = localResourceCandidates().find(candidate => existsSync(join(candidate, 'vendor', 'whisper')))
  return local ?? process.cwd()
}

function platformKey(): string {
  if (process.platform === 'win32') return 'win-x64'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64'
  if (process.platform === 'darwin') return 'darwin-x64'
  return `${process.platform}-${process.arch}`
}

function binaryName(): string {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
}

export function resolveWhisperBinary(): string {
  const configured = process.env.LOUPE_WHISPER_CPP?.trim()
  if (configured && existsSync(configured)) return configured
  const root = resourceRoot()
  const candidates = [
    join(root, 'vendor', 'whisper', platformKey(), binaryName()),
    join(root, 'vendor', 'whisper', platformKey(), process.platform === 'win32' ? 'main.exe' : 'main'),
  ]
  const found = candidates.find(existsSync)
  if (!found) throw new Error(`whisper.cpp binary not found for ${platformKey()}. Put ${binaryName()} under vendor/whisper/${platformKey()}.`)
  if (process.platform !== 'win32') {
    try { chmodSync(found, 0o755) } catch {}
  }
  return found
}

export function resolveWhisperModel(configuredPath?: string): string {
  const configured = configuredPath?.trim()
  if (configured && existsSync(configured)) return configured
  const bundled = join(resourceRoot(), 'vendor', 'whisper', 'models', 'ggml-small.bin')
  if (existsSync(bundled)) return bundled
  throw new Error('Whisper model not found. Choose a model in Preferences or add vendor/whisper/models/ggml-small.bin.')
}

export class WhisperCppEngine implements SpeechEngine {
  readonly id = 'whisper-cpp' as const

  constructor(private runner: IProcessRunner, private modelPath: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      resolveWhisperBinary()
      resolveWhisperModel(this.modelPath)
      return true
    } catch {
      return false
    }
  }

  async transcribe(inputWav: string, outputBase: string, opts: { language?: string; signal?: AbortSignal } = {}): Promise<{ transcriptPath: string; segments: TranscriptSegment[] }> {
    const binary = resolveWhisperBinary()
    const model = resolveWhisperModel(this.modelPath)
    const transcriptPath = `${outputBase}.json`
    const args = ['-m', model, '-f', inputWav, '-ojf', '-of', outputBase]
    const language = opts.language?.trim() || 'auto'
    args.push('-l', language)
    let result = await this.runner.run(binary, args, opts.signal ? { signal: opts.signal } : undefined)
    if (result.code !== 0) {
      const fallbackArgs = ['-m', model, '-f', inputWav, '--output-json-full', '--output-file', outputBase]
      fallbackArgs.push('--language', language)
      result = await this.runner.run(binary, fallbackArgs, opts.signal ? { signal: opts.signal } : undefined)
    }
    if (result.code !== 0) throw new Error(`whisper.cpp failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`)
    if (!existsSync(transcriptPath)) throw new Error(`whisper.cpp did not create transcript JSON: ${transcriptPath}`)
    const parsed = JSON.parse(readFileSync(transcriptPath, 'utf8'))
    return { transcriptPath, segments: normalizeTranscriptJson(parsed) }
  }
}
