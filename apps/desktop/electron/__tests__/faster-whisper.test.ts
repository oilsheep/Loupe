import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnOptions } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { FasterWhisperEngine } from '../audio-analysis/fasterWhisper'
import type { IProcessRunner, RunResult, SpawnedProcess } from '../process-runner'

class FakeRunner implements IProcessRunner {
  readonly calls: Array<{ cmd: string; args: string[]; opts?: SpawnOptions }> = []

  constructor(private readonly results: RunResult[]) {}

  async run(cmd: string, args: string[], opts?: SpawnOptions): Promise<RunResult> {
    this.calls.push({ cmd, args, opts })
    const result = this.results.shift()
    if (!result) throw new Error('unexpected process run')
    if (result.code === 0) {
      writeFileSync(args[2], JSON.stringify({
        engine: 'faster-whisper',
        segments: [{ start: 1, end: 2, text: 'record Bug', tokens: [] }],
      }), 'utf8')
    }
    return result
  }

  spawn(): SpawnedProcess {
    throw new Error('not implemented')
  }
}

function outputBase(name: string): string {
  const dir = join(tmpdir(), `loupe-fw-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

describe('FasterWhisperEngine', () => {
  it('retries on CPU when the GPU process exits with a Windows native crash', async () => {
    const runner = new FakeRunner([
      { code: 3221226505, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ])
    const engine = new FasterWhisperEngine(runner, 'small')

    const result = await engine.transcribe('input.wav', outputBase('transcript'))

    expect(result.segments).toHaveLength(1)
    expect(runner.calls).toHaveLength(2)
    expect(runner.calls[0].opts?.env).toMatchObject({
      LOUPE_FASTER_WHISPER_DEVICE: 'cuda',
      LOUPE_FASTER_WHISPER_COMPUTE: 'float16',
    })
    expect(runner.calls[1].opts?.env).toMatchObject({
      LOUPE_FASTER_WHISPER_DEVICE: 'cpu',
      LOUPE_FASTER_WHISPER_COMPUTE: 'int8',
    })
  })

  it('reports both GPU crash and CPU fallback output when both attempts fail', async () => {
    const runner = new FakeRunner([
      { code: 3221226505, stdout: '', stderr: '' },
      { code: 1, stdout: '', stderr: 'missing model' },
    ])
    const engine = new FasterWhisperEngine(runner, 'small')

    await expect(engine.transcribe('input.wav', outputBase('transcript'))).rejects.toThrow(
      /GPU attempt failed \(code 3221226505, Windows native crash 0xC0000409.*CPU fallback failed \(code 1\): missing model/,
    )
  })
})
