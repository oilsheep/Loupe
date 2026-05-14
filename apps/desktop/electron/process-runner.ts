import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import type { Writable } from 'node:stream'
import { resolveBundledTool, withToolPath } from './tool-paths'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export interface SpawnedProcess {
  readonly pid: number | undefined
  readonly stdin?: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
  onExit(handler: (code: number | null, signal?: NodeJS.Signals | null) => void): void
}

export interface IProcessRunner {
  run(cmd: string, args: string[], opts?: SpawnOptions): Promise<RunResult>
  spawn(cmd: string, args: string[], opts?: SpawnOptions): SpawnedProcess
}

export class RealProcessRunner implements IProcessRunner {
  private readonly tracked = new Set<ChildProcess>()

  run(cmd: string, args: string[], opts: SpawnOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const resolvedCmd = resolveBundledTool(cmd)
      const child = spawn(resolvedCmd, args, { ...withToolPath(cmd, opts), stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let settled = false
      child.stdout?.on('data', (d) => { stdout += d.toString() })
      child.stderr?.on('data', (d) => { stderr += d.toString() })
      child.once('error', (e) => { if (!settled) { settled = true; reject(e) } })
      // 'close' (not 'exit') so stdio buffers are fully flushed before we resolve.
      child.once('close', (code) => { if (!settled) { settled = true; resolve({ stdout, stderr, code: code ?? -1 }) } })
    })
  }

  spawn(cmd: string, args: string[], opts: SpawnOptions = {}): SpawnedProcess {
    const resolvedCmd = resolveBundledTool(cmd)
    const child = spawn(resolvedCmd, args, { ...withToolPath(cmd, opts), stdio: ['pipe', 'pipe', 'pipe'] })
    this.tracked.add(child)
    child.once('exit', () => { this.tracked.delete(child) })
    return {
      get pid() { return child.pid },
      stdin: child.stdin!,
      stdout: child.stdout!,
      stderr: child.stderr!,
      kill: (sig?) => child.kill(sig),
      onExit: (h) => { child.once('exit', h) },
    }
  }

  /**
   * Tree-kill every live spawned child. Called on app quit so vendored
   * binaries (scrcpy.exe, ffmpeg.exe, …) don't keep file handles inside the
   * install dir — that's what blocks NSIS `RMDir /r $INSTDIR` on the next
   * install and surfaces the "Loupe QA Recorder cannot be closed" prompt.
   *
   * `adb.exe` daemons are NOT spawned through this runner (they're forked
   * implicitly by every adb command) and won't be tracked here — call
   * `adb kill-server` separately.
   */
  async killAllTracked(timeoutMs = 2000): Promise<void> {
    const survivors = [...this.tracked]
    if (survivors.length === 0) return
    await Promise.all(survivors.map(child => killTree(child, timeoutMs)))
  }
}

function killTree(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  if (process.platform === 'win32' && child.pid !== undefined) {
    // /T kills descendants too — scrcpy.exe forks adb in particular.
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
  } else {
    try { child.kill('SIGKILL') } catch { /* already dead */ }
  }
  return Promise.race([
    exited,
    new Promise<void>(resolve => { setTimeout(resolve, timeoutMs).unref?.() }),
  ])
}
