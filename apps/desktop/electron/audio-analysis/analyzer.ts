import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AudioAnalysisProgress, AudioAnalysisResult, Bug, SeveritySettings } from '@shared/types'
import type { Paths } from '../paths'
import type { IProcessRunner } from '../process-runner'
import type { SessionManager } from '../session'
import { resolveBundledFfmpegPath } from '../ffmpeg'
import { transcriptToMarkerSuggestions } from './classifier'
import { FasterWhisperEngine } from './fasterWhisper'
import { WhisperCppEngine } from './whisperCpp'

export interface AudioAnalyzerDeps {
  paths: Paths
  runner: IProcessRunner
  manager: SessionManager
  settings: {
    get(): {
      audioAnalysis: {
        enabled: boolean
        engine: 'whisper-cpp' | 'faster-whisper'
        modelPath: string
        language: string
        triggerKeywords: string
        showTriggerWords: boolean
      }
      severities: SeveritySettings
    }
  }
}

function analysisDir(paths: Paths, sessionId: string): string {
  return join(paths.sessionDir(sessionId), 'analysis')
}

function emit(progress: (progress: AudioAnalysisProgress) => void, sessionId: string, patch: Omit<AudioAnalysisProgress, 'sessionId'>): void {
  progress({ sessionId, ...patch })
}

function isAudioAutoMarker(bug: Bug): boolean {
  return bug.source === 'audio-auto'
}

function clampOffset(offsetMs: number, durationMs: number | null): number {
  const max = Math.max(0, durationMs ?? offsetMs)
  return Math.max(0, Math.min(max, Math.round(offsetMs)))
}

export class AudioAnalyzer {
  constructor(private deps: AudioAnalyzerDeps) {}

  async analyzeSession(sessionId: string, onProgress: (progress: AudioAnalysisProgress) => void, signal?: AbortSignal): Promise<AudioAnalysisResult> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new Error('Audio analysis cancelled')
    }
    const appSettings = this.deps.settings.get()
    const settings = appSettings.audioAnalysis
    if (!settings.enabled) throw new Error('Audio analysis is disabled in Preferences.')
    const session = this.deps.manager.getSession(sessionId)
    if (!session) throw new Error('session not found')
    if (!session.micAudioPath || !existsSync(session.micAudioPath)) throw new Error('QA microphone recording was not found for this session.')

    const dir = analysisDir(this.deps.paths, sessionId)
    mkdirSync(dir, { recursive: true })
    const wavPath = join(dir, 'session-mic-16k.wav')
    const outputBase = join(dir, 'audio-transcript')
    const total = 4

    emit(onProgress, sessionId, {
      phase: 'prepare',
      message: 'Preparing microphone audio',
      detail: 'Converting session mic recording to 16k mono WAV.',
      current: 0,
      total,
      generated: 0,
    })
    throwIfAborted()
    const ffmpeg = resolveBundledFfmpegPath()
    const converted = await this.deps.runner.run(ffmpeg, [
      '-y',
      '-i', session.micAudioPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      wavPath,
    ], signal ? { signal } : undefined)
    throwIfAborted()
    if (converted.code !== 0) throw new Error(`ffmpeg failed while preparing mic audio: ${converted.stderr.trim()}`)

    emit(onProgress, sessionId, {
      phase: 'transcribe',
      message: 'Transcribing microphone audio',
      detail: settings.engine === 'faster-whisper'
        ? 'Running faster-whisper with word timestamps. GPU is attempted first; if the native GPU runtime crashes, Loupe retries CPU automatically.'
        : 'Running offline whisper.cpp.',
      current: 1,
      total,
      generated: 0,
    })
    throwIfAborted()
    const engine = settings.engine === 'whisper-cpp'
      ? new WhisperCppEngine(this.deps.runner, settings.modelPath)
      : new FasterWhisperEngine(this.deps.runner, settings.modelPath)
    const transcript = await engine.transcribe(wavPath, outputBase, { language: settings.language, signal })
    throwIfAborted()
    writeFileSync(join(dir, 'audio-transcript.raw-normalized.json'), `${JSON.stringify(transcript.segments, null, 2)}\n`, 'utf8')
    writeFileSync(join(dir, 'audio-transcript.normalized.json'), `${JSON.stringify(transcript.segments, null, 2)}\n`, 'utf8')

    emit(onProgress, sessionId, {
      phase: 'detect',
      message: 'Detecting marker candidates',
      detail: `${transcript.segments.length} transcript segment(s) found.`,
      current: 2,
      total,
      generated: 0,
    })
    throwIfAborted()
    const suggestions = transcriptToMarkerSuggestions(transcript.segments, {
      severities: appSettings.severities,
      triggerKeywords: settings.triggerKeywords,
    })
    let bugs = this.deps.manager.listBugs(sessionId)
    const existingAutoCount = bugs.filter(isAudioAutoMarker).length
    let generated = 0
    const merged = 0

    emit(onProgress, sessionId, {
      phase: 'save',
      message: 'Saving generated markers',
      detail: existingAutoCount > 0
        ? `Replacing ${existingAutoCount} audio-generated marker(s). Manual markers are kept.`
        : `${suggestions.length} candidate marker(s). Manual markers are kept.`,
      current: 3,
      total,
      generated,
    })

    throwIfAborted()
    const removedAutoMarkers = this.deps.manager.deleteAutoAudioMarkers(sessionId)
    bugs = this.deps.manager.listBugs(sessionId)
    const micStartOffsetMs = Math.max(0, session.micAudioStartOffsetMs ?? 0)
    for (const suggestion of suggestions) {
      throwIfAborted()
      const offsetMs = clampOffset(suggestion.offsetMs + micStartOffsetMs, session.durationMs)
      const bug = this.deps.manager.addMarker({
        sessionId,
        offsetMs,
        severity: suggestion.severity,
        note: suggestion.note,
        source: 'audio-auto',
        preSec: suggestion.preSec,
        postSec: suggestion.postSec,
      })
      bugs = [...bugs, bug].sort((a, b) => a.offsetMs - b.offsetMs)
      generated += 1
      emit(onProgress, sessionId, {
        phase: 'save',
        message: 'Saving generated markers',
        detail: `${generated} generated, ${merged} merged. ${removedAutoMarkers} replaced.`,
        current: 3,
        total,
        generated,
      })
    }

    await this.deps.manager.repairBrokenThumbnails(sessionId).catch(err => {
      console.warn(`Loupe: failed to repair thumbnails after audio analysis for ${sessionId}`, err)
    })

    emit(onProgress, sessionId, {
      phase: 'complete',
      message: 'Audio analysis complete',
      detail: `${generated} generated, ${merged} merged. ${removedAutoMarkers} replaced.`,
      current: total,
      total,
      generated,
    })

    return {
      sessionId,
      transcriptPath: transcript.transcriptPath,
      generated,
      merged,
      removedAutoMarkers,
      segments: transcript.segments.length,
    }
  }
}
