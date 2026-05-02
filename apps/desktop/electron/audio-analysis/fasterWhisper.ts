import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { SpawnOptions } from 'node:child_process'
import type { IProcessRunner } from '../process-runner'
import { toolSearchPath } from '../tool-paths'
import { normalizeTranscriptJson, type TranscriptSegment } from './transcript'
import { resolveFasterWhisperModelPath, resolveFasterWhisperPython } from './fasterWhisperRuntime'

const SCRIPT = String.raw`
import json
import os
import sys

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    raise SystemExit("faster-whisper is not installed. Run: python -m pip install faster-whisper\n" + repr(exc))

input_wav = sys.argv[1]
output_json = sys.argv[2]
model_name = sys.argv[3] or os.environ.get("LOUPE_FASTER_WHISPER_MODEL", "small")
language = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] and sys.argv[4] != "auto" else None

preferred_device = os.environ.get("LOUPE_FASTER_WHISPER_DEVICE", "cuda")
preferred_compute = os.environ.get("LOUPE_FASTER_WHISPER_COMPUTE", "float16")
model = WhisperModel(model_name, device=preferred_device, compute_type=preferred_compute)
segments, info = model.transcribe(
    input_wav,
    language=language,
    beam_size=5,
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 500},
    word_timestamps=True,
    condition_on_previous_text=False,
)

out = {
    "engine": "faster-whisper",
    "language": getattr(info, "language", None),
    "language_probability": getattr(info, "language_probability", None),
    "segments": [],
}

for segment in segments:
    item = {
        "start": float(segment.start or 0),
        "end": float(segment.end or segment.start or 0),
        "text": (segment.text or "").strip(),
        "tokens": [],
    }
    for word in (segment.words or []):
        text = (word.word or "").strip()
        if not text:
            continue
        item["tokens"].append({
            "start": float(word.start or segment.start or 0),
            "end": float(word.end or word.start or segment.end or 0),
            "text": text,
            "probability": float(word.probability or 0),
        })
    out["segments"].append(item)

with open(output_json, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
`

export interface FasterWhisperOptions {
  language?: string
  signal?: AbortSignal
  preferCpu?: boolean
}

type WhisperAttempt = 'gpu' | 'cpu'

function attemptOptions(attempt: WhisperAttempt, signal?: AbortSignal): SpawnOptions {
  return {
    ...(signal ? { signal } : {}),
    env: {
      ...process.env,
      PATH: toolSearchPath(),
      LOUPE_FASTER_WHISPER_DEVICE: attempt === 'cpu' ? 'cpu' : 'cuda',
      LOUPE_FASTER_WHISPER_COMPUTE: attempt === 'cpu' ? 'int8' : 'float16',
    },
  }
}

function processOutput(stdout: string, stderr: string): string {
  const output = (stderr.trim() || stdout.trim() || 'no process output').replace(/\s+/g, ' ')
  return output.length > 1800 ? `${output.slice(0, 1800)}...` : output
}

function exitCodeHint(code: number): string {
  if (code === 3221226505) return ', Windows native crash 0xC0000409, usually CUDA/cuDNN/native runtime failure'
  return ''
}

export class FasterWhisperEngine {
  readonly id = 'faster-whisper' as const

  constructor(private runner: IProcessRunner, private modelPath: string) {}

  async transcribe(inputWav: string, outputBase: string, opts: FasterWhisperOptions = {}): Promise<{ transcriptPath: string; segments: TranscriptSegment[] }> {
    const transcriptPath = `${outputBase}.json`
    const scriptPath = `${outputBase}.faster-whisper.py`
    const python = resolveFasterWhisperPython()
    const model = resolveFasterWhisperModelPath(this.modelPath)
    const language = opts.language?.trim() || 'auto'
    writeFileSync(scriptPath, SCRIPT, 'utf8')

    const attempts: WhisperAttempt[] = opts.preferCpu ? ['cpu'] : ['gpu', 'cpu']
    const failures: string[] = []
    for (const attempt of attempts) {
      rmSync(transcriptPath, { force: true })
      const result = await this.runner.run(
        python,
        [scriptPath, inputWav, transcriptPath, model, language],
        attemptOptions(attempt, opts.signal),
      ).catch(err => ({
        code: -1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      }))
      if (result.code === 0 && existsSync(transcriptPath)) {
        const parsed = JSON.parse(readFileSync(transcriptPath, 'utf8'))
        return { transcriptPath, segments: normalizeTranscriptJson(parsed) }
      }
      const label = attempt === 'gpu' ? 'GPU attempt' : (attempts.length > 1 ? 'CPU fallback' : 'CPU attempt')
      const missingJson = result.code === 0 ? '; transcript JSON was not created' : ''
      failures.push(`${label} failed (code ${result.code}${exitCodeHint(result.code)}): ${processOutput(result.stdout, result.stderr)}${missingJson}`)
    }

    throw new Error(`faster-whisper failed. ${failures.join('; ')}`)
  }
}
