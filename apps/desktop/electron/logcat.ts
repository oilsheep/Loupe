import { writeFileSync } from 'node:fs'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface LogcatOptions {
  windowMs?: number
  nowFn?: () => number
  packageName?: string
  tagFilter?: string
  minPriority?: string
  pidRefreshMs?: number
}

interface Entry { t: number; line: string }
const THREADTIME_PID_RE = /^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+/
const THREADTIME_RE = /^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+\d+\s+([VDIWEFA])\s+(.+?)\s*:/
const PRIORITY_ORDER: Record<string, number> = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, A: 5 }

export class LogcatBuffer {
  private process?: SpawnedProcess
  private dataListener?: (chunk: Buffer) => void
  private entries: Entry[] = []
  private partial = ''
  private windowMs: number
  private now: () => number
  private packageName: string | null
  private tagFilter: string | null
  private minPriority: string
  private packagePids = new Set<string>()
  private pidRefreshMs: number
  private pidTimer?: ReturnType<typeof setInterval>

  constructor(private runner: IProcessRunner, private deviceId: string, opts: LogcatOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000
    this.now = opts.nowFn ?? Date.now
    this.packageName = opts.packageName?.trim() || null
    this.tagFilter = opts.tagFilter?.trim() || null
    this.minPriority = sanitizePriority(opts.minPriority)
    this.pidRefreshMs = opts.pidRefreshMs ?? 2_000
  }

  start(): void {
    if (this.process) return
    const proc = this.runner.spawn('adb', ['-s', this.deviceId, 'logcat', '-v', 'threadtime'])
    const listener = (chunk: Buffer) => this.consume(chunk.toString())
    proc.stdout.on('data', listener)
    this.process = proc
    this.dataListener = listener
    if (this.packageName) {
      void this.refreshPackagePids()
      this.pidTimer = setInterval(() => { void this.refreshPackagePids() }, this.pidRefreshMs)
    }
  }

  stop(): void {
    if (!this.process) return
    if (this.pidTimer) {
      clearInterval(this.pidTimer)
      this.pidTimer = undefined
    }
    if (this.dataListener) {
      try { this.process.stdout.off('data', this.dataListener) } catch {}
      this.dataListener = undefined
    }
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

  dumpRecentLines(maxLines: number, now: number = this.now()): string {
    const cutoff = now - this.windowMs
    return this.entries
      .filter(e => e.t >= cutoff)
      .slice(-Math.max(1, maxLines))
      .map(e => e.line)
      .join('\n')
  }

  /** Convenience: dump and write to file. */
  dumpRecentToFile(filePath: string, now: number = this.now()): void {
    writeFileSync(filePath, this.dumpRecent(now), 'utf8')
  }

  dumpRecentLinesToFile(filePath: string, maxLines: number, now: number = this.now()): void {
    writeFileSync(filePath, this.dumpRecentLines(maxLines, now), 'utf8')
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
      if (line && this.shouldKeepLine(line)) this.entries.push({ t, line })
    }
    this.gc(t)
  }

  private shouldKeepLine(line: string): boolean {
    const parsed = parseThreadtimeLine(line)
    if (this.packageName) {
      if (this.packagePids.size === 0) return false
      const pid = parsed?.pid ?? line.match(THREADTIME_PID_RE)?.[1]
      if (!pid || !this.packagePids.has(pid)) return false
    }
    if (this.tagFilter || this.minPriority !== 'V') {
      if (!parsed) return false
      if (this.tagFilter && parsed.tag !== this.tagFilter) return false
      if (PRIORITY_ORDER[parsed.priority] < PRIORITY_ORDER[this.minPriority]) return false
    }
    return true
  }

  private async refreshPackagePids(): Promise<void> {
    if (!this.packageName) return
    try {
      const result = await this.runner.run('adb', ['-s', this.deviceId, 'shell', 'pidof', this.packageName])
      if (result.code !== 0) return
      const next = new Set(result.stdout.trim().split(/\s+/).filter(Boolean))
      this.packagePids = next
    } catch {
      // Keep the previous pid set. Logcat should not fail just because pidof is briefly unavailable.
    }
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

function sanitizePriority(value: string | undefined): string {
  const priority = value?.trim().toUpperCase()
  return priority && PRIORITY_ORDER[priority] !== undefined ? priority : 'V'
}

function parseThreadtimeLine(line: string): { pid: string; priority: string; tag: string } | null {
  const match = line.match(THREADTIME_RE)
  if (!match) return null
  return { pid: match[1], priority: match[2], tag: match[3].trim() }
}
