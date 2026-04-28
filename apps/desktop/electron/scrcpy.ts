import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface ScrcpyOptions {
  deviceId: string
  recordPath: string
  windowTitle?: string
}

export class Scrcpy {
  private process?: SpawnedProcess
  private startTime?: number
  private platform: NodeJS.Platform

  constructor(private runner: IProcessRunner, platform?: NodeJS.Platform) {
    this.platform = platform ?? process.platform
  }

  start(opts: ScrcpyOptions): void {
    if (this.process) throw new Error('scrcpy already running')
    const args = [
      '-s', opts.deviceId,
      '--record', opts.recordPath,
      '--window-title', opts.windowTitle ?? 'Loupe Mirror',
      // helpful defaults for QA workflow:
      '--stay-awake',
      '--no-audio',
      '--max-fps=60',
    ]
    this.process = this.runner.spawn('scrcpy', args)
    // performance.now() is monotonic; immune to NTP slew / clock changes during a session.
    this.startTime = performance.now()
  }

  /** ms since start(), or null if not running. */
  elapsedMs(): number | null {
    return this.startTime !== undefined ? performance.now() - this.startTime : null
  }

  isRunning(): boolean {
    return !!this.process
  }

  /** Graceful stop: triggers scrcpy's clean shutdown so it flushes the mp4 moov atom. */
  async stop(): Promise<void> {
    if (!this.process) return
    const proc = this.process
    this.process = undefined
    return new Promise<void>((resolve) => {
      const hardKill = setTimeout(() => { this.forceKill(proc).catch(() => {}) }, 5000).unref()
      proc.onExit(() => { clearTimeout(hardKill); resolve() })
      this.gracefulKill(proc).catch(() => { /* already dead */ })
    })
  }

  private async gracefulKill(proc: SpawnedProcess): Promise<void> {
    // Why platform-specific:
    //   On POSIX, proc.kill('SIGINT') triggers scrcpy's signal handler which closes
    //   the mp4 cleanly (writes moov atom).
    //   On Windows, Node's proc.kill('SIGINT') maps to TerminateProcess — abrupt kill,
    //   so scrcpy never gets to finalise the mp4 (results in "moov atom not found").
    //   `taskkill` without /F sends WM_CLOSE to scrcpy's mirror window; scrcpy handles
    //   that as a normal shutdown.
    if (this.platform === 'win32' && proc.pid !== undefined) {
      await this.runner.run('taskkill', ['/PID', String(proc.pid)])
    } else {
      proc.kill('SIGINT')
    }
  }

  private async forceKill(proc: SpawnedProcess): Promise<void> {
    if (this.platform === 'win32' && proc.pid !== undefined) {
      await this.runner.run('taskkill', ['/PID', String(proc.pid), '/T', '/F'])
    } else {
      proc.kill('SIGKILL')
    }
  }
}
