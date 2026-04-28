import { writeFileSync } from 'node:fs'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface LogcatOptions {
  windowMs?: number
  nowFn?: () => number
}

interface Entry { t: number; line: string }

export class LogcatBuffer {
  private process?: SpawnedProcess
  private entries: Entry[] = []
  private partial = ''
  private windowMs: number
  private now: () => number

  constructor(private runner: IProcessRunner, private deviceId: string, opts: LogcatOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000
    this.now = opts.nowFn ?? Date.now
  }

  start(): void {
    if (this.process) return
    const proc = this.runner.spawn('adb', ['-s', this.deviceId, 'logcat', '-v', 'threadtime'])
    proc.stdout.on('data', (chunk: Buffer) => this.consume(chunk.toString()))
    this.process = proc
  }

  stop(): void {
    if (!this.process) return
    try { this.process.kill('SIGTERM') } catch {}
    this.process = undefined
  }

  /** Returns the recent window as a single string (lines joined by \n). */
  dumpRecent(now: number = this.now()): string {
    const cutoff = now - this.windowMs
    return this.entries
      .filter(e => e.t >= cutoff)
      .map(e => e.line)
      .join('\n')
  }

  /** Convenience: dump and write to file. */
  dumpRecentToFile(filePath: string, now: number = this.now()): void {
    writeFileSync(filePath, this.dumpRecent(now), 'utf8')
  }

  /** Test-only seam — bypass spawn pipe. */
  appendLineForTest(line: string, at: number) {
    this.entries.push({ t: at, line })
    this.gc(at)
  }

  private consume(chunk: string) {
    const text = this.partial + chunk
    const lines = text.split(/\r?\n/)
    this.partial = lines.pop() ?? ''
    const t = this.now()
    for (const line of lines) {
      if (line) this.entries.push({ t, line })
    }
    this.gc(t)
  }

  private gc(now: number) {
    const cutoff = now - this.windowMs
    if (this.entries.length === 0 || this.entries[0].t >= cutoff) return
    // entries are pushed in time order, so a single splice up to first kept index works.
    let i = 0
    while (i < this.entries.length && this.entries[i].t < cutoff) i++
    if (i > 0) this.entries.splice(0, i)
  }
}
