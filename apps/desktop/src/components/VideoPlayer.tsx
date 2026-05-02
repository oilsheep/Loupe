import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { Bug, BugSeverity, DesktopApi, SeveritySettings } from '@shared/types'
import { localFileUrl } from '@/lib/api'

export interface VideoPlayerHandle {
  seekToMs(ms: number): void
  playWindow(startMs: number, endMs: number): void
  currentTimeMs(): number
}

export interface TranscriptToken {
  startMs: number
  endMs: number
  text: string
}

export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
  tokens?: TranscriptToken[]
}

function alignedChars(value: string): string[] {
  return Array.from(value.replace(/\s+/g, ''))
}

function displayTokensForSegment(segment: TranscriptSegment): TranscriptToken[] {
  if (segment.tokens?.length) return segment.tokens
  const chars = alignedChars(segment.text)
  if (!chars.length) return [{ startMs: segment.startMs, endMs: segment.endMs, text: segment.text }]
  const durationMs = Math.max(chars.length, segment.endMs - segment.startMs)
  return chars.map((text, index) => {
    const startMs = Math.round(segment.startMs + (durationMs * index) / chars.length)
    const endMs = Math.round(segment.startMs + (durationMs * (index + 1)) / chars.length)
    return { startMs, endMs: Math.max(startMs + 1, endMs), text }
  })
}

interface Props {
  api: DesktopApi
  src: string
  micAudioSrc?: string | null
  micAudioStartOffsetMs?: number | null
  transcriptSegments?: TranscriptSegment[]
  severities?: SeveritySettings
  bugs: Bug[]
  durationMs: number
  selectedBugId: string | null
  onMarkerClick(bug: Bug): void
  onClipWindowChange?(bug: Bug, preSec: number, postSec: number): void
}

const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}

