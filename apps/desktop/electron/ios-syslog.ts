import { writeFileSync } from 'node:fs'
import type { IProcessRunner, RunResult, SpawnedProcess } from './process-runner'

export interface IosSyslogOptions {
  windowMs?: number
  nowFn?: () => number
  tunnelStartDelayMs?: number
}

export interface IosSyslogStartOptions {
  bundleId?: string
  appName?: string
  launchApp?: boolean
  textFilter?: string
  minLevel?: string
}

interface Entry { t: number; line: string }
interface SyslogProvider { name: 'go-ios' | 'pymobiledevice3'; cmd: string; args: string[] }
const IOS_LEVEL_ORDER: Record<string, number> = { V: 0, D: 1, DEBUG: 1, I: 2, INFO: 2, NOTICE: 2, W: 3, WARN: 3, WARNING: 3, E: 4, ERROR: 4, F: 5, FAULT: 5 }

export class IosSyslogBuffer {
  private process?: SpawnedProcess
  private tunnelProcess?: SpawnedProcess
  private dataListeners: Array<{ stream: NodeJS.EventEmitter; listener: (chunk: Buffer) => void }> = []
  private entries: Entry[] = []
  private partial = ''
  private windowMs: number
  private now: () => number
  private tunnelStartDelayMs: number
  private filters: Required<Pick<IosSyslogStartOptions, 'bundleId' | 'appName' | 'textFilter' | 'minLevel'>> = { bundleId: '', appName: '', textFilter: '', minLevel: 'V' }

  constructor(private runner: IProcessRunner, opts: IosSyslogOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000
    this.now = opts.nowFn ?? Date.now
    this.tunnelStartDelayMs = opts.tunnelStartDelayMs ?? 2500
  }

