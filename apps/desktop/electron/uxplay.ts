import type { IProcessRunner, SpawnedProcess } from './process-runner'
import { existsSync } from 'node:fs'
import { resolveBundledTool, toolSearchPath } from './tool-paths'

export interface UxPlayReceiverStatus {
  running: boolean
  receiverName: string
  message?: string
  messageKey?: 'device.uxPlayAlreadyRunning' | 'device.uxPlayRunningHint' | 'device.uxPlayStopped'
}

export class UxPlayReceiver {
  private process?: SpawnedProcess
  private lastMessage = ''

  constructor(private runner: IProcessRunner, private receiverName = 'Loupe iOS') {}

  async start(): Promise<UxPlayReceiverStatus> {
    if (this.process) return this.status('UxPlay receiver is already running.', 'device.uxPlayAlreadyRunning')
    const availability = await this.checkAvailability()
    if (!availability.ok) return this.status(formatUxPlayUnavailable(availability.reason))

    const args = ['-n', this.receiverName, '-nh', '-p', '7100', '-vsync', 'no']
    let proc: SpawnedProcess
    try {
      proc = this.runner.spawn('uxplay', args)
    } catch (err) {
      return this.status(formatUxPlayUnavailable(err instanceof Error ? err.message : String(err)))
    }

    this.process = proc
    this.lastMessage = ''
    const append = (chunk: Buffer) => {
      this.lastMessage = `${this.lastMessage}${chunk.toString()}`.slice(-4000)
    }
    proc.stdout.on('data', append)
    proc.stderr.on('data', append)
    proc.onExit(() => {
      if (this.process === proc) this.process = undefined
    })
    return this.status(`UxPlay receiver "${this.receiverName}" is running. If it does not appear on iPhone, make sure both devices are on the same network and macOS Firewall allows incoming connections for uxplay.`, 'device.uxPlayRunningHint')
  }

  private async checkAvailability(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const resolved = resolveBundledTool('uxplay')
    if (resolved !== 'uxplay' && existsSync(resolved)) return { ok: true }
    const cmd = process.platform === 'win32' ? 'where' : '/usr/bin/which'
    const check = await this.runner.run(cmd, ['uxplay'], {
      env: { ...process.env, PATH: toolSearchPath() },
    }).catch(err => ({
      code: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    if (check.code === 0) return { ok: true }
    return { ok: false, reason: (check.stderr || check.stdout || 'uxplay was not found on PATH').trim() }
  }

  stop(): UxPlayReceiverStatus {
    if (this.process) {
      try { this.process.kill('SIGTERM') } catch {}
      this.process = undefined
    }
    return this.status('UxPlay receiver stopped.', 'device.uxPlayStopped')
  }

  status(message = this.lastMessage.trim(), messageKey?: UxPlayReceiverStatus['messageKey']): UxPlayReceiverStatus {
    return {
      running: Boolean(this.process),
      receiverName: this.receiverName,
      ...(message ? { message } : {}),
      ...(messageKey ? { messageKey } : {}),
    }
  }
}

function formatUxPlayUnavailable(reason: string): string {
  const hint = process.platform === 'darwin'
    ? 'Use Loupe’s tool installer to build UxPlay from source, or install uxplay manually and make sure it is on PATH.'
    : process.platform === 'win32'
      ? 'Install UxPlay and make sure uxplay.exe is on PATH.'
      : 'Install UxPlay and make sure uxplay is on PATH.'
  return `UxPlay is not available: ${reason}. ${hint}`
}
