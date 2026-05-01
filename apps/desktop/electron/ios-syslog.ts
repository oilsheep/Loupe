import { writeFileSync } from 'node:fs'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface IosSyslogOptions {
  windowMs?: number
  nowFn?: () => number
}

interface Entry { t: number; line: string }

export class IosSyslogBuffer {
  private process?: SpawnedProcess
  private dataListeners: Array<{ stream: NodeJS.EventEmitter; listener: (chunk: Buffer) => void }> = []
  private entries: Entry[] = []
  private partial = ''
  private windowMs: number
  private now: () => number

  constructor(private runner: IProcessRunner, opts: IosSyslogOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000
    this.now = opts.nowFn ?? Date.now
  }

  async start(): Promise<boolean> {
    if (this.process) return true
    const check = await this.runner.run('pymobiledevice3', ['-h'])
    if (check.code !== 0) throw new Error((check.stderr || check.stdout || `pymobiledevice3 exited ${check.code}`).trim())
    const proc = this.runner.spawn('pymobiledevice3', ['syslog', 'live'])
    this.process = proc
    this.attach(proc.stdout)
    this.attach(proc.stderr)
    return true
  }

  stop(): void {
    if (!this.process) return
    for (const { stream, listener } of this.dataListeners) {
      try { stream.off('data', listener) } catch {}
    }
    this.dataListeners = []
    try { this.process.kill('SIGTERM') } catch {}
    this.process = undefined
  }

  dumpRecentLines(maxLines: number, now: number = this.now()): string {
    const cutoff = now - this.windowMs
    return this.entries
      .filter(e => e.t >= cutoff)
      .slice(-Math.max(1, maxLines))
      .map(e => e.line)
      .join('\n')
  }

  dumpRecentLinesToFile(filePath: string, maxLines: number, now: number = this.now()): void {
    writeFileSync(filePath, this.dumpRecentLines(maxLines, now), 'utf8')
  }

  appendLineForTest(line: string, at: number): void {
    this.entries.push({ t: at, line })
    this.gc(at)
  }

  private attach(stream: NodeJS.EventEmitter): void {
    const listener = (chunk: Buffer) => this.consume(chunk.toString())
    stream.on('data', listener)
    this.dataListeners.push({ stream, listener })
  }

  private consume(chunk: string): void {
    const text = this.partial + chunk
    const lines = text.split(/\r?\n/)
    this.partial = lines.pop() ?? ''
    const t = this.now()
    for (const line of lines) {
      if (line.trim()) this.entries.push({ t, line })
    }
    this.gc(t)
  }

  private gc(now: number): void {
    const cutoff = now - this.windowMs
    if (this.entries.length === 0 || this.entries[0].t >= cutoff) return
    let i = 0
    while (i < this.entries.length && this.entries[i].t < cutoff) i++
    if (i > 0) this.entries.splice(0, i)
  }
}
