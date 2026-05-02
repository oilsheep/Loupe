import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { doctor, installTools } from '../doctor'
import type { IProcessRunner } from '../process-runner'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { managedFasterWhisperModelDir, managedFasterWhisperPython, managedFasterWhisperVenvDir } from '../audio-analysis/fasterWhisperRuntime'

const UXPLAY_LOOKUP_CMD = process.platform === 'win32' ? 'where' : '/usr/bin/which'
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3'

function createManagedModelRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'loupe-test-tools-'))
  const modelDir = join(root, 'faster-whisper', 'models', 'small')
  mkdirSync(modelDir, { recursive: true })
  writeFileSync(join(modelDir, 'config.json'), '{}')
  writeFileSync(join(modelDir, 'model.bin'), '')
  writeFileSync(join(modelDir, 'tokenizer.json'), '{}')
  return root
}

function fakeRunner(behaviour: Record<string, { code: number; stdout?: string; stderr?: string } | Error>): IProcessRunner {
  return {
    async run(cmd) {
      const base = basename(cmd).replace(/\.exe$/i, '')
      const r = behaviour[cmd] ?? behaviour[basename(cmd)] ?? behaviour[base]
      if (r instanceof Error) throw r
      if (!r) throw new Error(`unexpected cmd: ${cmd}`)
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.code }
    },
    spawn: vi.fn() as any,
  }
}