  async start(options: IosSyslogStartOptions = {}): Promise<boolean> {
    if (this.process) return true
    const provider = await this.resolveProvider()
    const bundleId = options.bundleId?.trim() ?? ''
    this.filters = {
      bundleId,
      appName: options.appName?.trim() ?? '',
      textFilter: options.textFilter?.trim() ?? '',
      minLevel: options.minLevel?.trim() || 'V',
    }
    if (provider.name === 'go-ios' && bundleId && options.launchApp !== false) {
      const message = await this.launchGoIosApp(bundleId)
      this.entries.push({ t: this.now(), line: `Loupe: launched iOS app ${bundleId}${message ? `: ${message}` : ''}` })
    }
    const proc = this.runner.spawn(provider.cmd, provider.args)
    this.process = proc
    this.entries.push({ t: this.now(), line: `Loupe: iOS syslog provider started: ${provider.name}` })
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
    if (this.tunnelProcess) {
      try { this.tunnelProcess.kill('SIGTERM') } catch {}
      this.tunnelProcess = undefined
    }
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

  private async resolveProvider(): Promise<SyslogProvider> {
    const goIosCheck = await this.runner.run('ios', ['--version']).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    if (goIosCheck.code === 0) {
      return { name: 'go-ios', cmd: 'ios', args: ['syslog', '--parse'] }
    }

    const pyCheck = await this.runner.run('pymobiledevice3', ['-h']).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    if (pyCheck.code === 0) {
      return { name: 'pymobiledevice3', cmd: 'pymobiledevice3', args: ['syslog', 'live', '--label'] }
    }

    throw new Error([
      `go-ios unavailable: ${(goIosCheck.stderr || goIosCheck.stdout || `exit ${goIosCheck.code}`).trim()}`,
      `pymobiledevice3 unavailable: ${(pyCheck.stderr || pyCheck.stdout || `exit ${pyCheck.code}`).trim()}`,
    ].join('\n'))
  }

  private async launchGoIosApp(bundleId: string): Promise<string> {
    let { result, message } = await this.launchGoIosAppWithRecovery(bundleId)

    if (result.code !== 0 && this.needsTunnel(message)) {
      this.startGoIosTunnel()
      await this.delay(this.tunnelStartDelayMs)
      ;({ result, message } = await this.launchGoIosAppWithRecovery(bundleId))
    }

    if (result.code !== 0 && this.needsDeveloperImage(message)) {
      this.entries.push({ t: this.now(), line: `Loupe: mounting iOS Developer Image before launching ${bundleId}` })
      const image = await this.runner.run('ios', ['image', 'auto']).catch(err => ({
        code: -1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      }))
      const imageMessage = this.summarizeCommandOutput(image.stderr || image.stdout || `exit ${image.code}`)
      if (image.code !== 0) {
        const error = `failed to mount iOS Developer Image: ${imageMessage}`
        this.entries.push({ t: this.now(), line: `Loupe: ${error}` })
        throw new Error(error)
      }
      this.entries.push({ t: this.now(), line: `Loupe: mounted iOS Developer Image${imageMessage ? `: ${imageMessage}` : ''}` })
      ;({ result, message } = await this.launchGoIosAppWithRecovery(bundleId))
      if (result.code !== 0 && this.needsTunnel(message)) {
        this.startGoIosTunnel()
        await this.delay(this.tunnelStartDelayMs)
        ;({ result, message } = await this.launchGoIosAppWithRecovery(bundleId))
      }
    }

    if (result.code !== 0) {
      const hint = this.needsDeveloperImage(message)
        ? ' Mount the Developer Image first, for example: ios image auto'
        : /tunnel|rsd/i.test(message)
          ? ' Start the go-ios tunnel first, for example: ios tunnel start --userspace'
          : /InvalidService|DVTSecureSocketProxy|processcontrol/i.test(message)
            ? ' Try running: ios tunnel start --userspace, then ios image auto'
          : ''
      const error = `failed to launch iOS app ${bundleId}: ${message}${hint}`
      this.entries.push({ t: this.now(), line: `Loupe: ${error}` })
      throw new Error(error)
    }
    return message
  }

  private async launchGoIosAppWithRecovery(bundleId: string): Promise<{ result: RunResult; message: string }> {
    let result = await this.runGoIosLaunch(bundleId)
    let message = this.summarizeCommandOutput(result.stderr || result.stdout || `exit ${result.code}`)

    if (result.code !== 0 && this.shouldRetryAfterKilling(message)) {
      this.entries.push({ t: this.now(), line: `Loupe: stopping existing iOS app before retrying launch for ${bundleId}` })
      await this.killGoIosApp(bundleId)
      await this.delay(2500)
      result = await this.runGoIosLaunch(bundleId)
      message = this.summarizeCommandOutput(result.stderr || result.stdout || `exit ${result.code}`)
    }

    return { result, message }
  }

  private async runGoIosLaunch(bundleId: string): Promise<RunResult> {
    return this.runner.run('ios', ['launch', bundleId]).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
  }

  private startGoIosTunnel(): void {
    if (this.tunnelProcess) return
    this.entries.push({ t: this.now(), line: 'Loupe: starting go-ios userspace tunnel' })
    try {
      this.tunnelProcess = this.runner.spawn('ios', ['tunnel', 'start', '--userspace'])
      this.attach(this.tunnelProcess.stdout)
      this.attach(this.tunnelProcess.stderr)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.entries.push({ t: this.now(), line: `Loupe: failed to start go-ios tunnel: ${message}` })
    }
  }

  private async killGoIosApp(bundleId: string): Promise<void> {
    const result = await this.runner.run('ios', ['kill', bundleId]).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    const message = this.summarizeCommandOutput(result.stderr || result.stdout || `exit ${result.code}`)
    this.entries.push({ t: this.now(), line: result.code === 0 ? `Loupe: killed iOS app ${bundleId}${message ? `: ${message}` : ''}` : `Loupe: could not kill iOS app ${bundleId}; retrying launch anyway: ${message}` })
  }

  private needsDeveloperImage(message: string): boolean {
    return /Developer Image|DVTSecureSocketProxy|InvalidService|instruments/i.test(message)
  }

  private needsTunnel(message: string): boolean {
    return /failed to get tunnel|go-ios agent is not running|tunnel|rsd|DVTSecureSocketProxy|InvalidService|processcontrol/i.test(message)
  }

  private shouldRetryAfterKilling(message: string): boolean {
    return /already running|already exists|failed starting process|Timed out waiting for response/i.test(message)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private summarizeCommandOutput(text: string): string {
    return text
      .split(/\r?\n/)
      .map(line => this.summarizeOutputLine(line.trim()))
      .filter(Boolean)
      .slice(-3)
      .join(' ')
  }

  private summarizeOutputLine(line: string): string {
    if (!line) return ''
    try {
      const parsed = JSON.parse(line) as { msg?: unknown; err?: unknown; level?: unknown }
      return [parsed.level, parsed.msg, parsed.err].filter(Boolean).join(': ')
    } catch {
      return line
    }
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
      if (this.shouldKeepLine(line)) this.entries.push({ t, line })
    }
    this.gc(t)
  }

  private shouldKeepLine(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) return false
    const { bundleId, appName, textFilter, minLevel } = this.filters
    const comparable = this.comparableLogText(trimmed)
    const lower = comparable.toLowerCase()
    if (bundleId) {
      const bundleLower = bundleId.toLowerCase()
      const processHint = this.normalizedProcessCandidate(bundleLower.split('.').filter(Boolean).at(-1) ?? bundleLower)
      const appNameHint = this.normalizedProcessCandidate(appName)
      const processName = this.normalizedProcessCandidate(this.extractProcessName(trimmed) ?? this.extractProcessName(comparable) ?? '')
      const hasExactBundle = lower.includes(bundleLower)
      const hasAppNameHint = appNameHint.length >= 3 && processName === appNameHint
      const hasProcessHint = processHint.length >= 4 && processName === processHint
      if (!hasExactBundle && !hasAppNameHint && !hasProcessHint) return false
    }
    if (textFilter && !lower.includes(textFilter.toLowerCase())) return false
    const minOrder = IOS_LEVEL_ORDER[minLevel.toUpperCase()] ?? 0
    const lineOrder = this.lineLevelOrder(trimmed)
    if (lineOrder !== null && lineOrder < minOrder) return false
    return true
  }

