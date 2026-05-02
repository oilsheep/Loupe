import type { IProcessRunner, RunResult } from './process-runner'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnOptions } from 'node:child_process'
import { managedToolsDir, resolveBundledTool, toolSearchPath } from './tool-paths'
import { DEFAULT_FASTER_WHISPER_MODEL, DEFAULT_FASTER_WHISPER_MODEL_REPO, hasFasterWhisperModel, managedFasterWhisperModelDir, managedFasterWhisperPython, managedFasterWhisperVenvDir, resolveFasterWhisperPython } from './audio-analysis/fasterWhisperRuntime'
import { resolveBundledFfmpegPath } from './ffmpeg'

export interface ToolCheck {
  name: 'adb' | 'scrcpy' | 'uxplay' | 'go-ios' | 'ffmpeg' | 'faster-whisper' | 'faster-whisper-model'
  ok: boolean
  version?: string
  error?: string
}

const TOOLS: { name: ToolCheck['name']; cmd: string; args: string[] }[] = [
  { name: 'adb',             cmd: 'adb',             args: ['--version'] },
  { name: 'scrcpy',          cmd: 'scrcpy',          args: ['--version'] },
  { name: 'uxplay',          cmd: 'uxplay',          args: [] },
  { name: 'go-ios',          cmd: 'ios',             args: ['--version'] },
  { name: 'ffmpeg',          cmd: 'ffmpeg',          args: ['-version'] },
  { name: 'faster-whisper',  cmd: 'python',          args: [] },
  { name: 'faster-whisper-model', cmd: 'model',       args: [] },
]

const CROSS_PLATFORM_INSTALLERS = new Set<ToolCheck['name']>(['faster-whisper', 'faster-whisper-model'])

function installHint(name: ToolCheck['name']): string | null {
  if (process.platform === 'darwin') {
    if (name === 'adb') return 'Install with: brew install android-platform-tools'
    if (name === 'scrcpy') return 'Install with: brew install scrcpy'
    if (name === 'uxplay') return 'Use Loupe’s installer to build UxPlay from source, or install uxplay manually and make sure it is on PATH.'
    if (name === 'go-ios') return 'Install with: npm install -g go-ios'
    if (name === 'ffmpeg') return 'Packaged builds include FFmpeg. For development, run pnpm install again to restore @ffmpeg-installer/ffmpeg.'
    if (name === 'faster-whisper') return 'Use Loupe’s installer to create a managed faster-whisper Python environment.'
    if (name === 'faster-whisper-model') return 'Use Loupe’s installer to download the managed faster-whisper model.'
  }
  if (process.platform === 'linux') {
    if (name === 'adb') return 'Install Android Platform Tools and ensure adb is on PATH.'
    if (name === 'scrcpy') return 'Install scrcpy and ensure it is on PATH.'
    if (name === 'uxplay') return 'Install UxPlay and ensure it is on PATH.'
    if (name === 'go-ios') return 'Install go-ios and ensure the ios command is on PATH.'
    if (name === 'ffmpeg') return 'Packaged builds include FFmpeg. For development, run pnpm install again to restore @ffmpeg-installer/ffmpeg.'
    if (name === 'faster-whisper') return 'Install faster-whisper in Loupe’s managed Python environment or set LOUPE_PYTHON.'
    if (name === 'faster-whisper-model') return 'Download a faster-whisper model into Loupe’s managed tools folder.'
  }
  if (process.platform === 'win32') {
    if (name === 'adb' || name === 'scrcpy') return 'Packaged Windows builds include bundled Android tools; dev builds still require adb/scrcpy on PATH unless you point LOUPE_TOOLS_DIR at a tool folder.'
    if (name === 'uxplay') return 'Install UxPlay and make sure uxplay.exe is on PATH.'
    if (name === 'go-ios') return 'Install go-ios and make sure ios.exe is on PATH.'
    if (name === 'ffmpeg') return 'Packaged builds include FFmpeg. For development, run pnpm install again to restore @ffmpeg-installer/ffmpeg.'
    if (name === 'faster-whisper') return 'Install faster-whisper in Loupe’s managed Python environment or set LOUPE_PYTHON.'
    if (name === 'faster-whisper-model') return 'Download a faster-whisper model into Loupe’s managed tools folder.'
  }
  return null
}

