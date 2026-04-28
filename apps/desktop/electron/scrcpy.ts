import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface ScrcpyOptions {
  deviceId: string
  recordPath: string
  windowTitle?: string
}

export class Scrcpy {
  private process?: SpawnedProcess
  private startTime?: number

  constructor(private runner: IProcessRunner) {}

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
    this.startTime = Date.now()
  }

  /** ms since start(), or null if not running. */
  elapsedMs(): number | null {
    return this.startTime !== undefined ? Date.now() - this.startTime : null
  }

  isRunning(): boolean {
    return !!this.process
  }

  /** Sends SIGINT (clean stop, finalises mp4 moov atom), then resolves on exit. */
  async stop(): Promise<void> {
    if (!this.process) return
    const proc = this.process
    this.process = undefined
    return new Promise<void>((resolve) => {
      proc.onExit(() => resolve())
      try { proc.kill('SIGINT') } catch { /* already dead */ }
      // Safety: hard-kill after 5s in case scrcpy is hung.
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 5000).unref()
    })
  }
}
