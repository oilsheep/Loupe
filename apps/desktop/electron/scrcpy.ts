import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface ScrcpyOptions {
  deviceId: string
  recordPath: string
  windowTitle?: string
  onUnexpectedExit?: (code: number | null) => void
}

const GRACEFUL_STOP_TIMEOUT_MS = 20_000

export class Scrcpy {
  private process?: SpawnedProcess
  private startTime?: number
  private stopping = false
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
      '--stay-awake',
      // Compression tuned for QA review — file size matters more than cinematic quality.
      '--max-fps=30',           // QA bug repro doesn't need 60fps
      '--video-bit-rate=4M',    // half of scrcpy's 8M default; still very legible
      '--max-size=1280',        // cap longest dimension at 720p-class
      // Audio: forward + record so QA can hear sound bugs (music, voice, SFX).
      // Requires Android 11+; on older devices scrcpy auto-falls back to video-only.
      '--audio-codec=aac',      // AAC plays in any MP4 player + HTML5 <video>
      '--audio-bit-rate=64K',   // half of scrcpy's 128K default; speech-quality
      // Show finger-tap circles on the device (and therefore in the recording).
      // Sets Android's "Show taps" developer option for the duration of the session.
      '--show-touches',
    ]
    this.process = this.runner.spawn('scrcpy', args)
    const proc = this.process
    this.stopping = false
    proc.onExit((code) => {
      if (this.process !== proc) return
      this.process = undefined
      this.startTime = undefined
      if (!this.stopping) opts.onUnexpectedExit?.(code)
    })
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
    this.stopping = true
    return new Promise<void>((resolve) => {
      const hardKill = setTimeout(() => { this.forceKill(proc).catch(() => {}) }, GRACEFUL_STOP_TIMEOUT_MS).unref()
      proc.onExit(() => {
        clearTimeout(hardKill)
        this.startTime = undefined
        this.stopping = false
        resolve()
      })
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