function formatToolError(name: ToolCheck['name'], error: string): string {
  if (!/enoent|spawn/i.test(error)) return error
  const hint = installHint(name)
  return hint ? `${error}. ${hint}` : error
}

export async function doctor(runner: IProcessRunner): Promise<ToolCheck[]> {
  const out: ToolCheck[] = []
  for (const t of TOOLS) {
    try {
      if (t.name === 'uxplay') {
        const check = await checkUxPlayAvailable(runner)
        out.push(check)
        continue
      }
      if (t.name === 'faster-whisper') {
        const check = await checkFasterWhisperAvailable(runner)
        out.push(check)
        continue
      }
      if (t.name === 'ffmpeg') {
        const check = await checkFfmpegAvailable(runner)
        out.push(check)
        continue
      }
      if (t.name === 'faster-whisper-model') {
        out.push(checkFasterWhisperModelAvailable())
        continue
      }
      const r = await runner.run(t.cmd, t.args)
      if (r.code === 0) {
        const firstLine = ((r.stdout || r.stderr).split('\n')[0] || '').trim()
        out.push({ name: t.name, ok: true, version: firstLine })
      } else {
        out.push({ name: t.name, ok: false, error: formatToolError(t.name, (r.stderr || `exit ${r.code}`).trim()) })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.push({ name: t.name, ok: false, error: formatToolError(t.name, message) })
    }
  }
  return out
}

async function checkFfmpegAvailable(runner: IProcessRunner): Promise<ToolCheck> {
  try {
    const ffmpeg = resolveBundledFfmpegPath()
    const r = await runner.run(ffmpeg, ['-version'])
    if (r.code === 0) {
      const version = (r.stdout || r.stderr).split('\n')[0].trim()
      return { name: 'ffmpeg', ok: true, version: `${version || 'ffmpeg'} (${ffmpeg})` }
    }
    return { name: 'ffmpeg', ok: false, error: formatToolError('ffmpeg', (r.stderr || `exit ${r.code}`).trim()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { name: 'ffmpeg', ok: false, error: formatToolError('ffmpeg', message) }
  }
}

function checkFasterWhisperModelAvailable(): ToolCheck {
  const check = hasFasterWhisperModel(DEFAULT_FASTER_WHISPER_MODEL)
  if (check.ok) return { name: 'faster-whisper-model', ok: true, version: check.path }
  return {
    name: 'faster-whisper-model',
    ok: false,
    error: `Model ${DEFAULT_FASTER_WHISPER_MODEL} is not available locally. ${installHint('faster-whisper-model')}`,
  }
}

async function checkFasterWhisperAvailable(runner: IProcessRunner): Promise<ToolCheck> {
  const python = resolveFasterWhisperPython()
  try {
    const r = await runner.run(python, ['-c', 'import faster_whisper; print(getattr(faster_whisper, "__version__", "faster-whisper"))'], {
      env: { ...process.env, PATH: toolSearchPath() },
    })
    if (r.code === 0) {
      const version = (r.stdout || r.stderr).split('\n')[0].trim()
      return { name: 'faster-whisper', ok: true, version: `${version || 'faster-whisper'} (${python})` }
    }
    return { name: 'faster-whisper', ok: false, error: formatToolError('faster-whisper', (r.stderr || `exit ${r.code}`).trim()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { name: 'faster-whisper', ok: false, error: formatToolError('faster-whisper', message) }
  }
}

async function checkUxPlayAvailable(runner: IProcessRunner): Promise<ToolCheck> {
  const resolved = resolveBundledTool('uxplay')
  if (resolved !== 'uxplay' && existsSync(resolved)) return { name: 'uxplay', ok: true, version: resolved }
  const cmd = process.platform === 'win32' ? 'where' : '/usr/bin/which'
  try {
    const r = await runner.run(cmd, ['uxplay'], { env: { ...process.env, PATH: toolSearchPath() } })
    if (r.code === 0) return { name: 'uxplay', ok: true, version: (r.stdout || r.stderr).split('\n')[0].trim() }
    return { name: 'uxplay', ok: false, error: formatToolError('uxplay', (r.stderr || `exit ${r.code}`).trim()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { name: 'uxplay', ok: false, error: formatToolError('uxplay', message) }
  }
}

export interface ToolInstallResult {
  ok: boolean
  message: string
  detail: string
}

interface ToolInstallLog {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

interface ToolInstallOptions {
  onLog?: (log: ToolInstallLog) => void
}

export async function installTools(runner: IProcessRunner, names: ToolCheck['name'][], options: ToolInstallOptions = {}): Promise<ToolInstallResult> {
  const unique = [...new Set(names)]
  const emit = (text: string, stream: ToolInstallLog['stream'] = 'system') => options.onLog?.({ stream, text })
  emit(`Selected tools: ${unique.join(', ') || 'none'}\n`)
  if (unique.length === 0) {
    emit('No missing tools selected.\n')
    return { ok: true, message: 'No missing tools selected.', detail: '' }
  }

  const unsupported = process.platform === 'darwin'
    ? []
    : unique.filter(name => !CROSS_PLATFORM_INSTALLERS.has(name))
  if (unsupported.length === unique.length) {
    emit('Automatic tool installation for the selected tools is currently supported on macOS only.\n')
    return {
      ok: false,
      message: 'Automatic tool installation for the selected tools is currently supported on macOS only.',
      detail: unsupported.map(name => `${name}: ${installHint(name) ?? 'Install manually and make sure it is on PATH.'}`).join('\n'),
    }
  }

  const selected = unique.filter(name => !unsupported.includes(name))
  const detail: string[] = unsupported.map(name => `${name}: ${installHint(name) ?? 'Install manually and make sure it is on PATH.'}`)
  if (unsupported.length > 0) {
    emit(`Skipping tools that do not have a ${process.platform} installer yet: ${unsupported.join(', ')}\n`)
  }
  const brewPackages = selected.flatMap(name => {
    if (name === 'adb') return ['android-platform-tools']
    if (name === 'scrcpy') return ['scrcpy']
    return []
  })
  if (brewPackages.length > 0 || selected.includes('uxplay')) {
    emit('$ brew --version\n')
    const brewCheck = await runner.run('brew', ['--version']).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    if (brewCheck.code !== 0) {
      emit(`${brewCheck.stderr || brewCheck.stdout}\n`, 'stderr')
      return {
        ok: false,
        message: 'Homebrew is required before Loupe can install these tools.',
        detail: `Install Homebrew first: https://brew.sh\n${brewCheck.stderr || brewCheck.stdout}`,
      }
    }
  }
  if (brewPackages.length > 0) {
    const result = await brewRun(runner, ['install', ...[...new Set(brewPackages)]], options.onLog)
    detail.push(commandSummary('brew', ['install', ...[...new Set(brewPackages)]], result))
    if (result.code !== 0) return { ok: false, message: 'Tool installation failed.', detail: detail.join('\n\n') }
  }
  if (selected.includes('go-ios')) {
    const npmCheck = await runner.run('npm', ['--version']).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    if (npmCheck.code !== 0) {
      return {
        ok: false,
        message: 'npm is required before Loupe can install go-ios.',
        detail: `Install Node.js/npm first, then run the installer again.\n${npmCheck.stderr || npmCheck.stdout}`,
      }
    }
    const result = await runInstallCommand(runner, 'npm', ['install', '-g', 'go-ios'], undefined, options.onLog)
    detail.push(commandSummary('npm', ['install', '-g', 'go-ios'], result))
    if (result.code !== 0) {
      return { ok: false, message: 'go-ios installation failed.', detail: detail.join('\n\n') }
    }
  }
  if (selected.includes('uxplay')) {
    const result = await installUxPlayFromSource(runner, options)
    detail.push(result.detail)
    if (!result.ok) return { ok: false, message: result.message, detail: detail.join('\n\n') }
  }
  if (selected.includes('faster-whisper')) {
    const result = await installFasterWhisper(runner, options)
    detail.push(result.detail)
    if (!result.ok) return { ok: false, message: result.message, detail: detail.join('\n\n') }
  }
  if (selected.includes('faster-whisper-model')) {
    const result = await installFasterWhisperModel(runner, options)
    detail.push(result.detail)
    if (!result.ok) return { ok: false, message: result.message, detail: detail.join('\n\n') }
  }
  return { ok: true, message: 'Tool installation finished. Loupe will re-check availability.', detail: detail.join('\n\n') }
}

function commandSummary(cmd: string, args: string[], result: { stdout: string; stderr: string; code: number }): string {
  return [
    `$ ${[cmd, ...args].join(' ')}`,
    `exit ${result.code}`,
    result.stdout.trim(),
    result.stderr.trim(),
  ].filter(Boolean).join('\n')
}

async function installUxPlayFromSource(runner: IProcessRunner, options: ToolInstallOptions): Promise<ToolInstallResult> {
  const prefix = managedToolsDir()
  const workDir = join(tmpdir(), `loupe-uxplay-${Date.now()}`)
  const sourceDir = join(workDir, 'UxPlay')
  const buildDir = join(workDir, 'build')
  const detail: string[] = [
    `Installing UxPlay from source into ${prefix}`,
  ]

  try {
    mkdirSync(workDir, { recursive: true })
    options.onLog?.({ stream: 'system', text: `Installing UxPlay from source into ${prefix}\n` })
    const deps = await brewRun(runner, ['install', 'cmake', 'git', 'libplist', 'openssl@3', 'pkg-config', 'gstreamer'], options.onLog)
    detail.push(commandSummary('brew', ['install', 'cmake', 'git', 'libplist', 'openssl@3', 'pkg-config', 'gstreamer'], deps))
    if (deps.code !== 0) return { ok: false, message: 'UxPlay dependency installation failed.', detail: detail.join('\n\n') }

    const clone = await runInstallCommand(runner, 'git', ['clone', '--depth', '1', 'https://github.com/FDH2/UxPlay.git', sourceDir], undefined, options.onLog)
    detail.push(commandSummary('git', ['clone', '--depth', '1', 'https://github.com/FDH2/UxPlay.git', sourceDir], clone))
    if (clone.code !== 0) return { ok: false, message: 'UxPlay source download failed.', detail: detail.join('\n\n') }

    const configureArgs = ['-S', sourceDir, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release', `-DCMAKE_INSTALL_PREFIX=${prefix}`]
    const configure = await runInstallCommand(runner, 'cmake', configureArgs, undefined, options.onLog)
    detail.push(commandSummary('cmake', configureArgs, configure))
    if (configure.code !== 0) return { ok: false, message: 'UxPlay configure failed.', detail: detail.join('\n\n') }

    const build = await runInstallCommand(runner, 'cmake', ['--build', buildDir, '--parallel'], undefined, options.onLog)
    detail.push(commandSummary('cmake', ['--build', buildDir, '--parallel'], build))
    if (build.code !== 0) return { ok: false, message: 'UxPlay build failed.', detail: detail.join('\n\n') }

    const install = await runInstallCommand(runner, 'cmake', ['--install', buildDir], undefined, options.onLog)
    detail.push(commandSummary('cmake', ['--install', buildDir], install))
    if (install.code !== 0) return { ok: false, message: 'UxPlay install failed.', detail: detail.join('\n\n') }

    return { ok: true, message: 'UxPlay installed.', detail: detail.join('\n\n') }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function installFasterWhisper(runner: IProcessRunner, options: ToolInstallOptions): Promise<ToolInstallResult> {
  const venvDir = managedFasterWhisperVenvDir()
  const venvPython = managedFasterWhisperPython()
  const bootstrapPython = process.env.LOUPE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
  const detail: string[] = [`Installing faster-whisper into ${venvDir}`]

  options.onLog?.({ stream: 'system', text: `Installing faster-whisper into ${venvDir}\n` })
  const pythonCheck = await runner.run(bootstrapPython, ['--version']).catch(err => ({
    code: -1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
  }))
  detail.push(commandSummary(bootstrapPython, ['--version'], pythonCheck))
  if (pythonCheck.code !== 0) {
    return {
      ok: false,
      message: 'Python is required before Loupe can install faster-whisper.',
      detail: detail.join('\n\n'),
    }
  }

  const venv = await runInstallCommand(runner, bootstrapPython, ['-m', 'venv', venvDir], undefined, options.onLog)
  detail.push(commandSummary(bootstrapPython, ['-m', 'venv', venvDir], venv))
  if (venv.code !== 0) return { ok: false, message: 'faster-whisper environment creation failed.', detail: detail.join('\n\n') }

  const pipUpgrade = await runInstallCommand(runner, venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], undefined, options.onLog)
  detail.push(commandSummary(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], pipUpgrade))
  if (pipUpgrade.code !== 0) return { ok: false, message: 'faster-whisper pip setup failed.', detail: detail.join('\n\n') }

  const install = await runInstallCommand(runner, venvPython, ['-m', 'pip', 'install', '--upgrade', 'faster-whisper'], undefined, options.onLog)
  detail.push(commandSummary(venvPython, ['-m', 'pip', 'install', '--upgrade', 'faster-whisper'], install))
  if (install.code !== 0) return { ok: false, message: 'faster-whisper installation failed.', detail: detail.join('\n\n') }

  return { ok: true, message: 'faster-whisper installed.', detail: detail.join('\n\n') }
}

async function installFasterWhisperModel(runner: IProcessRunner, options: ToolInstallOptions): Promise<ToolInstallResult> {
  const python = resolveFasterWhisperPython()
  const targetDir = managedFasterWhisperModelDir(DEFAULT_FASTER_WHISPER_MODEL)
  const detail: string[] = [`Installing faster-whisper model ${DEFAULT_FASTER_WHISPER_MODEL_REPO} into ${targetDir}`]
  const script = [
    'from huggingface_hub import snapshot_download',
    `snapshot_download(repo_id=${JSON.stringify(DEFAULT_FASTER_WHISPER_MODEL_REPO)}, local_dir=${JSON.stringify(targetDir)}, local_dir_use_symlinks=False)`,
    `print(${JSON.stringify(targetDir)})`,
  ].join('; ')

  options.onLog?.({ stream: 'system', text: `Installing faster-whisper model ${DEFAULT_FASTER_WHISPER_MODEL_REPO} into ${targetDir}\n` })
  const hub = await runInstallCommand(runner, python, ['-m', 'pip', 'install', '--upgrade', 'huggingface_hub'], undefined, options.onLog)
  detail.push(commandSummary(python, ['-m', 'pip', 'install', '--upgrade', 'huggingface_hub'], hub))
  if (hub.code !== 0) return { ok: false, message: 'faster-whisper model downloader setup failed.', detail: detail.join('\n\n') }

  const download = await runInstallCommand(runner, python, ['-c', script], undefined, options.onLog)
  detail.push(commandSummary(python, ['-c', script], download))
  if (download.code !== 0) return { ok: false, message: 'faster-whisper model download failed.', detail: detail.join('\n\n') }

  const check = hasFasterWhisperModel(DEFAULT_FASTER_WHISPER_MODEL)
  if (!check.ok) return { ok: false, message: 'faster-whisper model download did not create a usable model.', detail: detail.join('\n\n') }
  return { ok: true, message: 'faster-whisper model installed.', detail: detail.join('\n\n') }
}

function brewRun(runner: IProcessRunner, args: string[], onLog?: ToolInstallOptions['onLog']) {
  return runInstallCommand(runner, 'brew', args, {
    env: {
      ...process.env,
      HOMEBREW_NO_AUTO_UPDATE: '1',
      HOMEBREW_NO_ENV_HINTS: '1',
    },
  }, onLog)
}

function runInstallCommand(
  runner: IProcessRunner,
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
  onLog?: ToolInstallOptions['onLog'],
): Promise<RunResult> {
  onLog?.({ stream: 'system', text: `$ ${[cmd, ...args].join(' ')}\n` })
  if (!onLog) return runner.run(cmd, args, opts)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    try {
      const child = runner.spawn(cmd, args, opts)
      child.stdout.on('data', chunk => {
        const text = chunk.toString()
        stdout += text
        onLog({ stream: 'stdout', text })
      })
      child.stderr.on('data', chunk => {
        const text = chunk.toString()
        stderr += text
        onLog({ stream: 'stderr', text })
      })
      child.onExit(code => {
        if (settled) return
        settled = true
        const exitCode = code ?? -1
        onLog({ stream: 'system', text: `exit ${exitCode}\n` })
        resolve({ stdout, stderr, code: exitCode })
      })
    } catch (err) {
      if (settled) return
      settled = true
      reject(err)
    }
  })
}