  private comparableLogText(line: string): string {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') {
        const msg = (parsed as Record<string, unknown>).msg
        if (typeof msg === 'string' && msg.trim()) return msg
      }
    } catch {}
    return line
  }

  private normalizedProcessCandidate(value: string): string {
    return value.toLowerCase().replace(/[\s._-]+/g, '')
  }

  private extractProcessName(line: string): string | null {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') {
        const process = (parsed as Record<string, unknown>).process
        if (typeof process === 'string' && process.trim()) return process.trim()
      }
    } catch {}
    const match = line.match(/^\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\S+\s+([^\s([]+)(?:\([^)]*\))?\[\d+\]\s+<[^>]+>:/)
    return match?.[1] ?? null
  }

  private lineLevelOrder(line: string): number | null {
    const jsonLevel = this.extractJsonLevel(line)
    const raw = jsonLevel ?? line.match(/<\s*([A-Z_]+)\s*>/)?.[1] ?? line.match(/\b(DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|FAULT)\b/i)?.[1]
    if (!raw) return null
    return IOS_LEVEL_ORDER[raw.toUpperCase()] ?? null
  }

  private extractJsonLevel(line: string): string | null {
    try {
      const parsed = JSON.parse(line)
      return this.findLevel(parsed)
    } catch {
      return null
    }
  }

  private findLevel(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findLevel(item)
        if (found) return found
      }
      return null
    }
    for (const [key, v] of Object.entries(value)) {
      if (/level|severity|type/i.test(key) && typeof v === 'string') return v
      const found = this.findLevel(v)
      if (found) return found
    }
    return null
  }

  private gc(now: number): void {
    const cutoff = now - this.windowMs
    if (this.entries.length === 0 || this.entries[0].t >= cutoff) return
    let i = 0
    while (i < this.entries.length && this.entries[i].t < cutoff) i++
    if (i > 0) this.entries.splice(0, i)
  }
}