describe('doctor', () => {
  beforeEach(() => {
    vi.stubEnv('LOUPE_DISABLE_CWD_VENDOR_TOOLS', '1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports ok when all tools present', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', createManagedModelRoot())
    const r = fakeRunner({
      adb: { code: 0, stdout: 'Android Debug Bridge version 1.0.41' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
      [UXPLAY_LOOKUP_CMD]: { code: 0, stdout: '/tmp/uxplay' },
      ios: { code: 0, stdout: '1.0.211' },
      ffmpeg: { code: 0, stdout: 'ffmpeg version 7.1' },
      [PYTHON_CMD]: { code: 0, stdout: '1.0.3' },
    })
    const checks = await doctor(r)
    expect(checks).toHaveLength(7)
    expect(checks.every(c => c.ok)).toBe(true)
    expect(checks[0].version).toContain('1.0.41')
    expect(checks[1].version).toContain('2.7')
    expect(checks[2].version).toContain('/tmp/uxplay')
    expect(checks[3].version).toContain('1.0.211')
    expect(checks[4].version).toContain('ffmpeg version 7.1')
    expect(checks[5].version).toContain('1.0.3')
    expect(checks[6].version).toContain('faster-whisper/models/small')
  })

  it('reports not ok when binary missing', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const r = fakeRunner({
      adb: new Error("ENOENT: spawn adb"),
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
      [UXPLAY_LOOKUP_CMD]: { code: 0, stdout: '/tmp/uxplay' },
      ios: { code: 0, stdout: '1.0.211' },
      ffmpeg: { code: 0, stdout: 'ffmpeg version 7.1' },
      [PYTHON_CMD]: { code: 0, stdout: '1.0.3' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('ENOENT')
    if (process.platform === 'darwin') {
      expect(checks[0].error).toContain('brew install android-platform-tools')
    }
    expect(checks[1].ok).toBe(true)
  })

  it('reports not ok when binary returns non-zero', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const r = fakeRunner({
      adb: { code: 1, stderr: 'broken' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
      [UXPLAY_LOOKUP_CMD]: { code: 0, stdout: '/tmp/uxplay' },
      ios: { code: 0, stdout: '1.0.211' },
      ffmpeg: { code: 0, stdout: 'ffmpeg version 7.1' },
      [PYTHON_CMD]: { code: 0, stdout: '1.0.3' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('broken')
  })

  it('reports when automatic installation is unsupported on this platform', async () => {
    if (process.platform === 'darwin') return
    const result = await installTools(fakeRunner({}), ['uxplay'])
    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS')
    expect(result.detail).toContain('uxplay')
  })

  it('installs faster-whisper with the cross-platform managed Python environment', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-test-tools-'))
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', root)
    const calls: Array<{ cmd: string; args: string[] }> = []
    const r: IProcessRunner = {
      async run(cmd, args = []) {
        calls.push({ cmd, args })
        return { stdout: `${cmd} ok`, stderr: '', code: 0 }
      },
      spawn: vi.fn() as any,
    }

    const result = await installTools(r, ['faster-whisper'])

    expect(result.ok).toBe(true)
    expect(result.message).toContain('finished')
    expect(calls).toEqual([
      { cmd: PYTHON_CMD, args: ['--version'] },
      { cmd: PYTHON_CMD, args: ['-m', 'venv', managedFasterWhisperVenvDir()] },
      { cmd: managedFasterWhisperPython(), args: ['-m', 'pip', 'install', '--upgrade', 'pip'] },
      { cmd: managedFasterWhisperPython(), args: ['-m', 'pip', 'install', '--upgrade', 'faster-whisper'] },
    ])
  })

  it('installs the faster-whisper model without requiring macOS-only tool installers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-test-tools-'))
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', root)
    vi.stubEnv('LOUPE_PYTHON', PYTHON_CMD)
    const calls: Array<{ cmd: string; args: string[] }> = []
    const r: IProcessRunner = {
      async run(cmd, args = []) {
        calls.push({ cmd, args })
        if (args[0] === '-c') {
          const modelDir = managedFasterWhisperModelDir('small')
          mkdirSync(modelDir, { recursive: true })
          writeFileSync(join(modelDir, 'config.json'), '{}')
          writeFileSync(join(modelDir, 'model.bin'), '')
          writeFileSync(join(modelDir, 'tokenizer.json'), '{}')
        }
        return { stdout: `${cmd} ok`, stderr: '', code: 0 }
      },
      spawn: vi.fn() as any,
    }

    const result = await installTools(r, ['faster-whisper-model'])

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({ cmd: PYTHON_CMD, args: ['-m', 'pip', 'install', '--upgrade', 'huggingface_hub'] })
    expect(calls[1].cmd).toBe(PYTHON_CMD)
    expect(calls[1].args[0]).toBe('-c')
  })

  it('reports when Homebrew is missing on macOS', async () => {
    if (process.platform !== 'darwin') return
    const result = await installTools(fakeRunner({ brew: new Error('ENOENT: spawn brew') }), ['uxplay'])
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Homebrew')
    expect(result.detail).toContain('brew.sh')
  })

  it('installs selected macOS tool packages and builds UxPlay from source', async () => {
    if (process.platform !== 'darwin') return
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-tools')
    const calls: Array<{ cmd: string; args: string[] }> = []
    const r: IProcessRunner = {
      async run(cmd, args = []) {
        calls.push({ cmd, args })
        return { stdout: `${cmd} ok`, stderr: '', code: 0 }
      },
      spawn: vi.fn() as any,
    }

    const result = await installTools(r, ['adb', 'uxplay'])

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { cmd: 'brew', args: ['--version'] },
      { cmd: 'brew', args: ['install', 'android-platform-tools'] },
      { cmd: 'brew', args: ['install', 'cmake', 'git', 'libplist', 'openssl@3', 'pkg-config', 'gstreamer'] },
      { cmd: 'git', args: expect.arrayContaining(['clone', '--depth', '1', 'https://github.com/FDH2/UxPlay.git']) },
      { cmd: 'cmake', args: expect.arrayContaining(['-DCMAKE_INSTALL_PREFIX=/tmp/loupe-test-tools']) },
      { cmd: 'cmake', args: expect.arrayContaining(['--build']) },
      { cmd: 'cmake', args: expect.arrayContaining(['--install']) },
    ])
  })

  it('streams install command console output', async () => {
    if (process.platform !== 'darwin') return
    const logs: string[] = []
    const r: IProcessRunner = {
      async run(cmd, args = []) {
        if (cmd === 'brew' && args[0] === '--version') return { stdout: 'Homebrew 5.0.0', stderr: '', code: 0 }
        throw new Error(`unexpected buffered command: ${cmd}`)
      },
      spawn(cmd, args = []) {
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        queueMicrotask(() => {
          stdout.end(`${cmd} stdout\n`)
          stderr.end(`${args.join(' ')} stderr\n`)
          exitHandler?.(0)
        })
        let exitHandler: ((code: number | null) => void) | null = null
        return {
          pid: 123,
          stdout,
          stderr,
          kill: vi.fn().mockReturnValue(true),
          onExit(handler) { exitHandler = handler },
        }
      },
    }

    const result = await installTools(r, ['adb'], { onLog: log => logs.push(log.text) })

    expect(result.ok).toBe(true)
    expect(logs.join('')).toContain('$ brew install android-platform-tools')
    expect(logs.join('')).toContain('brew stdout')
    expect(logs.join('')).toContain('install android-platform-tools stderr')
    expect(logs.join('')).toContain('exit 0')
  })
})