function severityLabel(severities: SeveritySettings | undefined, severity: BugSeverity): string {
  return severities?.[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function severityColor(severities: SeveritySettings | undefined, severity: BugSeverity): string {
  return severities?.[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}

function formatTimelineMs(ms: number, compact = false): string {
  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (!compact && safeMs < 10_000) return `${seconds}.${Math.floor((safeMs % 1000) / 100)}s`
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function niceTickStep(spanMs: number): number {
  const target = spanMs / 6
  const steps = [500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000]
  return steps.find(step => step >= target) ?? steps[steps.length - 1]
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <rect x="5" y="4" width="3.5" height="12" rx="0.8" fill="currentColor" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="0.8" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path d="M6 4.8v10.4c0 .8.9 1.2 1.5.8l8-5.2c.6-.4.6-1.2 0-1.6l-8-5.2c-.6-.4-1.5 0-1.5.8z" fill="currentColor" />
    </svg>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path d="M3 8v4h3l4 3V5L6 8H3z" fill="currentColor" />
      {muted ? (
        <>
          <path d="M14 7l3 6M17 7l-3 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M12.5 7.2a4 4 0 010 5.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14.7 5.2a7 7 0 010 9.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ api, src, micAudioSrc, micAudioStartOffsetMs, transcriptSegments = [], severities, bugs, durationMs, selectedBugId, onMarkerClick, onClipWindowChange }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const micAudioRef = useRef<HTMLAudioElement>(null)
  const clipEndMsRef = useRef<number | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [videoSrc, setVideoSrc] = useState(src)
  const [micMuted, setMicMuted] = useState(false)
  const [cursorMs, setCursorMs] = useState(0)
  const [transcriptCursorMs, setTranscriptCursorMs] = useState(0)
  const [isTranscriptHovering, setIsTranscriptHovering] = useState(false)
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([])
  const [waveformDurationMs, setWaveformDurationMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [timelineViewport, setTimelineViewport] = useState({ startMs: 0, endMs: Math.max(0, durationMs) })
  const syncingMediaRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const selectedBug = bugs.find(b => b.id === selectedBugId) ?? null
  const micOffsetMs = Math.max(0, micAudioStartOffsetMs ?? 0)
  const sessionTranscriptSegments = transcriptSegments.map(segment => ({
    ...segment,
    startMs: segment.startMs + micOffsetMs,
    endMs: segment.endMs + micOffsetMs,
    tokens: segment.tokens?.map(token => ({
      ...token,
      startMs: token.startMs + micOffsetMs,
      endMs: token.endMs + micOffsetMs,
    })),
  }))
  const viewportStartMs = Math.max(0, Math.min(timelineViewport.startMs, Math.max(0, durationMs)))
  const viewportEndMs = Math.max(viewportStartMs, Math.min(timelineViewport.endMs, Math.max(0, durationMs)))
  const viewportSpanMs = Math.max(1, viewportEndMs - viewportStartMs)
  const cursorPct = durationMs ? Math.max(0, Math.min(100, ((cursorMs - viewportStartMs) / viewportSpanMs) * 100)) : 0
  const fullCursorPct = durationMs ? Math.max(0, Math.min(100, (cursorMs / durationMs) * 100)) : 0
  const effectiveTranscriptCursorMs = isTranscriptHovering ? transcriptCursorMs : cursorMs
  const transcriptCursorPct = durationMs ? Math.max(0, Math.min(100, (effectiveTranscriptCursorMs / durationMs) * 100)) : 0
  const selectedWindowStartMs = selectedBug ? selectedBug.offsetMs - selectedBug.preSec * 1000 : 0
  const selectedWindowEndMs = selectedBug ? selectedBug.offsetMs + selectedBug.postSec * 1000 : 0
  const selectedWindowVisible = selectedBug && durationMs > 0 && selectedWindowEndMs >= viewportStartMs && selectedWindowStartMs <= viewportEndMs
  const selectionStartRawPct = selectedBug && durationMs ? timelinePctForMs(selectedWindowStartMs) : 0
  const selectionEndRawPct = selectedBug && durationMs ? timelinePctForMs(selectedWindowEndMs) : 0
  const selectionStartPct = Math.max(0, Math.min(100, selectionStartRawPct))
  const selectionEndPct = Math.max(0, Math.min(100, selectionEndRawPct))
  const showSelectionStartHandle = selectionStartRawPct >= 0 && selectionStartRawPct <= 100
  const showSelectionEndHandle = selectionEndRawPct >= 0 && selectionEndRawPct <= 100
  const overviewStartPct = durationMs ? Math.max(0, Math.min(100, (viewportStartMs / durationMs) * 100)) : 0
  const overviewWidthPct = durationMs ? Math.max(2, Math.min(100 - overviewStartPct, (viewportSpanMs / durationMs) * 100)) : 100
  const rulerStepMs = niceTickStep(viewportSpanMs)
  const rulerTicks: number[] = []
  if (durationMs > 0) {
    const firstTick = Math.ceil(viewportStartMs / rulerStepMs) * rulerStepMs
    for (let ms = firstTick; ms <= viewportEndMs; ms += rulerStepMs) rulerTicks.push(ms)
  }
  const transcriptTokens = sessionTranscriptSegments.flatMap(displayTokensForSegment).filter(token => token.text.trim())
  const transcriptWindowStart = Math.max(0, effectiveTranscriptCursorMs - 5000)
  const transcriptWindowEnd = effectiveTranscriptCursorMs + 5000

  function clampSessionMs(ms: number): number {
    const max = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
    return Math.max(0, Math.min(max, ms))
  }

  function clampViewport(startMs: number, spanMs: number): { startMs: number; endMs: number } {
    if (durationMs <= 0) return { startMs: 0, endMs: 0 }
    const minSpanMs = Math.min(durationMs, 1000)
    const nextSpanMs = Math.max(minSpanMs, Math.min(durationMs, spanMs))
    const nextStartMs = Math.max(0, Math.min(durationMs - nextSpanMs, startMs))
    return { startMs: nextStartMs, endMs: nextStartMs + nextSpanMs }
  }

  function timelinePctForMs(ms: number): number {
    if (durationMs <= 0 || viewportSpanMs <= 0) return 0
    return ((ms - viewportStartMs) / viewportSpanMs) * 100
  }

  function micTimeForSessionMs(ms: number): number {
    return Math.max(0, (ms - micOffsetMs) / 1000)
  }

  function setMicTimeForSessionMs(ms: number, force = false) {
    const audio = micAudioRef.current
    if (!audio) return
    const nextAudioTime = micTimeForSessionMs(ms)
    if (ms < micOffsetMs) {
      if (!audio.paused) audio.pause()
      if (force || audio.currentTime !== 0) audio.currentTime = 0
      return
    }
    if (force || Math.abs(audio.currentTime - nextAudioTime) > 0.12) {
      audio.currentTime = nextAudioTime
    }
  }

  function updatePlaybackCursor(ms: number) {
    const nextMs = clampSessionMs(ms)
    setCursorMs(nextMs)
    setTranscriptCursorMs(nextMs)
  }

  function seekPlaybackToMs(ms: number, opts: { pause?: boolean; keepClipEnd?: boolean } = {}) {
    const video = videoRef.current
    const nextMs = clampSessionMs(ms)
    if (!opts.keepClipEnd) clipEndMsRef.current = null
    syncingMediaRef.current = true
    if (opts.pause) {
      video?.pause()
      micAudioRef.current?.pause()
    }
    if (video) video.currentTime = nextMs / 1000
    setMicTimeForSessionMs(nextMs, true)
    updatePlaybackCursor(nextMs)
    window.setTimeout(() => { syncingMediaRef.current = false }, 0)
  }

  useImperativeHandle(ref, () => ({
    seekToMs(ms: number) {
      seekPlaybackToMs(ms, { pause: true })
    },
    playWindow(startMs: number, endMs: number) {
      const video = videoRef.current
      if (!video) return
      const start = clampSessionMs(startMs)
      const end = clampSessionMs(Math.max(start, endMs))
      clipEndMsRef.current = end
      seekPlaybackToMs(start, { keepClipEnd: true })
      video.play().catch(() => {})
    },
    currentTimeMs() {
      const v = videoRef.current
      return v ? v.currentTime * 1000 : cursorMs
    },
  }), [cursorMs, durationMs, micOffsetMs])

  useEffect(() => {
    const video = videoRef.current
    const audio = micAudioRef.current
    if (video) video.playbackRate = playbackRate
    if (audio) audio.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    setTimelineViewport(current => {
      if (durationMs <= 0) return { startMs: 0, endMs: 0 }
      const currentSpan = Math.max(1, current.endMs - current.startMs)
      if (current.endMs <= 0 || current.startMs >= durationMs) return { startMs: 0, endMs: durationMs }
      return clampViewport(current.startMs, Math.min(durationMs, currentSpan))
    })
  }, [durationMs])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,button,[contenteditable="true"]')) return
      event.preventDefault()
      togglePlayback()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const tick = () => {
      const video = videoRef.current
      if (video) {
        updatePlaybackCursor(video.currentTime * 1000)
        syncMicToVideo()
      }
      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isPlaying, durationMs, micOffsetMs])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      bugs
        .filter(b => b.screenshotRel)
        .map(async b => {
          const abs = await api._resolveAssetPath(b.sessionId, b.screenshotRel!)
          return [b.id, localFileUrl(abs)] as const
        })
    ).then(entries => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [id, url] of entries) next[id] = url
      setThumbs(next)
    })
    return () => { cancelled = true }
  }, [bugs, api])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    const timer = window.setTimeout(async () => {
      const video = videoRef.current
      if (!video || video.readyState > 0 || video.duration > 0) return
      try {
        const response = await fetch(src, { cache: 'no-store' })
        if (!response.ok) throw new Error(`video fetch failed: ${response.status}`)
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setVideoSrc(objectUrl)
      } catch (err) {
        console.warn('Loupe: video fallback load failed', err)
      }
    }, 2000)

    setVideoSrc(src)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  useEffect(() => {
    let cancelled = false
    if (!micAudioSrc) {
      setWaveformPeaks([])
      setWaveformDurationMs(0)
      return () => { cancelled = true }
    }

    async function loadWaveform() {
      try {
        const response = await fetch(micAudioSrc!, { cache: 'no-store' })
        if (!response.ok) throw new Error(`mic fetch failed: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextCtor) return
        const audioContext = new AudioContextCtor()
        const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
        await audioContext.close().catch(() => {})
        if (cancelled) return
        const samples = buffer.getChannelData(0)
        setWaveformDurationMs(buffer.duration * 1000)
        const bins = 220
        const next: number[] = []
        for (let bin = 0; bin < bins; bin += 1) {
          const start = Math.floor((bin / bins) * samples.length)
          const end = Math.max(start + 1, Math.floor(((bin + 1) / bins) * samples.length))
          let peak = 0
          for (let i = start; i < end; i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0))
          next.push(Math.min(1, peak * 2.4))
        }
        setWaveformPeaks(next)
      } catch (err) {
        console.warn('Loupe: failed to build mic waveform', err)
        if (!cancelled) {
          setWaveformPeaks([])
          setWaveformDurationMs(0)
        }
      }
    }

    void loadWaveform()
    return () => { cancelled = true }
  }, [micAudioSrc])

  function stopAtClipEnd() {
    const video = videoRef.current
    const clipEndMs = clipEndMsRef.current
    if (!video || clipEndMs === null) return
    updatePlaybackCursor(video.currentTime * 1000)
    if (video.currentTime * 1000 >= clipEndMs) {
      video.pause()
      video.currentTime = clipEndMs / 1000
      setMicTimeForSessionMs(clipEndMs, true)
      updatePlaybackCursor(clipEndMs)
      clipEndMsRef.current = null
    }
  }

  function updateCursorFromVideo() {
    const video = videoRef.current
    if (!video) return
    updatePlaybackCursor(video.currentTime * 1000)
  }

  function syncMicToVideo() {
    const video = videoRef.current
    const audio = micAudioRef.current
    if (!video || !audio) return
    const videoMs = video.currentTime * 1000
    const nextAudioTime = micTimeForSessionMs(videoMs)
    if (videoMs < micOffsetMs) {
      audio.pause()
      audio.currentTime = 0
      return
    }
    if (Math.abs(audio.currentTime - nextAudioTime) > 0.12) audio.currentTime = nextAudioTime
    if (!video.paused && audio.paused) audio.play().catch(() => {})
  }

  function playMicWithVideo() {
    setIsPlaying(true)
    syncMicToVideo()
    const video = videoRef.current
    if (video && video.currentTime * 1000 < micOffsetMs) return
    if (micAudioRef.current) micAudioRef.current.playbackRate = playbackRate
    micAudioRef.current?.play().catch(() => {})
  }

  function pauseMicWithVideo() {
    setIsPlaying(false)
    micAudioRef.current?.pause()
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      syncMicToVideo()
      video.playbackRate = playbackRate
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  function changePlaybackRate(rate: number) {
    setPlaybackRate(rate)
    const video = videoRef.current
    const audio = micAudioRef.current
    if (video) video.playbackRate = rate
    if (audio) audio.playbackRate = rate
  }

  function seekFromTimeline(e: MouseEvent<HTMLDivElement>) {
    const ms = timeFromVisibleTimelineEvent(e)
    if (ms === null) return
    seekPlaybackToMs(ms, { pause: true })
  }

  function dragPlayhead(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null
    if (target?.closest('button,[data-clip-handle="true"]')) return
    const ms = timeFromPointer(e.currentTarget, e.clientX)
    if (ms !== null) seekPlaybackToMs(ms, { pause: true })
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (event: PointerEvent) => {
      const nextMs = timeFromPointer(el, event.clientX)
      if (nextMs !== null) seekPlaybackToMs(nextMs, { pause: true })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  function timeFromPointer(el: HTMLElement, clientX: number): number | null {
    if (durationMs <= 0) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return viewportStartMs + viewportSpanMs * pct
  }

  function dragClipHandle(kind: 'start' | 'end', e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedBug || !onClipWindowChange) return
    const timeline = e.currentTarget.closest('[data-testid="timeline"]') as HTMLElement | null
    if (!timeline) return
    const update = (clientX: number) => {
      const ms = timeFromPointer(timeline, clientX)
      if (ms === null) return
      if (kind === 'start') {
        const preSec = Math.max(0, Math.min(60, Math.round((selectedBug.offsetMs - ms) / 100) / 10))
        onClipWindowChange(selectedBug, preSec, selectedBug.postSec)
        seekPlaybackToMs(selectedBug.offsetMs - preSec * 1000, { pause: true })
      } else {
        const postSec = Math.max(0, Math.min(60, Math.round((ms - selectedBug.offsetMs) / 100) / 10))
        onClipWindowChange(selectedBug, selectedBug.preSec, postSec)
        seekPlaybackToMs(selectedBug.offsetMs + postSec * 1000, { pause: true })
      }
    }
    update(e.clientX)
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (event: PointerEvent) => update(event.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function timeFromTimelineEvent(e: MouseEvent<HTMLDivElement>): number | null {
    if (durationMs <= 0) return null
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return null
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return durationMs * pct
  }

  function timeFromVisibleTimelineEvent(e: MouseEvent<HTMLDivElement>): number | null {
    if (durationMs <= 0) return null
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return null
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return viewportStartMs + viewportSpanMs * pct
  }

  function zoomTimeline(e: ReactWheelEvent<HTMLDivElement>) {
    if (durationMs <= 0) return
    if (!e.altKey) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const anchorPct = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5
    const anchorMs = viewportStartMs + viewportSpanMs * anchorPct
    const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18
    const nextSpanMs = viewportSpanMs * factor
    setTimelineViewport(clampViewport(anchorMs - nextSpanMs * anchorPct, nextSpanMs))
  }

  function dragViewportWindow(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (durationMs <= 0) return
    const track = e.currentTarget.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    const startClientX = e.clientX
    const initialStartMs = viewportStartMs
    const spanMs = viewportSpanMs
    const update = (clientX: number) => {
      if (rect.width <= 0) return
      const deltaMs = ((clientX - startClientX) / rect.width) * durationMs
      setTimelineViewport(clampViewport(initialStartMs + deltaMs, spanMs))
    }
    update(e.clientX)
    const move = (event: PointerEvent) => update(event.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function moveTranscriptCursor(e: MouseEvent<HTMLDivElement>) {
    const ms = timeFromTimelineEvent(e)
    if (ms === null) return
    setTranscriptCursorMs(ms)
  }

  function seekFromTranscriptTimeline(e: MouseEvent<HTMLDivElement>) {
    const ms = timeFromTimelineEvent(e)
    if (ms === null) return
    seekPlaybackToMs(ms, { pause: true })
  }

  function syncVideoFromMic() {
    const audio = micAudioRef.current
    const video = videoRef.current
    if (!audio || !video || syncingMediaRef.current) return
    const sessionMs = audio.currentTime * 1000 + micOffsetMs
    if (Math.abs(video.currentTime * 1000 - sessionMs) > 250) {
      video.currentTime = sessionMs / 1000
      updatePlaybackCursor(sessionMs)
    }
  }

  const transportControls = (
    <div className="flex items-center justify-center gap-3" data-testid="transport-controls">
      <button
        type="button"
        onClick={togglePlayback}
        className="inline-flex h-7 w-9 items-center justify-center rounded bg-blue-700 text-white hover:bg-blue-600"
        data-testid="transport-play-pause"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        <PlayIcon playing={isPlaying} />
      </button>
      <div className="flex overflow-hidden rounded border border-zinc-700">
        {[1, 2, 3].map(rate => (
          <button
            key={rate}
            type="button"
            onClick={() => changePlaybackRate(rate)}
            className={`h-7 px-2 text-xs ${
              playbackRate === rate
                ? 'bg-amber-400 text-black'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            data-testid={`transport-rate-${rate}`}
          >
            x{rate}
          </button>
        ))}
      </div>
      <span className="hidden whitespace-nowrap text-[11px] text-zinc-500 sm:inline">
        Alt + wheel: zoom timeline
      </span>
    </div>
  )

  return (
    <div className="flex min-h-0 w-full flex-col gap-2">
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        preload="metadata"
        onPlay={playMicWithVideo}
        onPause={pauseMicWithVideo}
        onTimeUpdate={() => { stopAtClipEnd(); syncMicToVideo() }}
        onSeeking={() => { updateCursorFromVideo(); syncMicToVideo() }}
        onSeeked={() => { updateCursorFromVideo(); syncMicToVideo() }}
        onLoadedMetadata={() => { updateCursorFromVideo(); syncMicToVideo() }}
        onRateChange={(e) => {
          const nextRate = e.currentTarget.playbackRate
          setPlaybackRate(nextRate)
          if (micAudioRef.current) micAudioRef.current.playbackRate = nextRate
        }}
        onError={(e) => {
          const mediaError = e.currentTarget.error
          console.warn('Loupe: video element failed', {
            code: mediaError?.code,
            message: mediaError?.message,
            src: e.currentTarget.currentSrc,
          })
        }}
        className={`mx-auto block max-w-full rounded-lg bg-black object-contain ${transcriptTokens.length > 0 || micAudioSrc ? 'max-h-[calc(100vh-330px)]' : 'max-h-[calc(100vh-260px)]'}`}
        data-testid="video-el"
      />
      {(transcriptTokens.length > 0 || micAudioSrc) && durationMs > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2" data-testid="transcript-debug">
          {micAudioSrc && (
            <audio
              ref={micAudioRef}
              src={micAudioSrc}
              preload="metadata"
              muted={micMuted}
              onLoadedMetadata={() => setMicTimeForSessionMs(cursorMs, true)}
              onSeeked={syncVideoFromMic}
              onTimeUpdate={syncVideoFromMic}
            />
          )}
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px] text-zinc-500">
            <span className="min-w-0 truncate">{transcriptTokens.length > 0 ? 'Transcript / MIC timeline' : 'MIC timeline'}</span>
            {transportControls}
            {micAudioSrc && (
              <button
                type="button"
                onClick={() => setMicMuted(v => !v)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                title={micMuted ? 'Unmute MIC' : 'Mute MIC'}
                aria-label={micMuted ? 'Unmute MIC' : 'Mute MIC'}
                data-testid="mic-track-mute"
              >
                <SpeakerIcon muted={micMuted} />
              </button>
            )}
          </div>
          {transcriptTokens.length > 0 && (
            <div className="mb-2 max-h-14 overflow-y-auto rounded bg-zinc-950/50 px-2 py-1 text-xs leading-relaxed text-zinc-500">
              {transcriptTokens.map((token, index) => {
                const isActive = token.endMs >= transcriptWindowStart && token.startMs <= transcriptWindowEnd
                const isCenter = token.startMs <= effectiveTranscriptCursorMs && token.endMs >= effectiveTranscriptCursorMs
                return (
                  <span
                    key={`${token.startMs}-${token.endMs}-${index}`}
                    className={isCenter
                      ? 'mx-0.5 rounded bg-amber-400 px-1 font-semibold text-black'
                      : isActive
                        ? 'mx-0.5 rounded bg-blue-500/25 px-1 text-blue-100'
                        : 'mx-0.5'}
                    title={`${Math.round(token.startMs / 100) / 10}s - ${Math.round(token.endMs / 100) / 10}s`}
                  >
                    {token.text}
                  </span>
                )
              })}
            </div>
          )}
          <div
            className="relative h-4 cursor-ew-resize rounded bg-zinc-800"
            data-testid="transcript-timeline"
            onMouseEnter={() => setIsTranscriptHovering(true)}
            onMouseLeave={() => setIsTranscriptHovering(false)}
            onMouseMove={moveTranscriptCursor}
            onClick={seekFromTranscriptTimeline}
          >
            {waveformPeaks.length > 0 && micAudioSrc && (
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden rounded opacity-80">
                {waveformPeaks.map((peak, index) => {
                  const audioStartMs = micOffsetMs
                  const audioDurationMs = waveformDurationMs || (durationMs > 0 ? Math.max(0, durationMs - micOffsetMs) : 0)
                  const left = durationMs > 0 ? ((audioStartMs + (index / waveformPeaks.length) * audioDurationMs) / durationMs) * 100 : 0
                  const width = durationMs > 0 ? Math.max(0.15, (audioDurationMs / waveformPeaks.length / durationMs) * 100) : 0
                  return (
                    <div
                      key={index}
                      className="absolute top-1/2 -translate-y-1/2 rounded-sm bg-cyan-400/45"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        height: `${Math.max(12, peak * 100)}%`,
                      }}
                    />
                  )
                })}
              </div>
            )}
            <div
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-blue-500/25 ring-1 ring-blue-300/30"
              style={{
                left: `${Math.max(0, ((effectiveTranscriptCursorMs - 5000) / durationMs) * 100)}%`,
                width: `${Math.max(0, Math.min(100, ((Math.min(durationMs, effectiveTranscriptCursorMs + 5000) - Math.max(0, effectiveTranscriptCursorMs - 5000)) / durationMs) * 100))}%`,
              }}
            />
            {sessionTranscriptSegments.map((segment, index) => {
              const left = Math.max(0, Math.min(100, (segment.startMs / durationMs) * 100))
              const right = Math.max(0, Math.min(100, (segment.endMs / durationMs) * 100))
              return (
                <div
                  key={`${segment.startMs}-${segment.endMs}-${index}`}
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-zinc-500"
                  style={{ left: `${left}%`, width: `${Math.max(0.4, right - left)}%` }}
                  title={`${Math.round(segment.startMs / 100) / 10}s - ${Math.round(segment.endMs / 100) / 10}s ${segment.text}`}
                />
              )
            })}
            <div
              className="pointer-events-none absolute top-1/2 z-10 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.75)]"
              style={{ left: `${fullCursorPct}%` }}
              title="Video playhead"
            />
            <div
              className="pointer-events-none absolute top-1/2 z-20 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
              style={{ left: `${transcriptCursorPct}%` }}
              title="Transcript debug cursor"
            />
          </div>
        </div>
      )}
      <div
        className="rounded border border-zinc-800 bg-zinc-900/40 px-3 pb-2 pt-1"
        onWheel={zoomTimeline}
        title="Alt + mouse wheel zooms the timeline. Drag the lower overview bar to pan."
      >
        <div className="relative mb-1 h-8 cursor-ew-resize touch-none" data-testid="timeline" onClick={seekFromTimeline} onPointerDown={dragPlayhead}>
          <div className="pointer-events-none absolute left-0 right-0 top-1 h-4 rounded bg-zinc-800" />
          {selectedWindowVisible && selectionEndPct > selectionStartPct && (
            <>
              <div
                className="absolute top-3 h-3 -translate-y-1/2 rounded bg-blue-500/30 ring-1 ring-blue-300/40"
                data-testid="selected-clip-window"
                style={{ left: `${selectionStartPct}%`, width: `${selectionEndPct - selectionStartPct}%` }}
                title={`Export range: -${selectedBug!.preSec}s / +${selectedBug!.postSec}s`}
              />
              {showSelectionStartHandle && (
                <button
                  type="button"
                  data-clip-handle="true"
                  aria-label="Drag clip start"
                  onPointerDown={(e) => dragClipHandle('start', e)}
                  className="absolute top-3 z-20 h-6 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-blue-400 ring-1 ring-white/70"
                  style={{ left: `${selectionStartPct}%` }}
                />
              )}
              {showSelectionEndHandle && (
                <button
                  type="button"
                  data-clip-handle="true"
                  aria-label="Drag clip end"
                  onPointerDown={(e) => dragClipHandle('end', e)}
                  className="absolute top-3 z-20 h-6 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-blue-400 ring-1 ring-white/70"
                  style={{ left: `${selectionEndPct}%` }}
                />
              )}
            </>
          )}
          {durationMs > 0 && (
            <div
              className="pointer-events-none absolute top-3 z-10 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              data-testid="playhead"
              style={{ left: `${cursorPct}%` }}
            />
          )}
          {bugs.map(b => {
            const left = timelinePctForMs(b.offsetMs)
            if (left < -1 || left > 101) return null
            const ring = b.id === selectedBugId ? 'ring-2 ring-white shadow-[0_0_10px_rgba(255,255,255,0.75)]' : ''
            const url = thumbs[b.id]
            const label = severityLabel(severities, b.severity)
            return (
              <div
                key={b.id}
                className="group absolute top-3 -translate-y-1/2"
                style={{ left: `calc(${left}% - 2px)` }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkerClick(b) }}
                  data-testid={`marker-${b.id}`}
                  className={`block h-3.5 w-1 rounded-sm ${ring}`}
                  style={{ backgroundColor: severityColor(severities, b.severity) }}
                />
                <div
                  className="invisible absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl group-hover:visible"
                  data-testid={`tooltip-${b.id}`}
                >
                  {url
                    ? <img src={url} alt="" className="mb-2 w-full rounded" />
                    : <div className="mb-2 h-20 w-full rounded bg-zinc-800 text-center text-[10px] leading-[5rem] text-zinc-500">no screenshot</div>
                  }
                  <div className="font-mono text-[10px] text-zinc-400">{Math.floor(b.offsetMs / 1000)}s - {label}</div>
                  <div className="line-clamp-3 text-xs text-zinc-200">{b.note}</div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="relative h-8 border-t border-zinc-800/80 pt-1 text-[10px] text-zinc-500" data-testid="timeline-ruler">
          <div className="absolute left-0 top-1 font-mono text-zinc-400">{formatTimelineMs(viewportStartMs, true)}</div>
          <div className="absolute right-0 top-1 font-mono text-zinc-400">{formatTimelineMs(viewportEndMs, true)}</div>
          {rulerTicks.map(tickMs => {
            const left = timelinePctForMs(tickMs)
            if (left < 0 || left > 100) return null
            return (
              <div key={tickMs} className="absolute top-0 h-6 -translate-x-1/2" style={{ left: `${left}%` }}>
                <div className="mx-auto h-3 w-px bg-zinc-600" />
                <div className="mt-0.5 font-mono">{formatTimelineMs(tickMs)}</div>
              </div>
            )
          })}
        </div>
        <div className="relative h-4 rounded bg-zinc-800" data-testid="timeline-overview">
          {bugs.map(b => (
            <div
              key={b.id}
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded"
              style={{
                left: `${durationMs ? Math.max(0, Math.min(100, (b.offsetMs / durationMs) * 100)) : 0}%`,
                backgroundColor: severityColor(severities, b.severity),
              }}
            />
          ))}
          <button
            type="button"
            className="absolute top-1/2 h-3 -translate-y-1/2 cursor-grab rounded bg-blue-400/35 ring-1 ring-blue-300/70 active:cursor-grabbing"
            style={{ left: `${overviewStartPct}%`, width: `${overviewWidthPct}%` }}
            onPointerDown={dragViewportWindow}
            aria-label={`Timeline viewport ${formatTimelineMs(viewportStartMs, true)} to ${formatTimelineMs(viewportEndMs, true)}`}
            title={`Visible range: ${formatTimelineMs(viewportStartMs, true)} - ${formatTimelineMs(viewportEndMs, true)}`}
            data-testid="timeline-viewport-window"
          />
        </div>
      </div>
      {!(transcriptTokens.length > 0 || micAudioSrc) && (
        <div className="flex shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1">
          {transportControls}
        </div>
      )}
    </div>
  )
})
VideoPlayer.displayName = 'VideoPlayer'
