import { spawn, type SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import { resolveBundledTool, withToolPath } from './tool-paths'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export interface SpawnedProcess {
  readonly pid: number | undefined
  readonly stdout: Readable
  readonly stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
  onExit(handler: (code: number | null) => void): void
}

export interface IProcessRunner {
  run(cmd: string, args: string[], opts?: SpawnOptions): Promise<RunResult>
  spawn(cmd: string, args: string[], opts?: SpawnOptions): SpawnedProcess
}

export class RealProcessRunner implements IProcessRunner {
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
    const child = spawn(resolvedCmd, args, { ...withToolPath(cmd, opts), stdio: ['ignore', 'pipe', 'pipe'] })
    return {
      get pid() { return child.pid },
      stdout: child.stdout!,
      stderr: child.stderr!,
      kill: (sig?) => child.kill(sig),
      onExit: (h) => { child.once('exit', h) },
    }
  }
}
