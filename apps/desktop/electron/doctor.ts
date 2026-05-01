import type { IProcessRunner, RunResult } from './process-runner'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnOptions } from 'node:child_process'
import { managedToolsDir, resolveBundledTool, toolSearchPath } from './tool-paths'

export interface ToolCheck {
  name: 'adb' | 'scrcpy' | 'uxplay' | 'pymobiledevice3'
  ok: boolean
  version?: string
  error?: string
}

const TOOLS: { name: ToolCheck['name']; cmd: string; args: string[] }[] = [
  { name: 'adb',             cmd: 'adb',             args: ['--version'] },
  { name: 'scrcpy',          cmd: 'scrcpy',          args: ['--version'] },
  { name: 'uxplay',          cmd: 'uxplay',          args: [] },
  { name: 'pymobiledevice3', cmd: 'pymobiledevice3', args: ['-h'] },
]

function installHint(name: ToolCheck['name']): string | null {
  if (process.platform === 'darwin') {
    if (name === 'adb') return 'Install with: brew install android-platform-tools'
    if (name === 'scrcpy') return 'Install with: brew install scrcpy'
    if (name === 'uxplay') return 'Use Loupe’s installer to build UxPlay from source, or install uxplay manually and make sure it is on PATH.'
    return 'Install with: brew install pipx && pipx install pymobiledevice3'
  }
  if (process.platform === 'linux') {
    if (name === 'adb') return 'Install Android Platform Tools and ensure adb is on PATH.'
    if (name === 'scrcpy') return 'Install scrcpy and ensure it is on PATH.'
    if (name === 'uxplay') return 'Install UxPlay and ensure it is on PATH.'
    return 'Install pymobiledevice3 and ensure it is on PATH.'
  }
  if (process.platform === 'win32') {
    if (name === 'adb' || name === 'scrcpy') return 'Packaged Windows builds include bundled Android tools; dev builds still require adb/scrcpy on PATH unless you point LOUPE_TOOLS_DIR at a tool folder.'
    if (name === 'uxplay') return 'Install UxPlay and make sure uxplay.exe is on PATH.'
    return 'Install pymobiledevice3 and make sure it is on PATH.'
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
  if (process.platform !== 'darwin') {
    emit('Automatic tool installation is currently supported on macOS only.\n')
    return {
      ok: false,
      message: 'Automatic tool installation is currently supported on macOS only.',
      detail: unique.map(name => `${name}: ${installHint(name) ?? 'Install manually and make sure it is on PATH.'}`).join('\n'),
    }
  }
  if (unique.length === 0) {
    emit('No missing tools selected.\n')
    return { ok: true, message: 'No missing tools selected.', detail: '' }
  }

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
      message: 'Homebrew is required before Loupe can install tools.',
      detail: `Install Homebrew first: https://brew.sh\n${brewCheck.stderr || brewCheck.stdout}`,
    }
  }

  const detail: string[] = []
  const brewPackages = unique.flatMap(name => {
    if (name === 'adb') return ['android-platform-tools']
    if (name === 'scrcpy') return ['scrcpy']
    if (name === 'pymobiledevice3') return ['pipx']
    return []
  })
  if (brewPackages.length > 0) {
    const result = await brewRun(runner, ['install', ...[...new Set(brewPackages)]], options.onLog)
    detail.push(commandSummary('brew', ['install', ...[...new Set(brewPackages)]], result))
    if (result.code !== 0) return { ok: false, message: 'Tool installation failed.', detail: detail.join('\n\n') }
  }
  if (unique.includes('pymobiledevice3')) {
    const result = await runInstallCommand(runner, 'pipx', ['install', 'pymobiledevice3'], undefined, options.onLog)
    detail.push(commandSummary('pipx', ['install', 'pymobiledevice3'], result))
    if (result.code !== 0 && !/already seems to be installed|already installed/i.test(`${result.stdout}\n${result.stderr}`)) {
      return { ok: false, message: 'pymobiledevice3 installation failed.', detail: detail.join('\n\n') }
    }
  }
  if (unique.includes('uxplay')) {
    const result = await installUxPlayFromSource(runner, options)
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
