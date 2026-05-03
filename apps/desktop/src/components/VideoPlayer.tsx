import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { Bug, BugAnnotation, BugSeverity, DesktopApi, SeveritySettings } from '@shared/types'
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
  selectedAnnotationId?: string | null
  onMarkerClick(bug: Bug): void
  onClipWindowChange?(bug: Bug, preSec: number, postSec: number): void
  onAnnotationAdd?(bug: Bug, rect: Pick<BugAnnotation, 'x' | 'y' | 'width' | 'height' | 'startMs' | 'endMs'> & Partial<Pick<BugAnnotation, 'kind' | 'points' | 'text'>>): void
  onAnnotationUpdate?(id: string, patch: Partial<Pick<BugAnnotation, 'x' | 'y' | 'width' | 'height' | 'points' | 'text'>>): void
  onAnnotationDelete?(id: string): void
  onAnnotationSelect?(annotationId: string): void
}

const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'default', color: '#a1a1aa' },
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

interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

type AnnotationTool = NonNullable<BugAnnotation['kind']>

interface AnnotationDraft extends NormalizedRect {
  kind: AnnotationTool
  points?: Array<{ x: number; y: number }>
  text?: string
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(clean)) return `rgba(245,158,11,${alpha})`
  const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): NormalizedRect {
  const x1 = clamp01(Math.min(a.x, b.x))
  const y1 = clamp01(Math.min(a.y, b.y))
  const x2 = clamp01(Math.max(a.x, b.x))
  const y2 = clamp01(Math.max(a.y, b.y))
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

function boundingRectForPoints(points: Array<{ x: number; y: number }>): NormalizedRect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = points.map(point => clamp01(point.x))
  const ys = points.map(point => clamp01(point.y))
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    width: Math.max(0.02, Math.min(1 - x, Math.max(...xs) - x)),
    height: Math.max(0.02, Math.min(1 - y, Math.max(...ys) - y)),
  }
}

function localPointForRect(point: { x: number; y: number }, rect: NormalizedRect): { x: number; y: number } {
  const width = Math.max(0.0001, rect.width)
  const height = Math.max(0.0001, rect.height)
  return {
    x: ((point.x - rect.x) / width) * 100,
    y: ((point.y - rect.y) / height) * 100,
  }
}

function arrowHeadSegments(tail: { x: number; y: number }, head: { x: number; y: number }) {
  const dx = tail.x - head.x
  const dy = tail.y - head.y
  const length = Math.max(0.0001, Math.hypot(dx, dy))
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const arm = 13
  const spread = 6
  return [
    { x1: head.x, y1: head.y, x2: head.x + ux * arm + px * spread, y2: head.y + uy * arm + py * spread },
    { x1: head.x, y1: head.y, x2: head.x + ux * arm - px * spread, y2: head.y + uy * arm - py * spread },
  ]
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

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ api, src, micAudioSrc, micAudioStartOffsetMs, transcriptSegments = [], severities, bugs, durationMs, selectedBugId, selectedAnnotationId, onMarkerClick, onClipWindowChange, onAnnotationAdd, onAnnotationUpdate, onAnnotationDelete, onAnnotationSelect }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const micAudioRef = useRef<HTMLAudioElement>(null)
  const clipEndMsRef = useRef<number | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [videoSrc, setVideoSrc] = useState(src)
  const [mediaMuted, setMediaMuted] = useState(false)
  const [cursorMs, setCursorMs] = useState(0)
  const [transcriptCursorMs, setTranscriptCursorMs] = useState(0)
  const [isTranscriptHovering, setIsTranscriptHovering] = useState(false)
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([])
  const [waveformDurationMs, setWaveformDurationMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [timelineViewport, setTimelineViewport] = useState({ startMs: 0, endMs: Math.max(0, durationMs) })
  const [contentBox, setContentBox] = useState({ x: 0, y: 0, width: 1, height: 1 })
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('rect')
  const [draftAnnotation, setDraftAnnotation] = useState<AnnotationDraft | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState<{ id: string; rect: NormalizedRect; points?: Array<{ x: number; y: number }> } | null>(null)
  const [textDraftHeights, setTextDraftHeights] = useState<Record<string, number>>({})
  const syncingMediaRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const selectedBug = bugs.find(b => b.id === selectedBugId) ?? null
  const micOffsetMs = micAudioStartOffsetMs ?? 0
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
  const selectedBugClipStartMs = selectedBug ? Math.max(0, selectedBug.offsetMs - selectedBug.preSec * 1000) : 0
  const selectedBugClipEndMs = selectedBug ? Math.min(durationMs || Number.POSITIVE_INFINITY, selectedBug.offsetMs + selectedBug.postSec * 1000) : 0
  const canAnnotateAtCursor = Boolean(selectedBug && cursorMs >= selectedBugClipStartMs && cursorMs <= selectedBugClipEndMs)

  function clampSessionMs(ms: number): number {
    const max = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
    return Math.max(0, Math.min(max, ms))
  }

  function updateVideoContentBox() {
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const intrinsicWidth = video.videoWidth
    const intrinsicHeight = video.videoHeight
    if (rect.width <= 0 || rect.height <= 0 || intrinsicWidth <= 0 || intrinsicHeight <= 0) {
      setContentBox({ x: 0, y: 0, width: 1, height: 1 })
      return
    }
    const boxRatio = rect.width / rect.height
    const videoRatio = intrinsicWidth / intrinsicHeight
    if (boxRatio > videoRatio) {
      const contentWidth = rect.height * videoRatio
      const x = (rect.width - contentWidth) / 2 / rect.width
      setContentBox({ x, y: 0, width: contentWidth / rect.width, height: 1 })
    } else {
      const contentHeight = rect.width / videoRatio
      const y = (rect.height - contentHeight) / 2 / rect.height
      setContentBox({ x: 0, y, width: 1, height: contentHeight / rect.height })
    }
  }

  function annotationPointFromPointer(clientX: number, clientY: number): { x: number; y: number } | null {
    const video = videoRef.current
    if (!video) return null
    const rect = video.getBoundingClientRect()
    if (clientY > rect.bottom - 56) return null
    const localX = (clientX - rect.left) / rect.width
    const localY = (clientY - rect.top) / rect.height
    const x = (localX - contentBox.x) / contentBox.width
    const y = (localY - contentBox.y) / contentBox.height
    return { x: clamp01(x), y: clamp01(y) }
  }

  function cssRectForAnnotation(rect: NormalizedRect) {
    return {
      left: `${(contentBox.x + rect.x * contentBox.width) * 100}%`,
      top: `${(contentBox.y + rect.y * contentBox.height) * 100}%`,
      width: `${rect.width * contentBox.width * 100}%`,
      height: `${rect.height * contentBox.height * 100}%`,
    }
  }

  function videoContentAspectRatio(): number {
    const video = videoRef.current
    const rect = video?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0 || contentBox.width <= 0 || contentBox.height <= 0) return 1
    return (rect.width * contentBox.width) / (rect.height * contentBox.height)
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
    updateVideoContentBox()
    const video = videoRef.current
    if (!video || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateVideoContentBox)
    observer.observe(video)
    return () => observer.disconnect()
  }, [videoSrc])

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
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      if ((event.code === 'Delete' || event.code === 'Backspace') && selectedAnnotationId && onAnnotationDelete) {
        event.preventDefault()
        onAnnotationDelete(selectedAnnotationId)
        return
      }
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      togglePlayback()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedAnnotationId, onAnnotationDelete])

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
    if (sessionMs < 0) return
    if (Math.abs(video.currentTime * 1000 - sessionMs) > 250) {
      video.currentTime = sessionMs / 1000
      updatePlaybackCursor(sessionMs)
    }
  }

  function defaultAnnotationTimeWindow(): { startMs: number; endMs: number } {
    if (!selectedBug) return { startMs: cursorMs, endMs: cursorMs + 3000 }
    const clipStart = selectedBugClipStartMs
    const clipEnd = selectedBugClipEndMs
    const startMs = Math.max(clipStart, Math.min(cursorMs, clipEnd))
    const forwardEnd = Math.min(startMs + 3000, clipEnd)
    if (forwardEnd - startMs >= 300) return { startMs, endMs: forwardEnd }
    const fallbackStart = Math.max(clipStart, startMs - 3000)
    return { startMs: fallbackStart, endMs: Math.min(clipEnd, Math.max(startMs, fallbackStart + 300)) }
  }

  function drawAnnotation(e: ReactPointerEvent<HTMLDivElement>) {
    if (!selectedBug || !onAnnotationAdd) return
    if (!canAnnotateAtCursor) return
    if ((e.target as HTMLElement | null)?.closest('[data-annotation-id]')) return
    const start = annotationPointFromPointer(e.clientX, e.clientY)
    if (!start) return
    e.preventDefault()
    const timeWindow = defaultAnnotationTimeWindow()
    if (annotationTool === 'arrow') {
      const width = 0.18
      const height = Math.max(0.04, Math.min(0.18, width * videoContentAspectRatio()))
      const head = { x: clamp01(start.x), y: clamp01(start.y) }
      const tail = { x: Math.max(0, Math.min(1, head.x + width)), y: Math.max(0, Math.min(1, head.y - height)) }
      const arrowRect = {
        ...boundingRectForPoints([tail, head]),
        points: [tail, head],
      }
      onAnnotationAdd(selectedBug, { kind: 'arrow', ...arrowRect, ...timeWindow })
      return
    }
    if (annotationTool === 'text') {
      onAnnotationAdd(selectedBug, {
        kind: 'text',
        x: Math.max(0, Math.min(0.62, start.x)),
        y: Math.max(0, Math.min(0.94, start.y)),
        width: 0.36,
        height: 0.1,
        text: 'Text',
        ...timeWindow,
      })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (annotationTool === 'freehand') {
      const points = [start]
      setDraftAnnotation({ kind: 'freehand', ...boundingRectForPoints(points), points })
      const el = e.currentTarget
      const move = (event: PointerEvent) => {
        const current = annotationPointFromPointer(event.clientX, event.clientY)
        if (!current) return
        points.push(current)
        setDraftAnnotation({ kind: 'freehand', ...boundingRectForPoints(points), points: [...points] })
      }
      const finish = () => {
        setDraftAnnotation(null)
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', finish)
        el.removeEventListener('pointercancel', finish)
        if (points.length < 2) return
        const rect = boundingRectForPoints(points)
        onAnnotationAdd(selectedBug, { kind: 'freehand', ...rect, points, ...timeWindow })
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', finish)
      el.addEventListener('pointercancel', finish)
      return
    }
    setDraftAnnotation({ kind: annotationTool, x: start.x, y: start.y, width: 0, height: 0 })
    const el = e.currentTarget
    const move = (event: PointerEvent) => {
      const current = annotationPointFromPointer(event.clientX, event.clientY)
      if (!current) return
      setDraftAnnotation({ kind: annotationTool, ...normalizeRect(start, current) })
    }
    const finish = (event: PointerEvent) => {
      const current = annotationPointFromPointer(event.clientX, event.clientY)
      const rect = current ? normalizeRect(start, current) : null
      setDraftAnnotation(null)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      if (!rect || rect.width < 0.02 || rect.height < 0.02) return
      onAnnotationAdd(selectedBug, { kind: annotationTool, ...rect, ...timeWindow })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
  }

  function moveAnnotation(annotation: BugAnnotation, mode: 'move' | 'resize', e: ReactPointerEvent<HTMLDivElement>) {
    if (!onAnnotationUpdate) return
    e.preventDefault()
    e.stopPropagation()
    onAnnotationSelect?.(annotation.id)
    const start = annotationPointFromPointer(e.clientX, e.clientY)
    if (!start) return
    const original: NormalizedRect = { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height }
    const originalPoints = annotation.points?.map(point => ({ ...point })) ?? []
    let latestEdit = { id: annotation.id, rect: original, points: originalPoints }
    setEditingAnnotation(latestEdit)
    const update = (event: PointerEvent) => {
      const current = annotationPointFromPointer(event.clientX, event.clientY)
      if (!current) return
      const dx = current.x - start.x
      const dy = current.y - start.y
      const rect = mode === 'resize'
        ? {
            ...original,
            width: Math.max(0.02, Math.min(1 - original.x, original.width + dx)),
            height: Math.max(0.02, Math.min(1 - original.y, original.height + dy)),
          }
        : {
            ...original,
            x: Math.max(0, Math.min(1 - original.width, original.x + dx)),
            y: Math.max(0, Math.min(1 - original.height, original.y + dy)),
          }
      const points = annotation.kind === 'arrow'
        ? [
            { x: rect.x + rect.width, y: rect.y },
            { x: rect.x, y: rect.y + rect.height },
          ]
        : mode === 'move' && originalPoints.length > 0
        ? originalPoints.map(point => ({ x: clamp01(point.x + dx), y: clamp01(point.y + dy) }))
        : originalPoints
      latestEdit = { id: annotation.id, rect, points }
      setEditingAnnotation(latestEdit)
    }
    const finish = () => {
      window.removeEventListener('pointermove', update)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      onAnnotationUpdate(annotation.id, { ...latestEdit.rect, ...(latestEdit.points ? { points: latestEdit.points } : {}) })
      setEditingAnnotation(null)
    }
    window.addEventListener('pointermove', update)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
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
  const annotationBoxes = selectedBug?.annotations ?? []
  const annotationTools: Array<{ kind: AnnotationTool; title: string }> = [
    { kind: 'rect', title: 'Rectangle' },
    { kind: 'ellipse', title: 'Ellipse' },
    { kind: 'freehand', title: 'Freehand pen' },
    { kind: 'arrow', title: 'Arrow' },
    { kind: 'text', title: 'Text' },
  ]
  function AnnotationToolIcon({ kind }: { kind: AnnotationTool }) {
    if (kind === 'rect') {
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          <rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    }
    if (kind === 'ellipse') {
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          <ellipse cx="10" cy="10" rx="6.2" ry="6.2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    }
    if (kind === 'freehand') {
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          <path d="M4 14.5c2.2-5.4 4.2-7.6 5.8-6.5 1.4 1 0 4.2 1.6 4.7 1.1.3 2.3-1 4.6-4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.5 15.5l3.2-.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    }
    if (kind === 'arrow') {
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          <path d="M15.5 4.5 5 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M5 15h6M5 15V9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
        <path d="M5 5h10M10 5v10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }
  const annotationDisabledReason = !selectedBug
    ? 'Select a marker before annotating'
    : !canAnnotateAtCursor
    ? '要在 marker 範圍內才能標記'
    : ''
  const svgPoint = (point: { x: number; y: number }) => `${(contentBox.x + point.x * contentBox.width) * 100},${(contentBox.y + point.y * contentBox.height) * 100}`
  const annotationLayer = selectedBug ? (
    <div
      className="pointer-events-none absolute inset-0 z-10 touch-none"
      data-testid="annotation-overlay"
    >
      <div
        className={`pointer-events-auto absolute inset-0 z-0 ${canAnnotateAtCursor ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
        onPointerDown={drawAnnotation}
        title={annotationDisabledReason || 'Choose an annotation tool, then mark the video.'}
      />
      {annotationBoxes.map(annotation => {
        const isTimedVisible = cursorMs >= annotation.startMs && cursorMs <= annotation.endMs
        const isEditing = editingAnnotation?.id === annotation.id
        if (!isTimedVisible && !isEditing) return null
        const isSelected = selectedAnnotationId === annotation.id
        const kind = annotation.kind ?? 'rect'
        const basePreviewRect = isEditing ? editingAnnotation.rect : annotation
        const previewRect = kind === 'text' && isSelected && textDraftHeights[annotation.id]
          ? { ...basePreviewRect, height: textDraftHeights[annotation.id] }
          : basePreviewRect
        const previewPoints = editingAnnotation?.id === annotation.id && editingAnnotation.points ? editingAnnotation.points : annotation.points ?? []
        const color = severityColor(severities, selectedBug.severity)
        const arrowTail = previewPoints[0] ?? { x: previewRect.x + previewRect.width, y: previewRect.y }
        const arrowHead = previewPoints[1] ?? { x: previewRect.x, y: previewRect.y + previewRect.height }
        const arrowTailLocal = localPointForRect(arrowTail, previewRect)
        const arrowHeadLocal = localPointForRect(arrowHead, previewRect)
        const arrowHeads = arrowHeadSegments(arrowTailLocal, arrowHeadLocal)
        if (kind === 'freehand' || kind === 'arrow') {
          return (
            <div key={annotation.id}>
              <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {kind === 'freehand' && (
                  <polyline
                    points={previewPoints.map(svgPoint).join(' ')}
                    fill="none"
                    stroke={hexToRgba(color, 0.7)}
                    strokeWidth="0.45"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              {kind === 'arrow' && (
                <svg
                  className="pointer-events-none absolute z-10"
                  style={cssRectForAnnotation(previewRect)}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line
                    x1={arrowTailLocal.x}
                    y1={arrowTailLocal.y}
                    x2={arrowHeadLocal.x}
                    y2={arrowHeadLocal.y}
                    stroke={hexToRgba(color, 0.7)}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {arrowHeads.map((line, index) => (
                    <line
                      key={index}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke={hexToRgba(color, 0.7)}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
              )}
              <div
                data-annotation-id={annotation.id}
                className={`absolute z-20 cursor-move rounded-sm ${isSelected ? 'ring-2 ring-white/80' : 'ring-1 ring-transparent'}`}
                style={{
                  ...cssRectForAnnotation(previewRect),
                  pointerEvents: 'auto',
                }}
                onPointerDown={(e) => moveAnnotation(annotation, 'move', e)}
                onClick={(e) => { e.stopPropagation(); onAnnotationSelect?.(annotation.id) }}
                title="Drag to move. Press Delete to remove."
              />
            </div>
          )
        }
        return (
          <div
            key={annotation.id}
            data-annotation-id={annotation.id}
            className={`absolute cursor-move border-2 ${isSelected ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.85),0_0_12px_rgba(255,255,255,0.75)]' : ''}`}
            style={{
              ...cssRectForAnnotation(previewRect),
              borderRadius: kind === 'ellipse' ? '50%' : undefined,
              borderColor: hexToRgba(color, 0.7),
              backgroundColor: kind === 'text' ? hexToRgba(color, 0.18) : 'transparent',
              opacity: 1,
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => moveAnnotation(annotation, 'move', e)}
            onClick={(e) => { e.stopPropagation(); onAnnotationSelect?.(annotation.id) }}
            title="Drag to move. Drag the corner to resize."
          >
            {kind === 'text' && (
              isSelected ? (
                <textarea
                  defaultValue={annotation.text || 'Text'}
                  ref={(el) => {
                    if (!el) return
                    el.style.height = 'auto'
                    el.style.height = `${el.scrollHeight}px`
                  }}
                  onInput={(e) => {
                    const target = e.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${target.scrollHeight}px`
                    const video = videoRef.current
                    const videoRect = video?.getBoundingClientRect()
                    const contentHeight = videoRect ? videoRect.height * contentBox.height : 0
                    if (contentHeight > 0) {
                      setTextDraftHeights(current => ({
                        ...current,
                        [annotation.id]: Math.max(0.06, Math.min(1 - previewRect.y, target.scrollHeight / contentHeight)),
                      }))
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const video = videoRef.current
                    const videoRect = video?.getBoundingClientRect()
                    const contentHeight = videoRect ? videoRect.height * contentBox.height : 0
                    const nextHeight = contentHeight > 0
                      ? Math.max(0.06, Math.min(1 - previewRect.y, e.currentTarget.scrollHeight / contentHeight))
                      : previewRect.height
                    setTextDraftHeights(current => {
                      const next = { ...current }
                      delete next[annotation.id]
                      return next
                    })
                    onAnnotationUpdate?.(annotation.id, { text: e.currentTarget.value, height: nextHeight })
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                  className="min-h-full w-full resize-none overflow-hidden bg-transparent px-1 py-0.5 text-xs font-semibold leading-snug text-white outline-none drop-shadow"
                  data-testid={`annotation-text-${annotation.id}`}
                />
              ) : (
                <div className="h-full w-full overflow-hidden px-1 py-0.5 text-xs font-semibold text-white drop-shadow">
                  {annotation.text || 'Text'}
                </div>
              )
            )}
            <div
              className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white/80 bg-zinc-950"
              style={{ backgroundColor: hexToRgba(color, 0.75) }}
              onPointerDown={(e) => moveAnnotation(annotation, 'resize', e)}
            />
          </div>
        )
      })}
      {draftAnnotation && (
        draftAnnotation.kind === 'freehand' ? (
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="annotation-draft">
            <polyline points={(draftAnnotation.points ?? []).map(svgPoint).join(' ')} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div
            className="pointer-events-none absolute border-2 border-white rounded-sm"
            style={{
              ...cssRectForAnnotation(draftAnnotation),
              borderRadius: draftAnnotation.kind === 'ellipse' ? '50%' : undefined,
            }}
            data-testid="annotation-draft"
          />
        )
      )}
    </div>
  ) : null
  const annotationToolPalette = (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900/80 p-1 shadow-xl">
        {annotationTools.map(tool => (
          <button
            key={tool.kind}
            type="button"
            onClick={() => setAnnotationTool(tool.kind)}
            disabled={!selectedBug || !canAnnotateAtCursor}
            className={`flex h-8 w-8 items-center justify-center rounded text-xs font-semibold ${
              annotationTool === tool.kind
                ? 'bg-blue-600 text-white ring-1 ring-blue-200'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            title={annotationDisabledReason || tool.title}
            aria-label={tool.title}
            data-testid={`annotation-tool-${tool.kind}`}
          >
            <AnnotationToolIcon kind={tool.kind} />
          </button>
        ))}
      </div>
      {annotationDisabledReason && selectedBug && (
        <div className="w-28 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-200">
          {annotationDisabledReason}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 w-full flex-col gap-2">
      <div className="mx-auto grid max-w-full grid-cols-[auto_minmax(0,auto)_auto] items-start justify-center gap-2">
        {annotationToolPalette}
        <div className="min-w-0">
          <div className="relative max-w-full">
            <video
              ref={videoRef}
              src={videoSrc}
              muted={mediaMuted}
              preload="metadata"
              onPlay={playMicWithVideo}
              onPause={pauseMicWithVideo}
              onTimeUpdate={() => { stopAtClipEnd(); syncMicToVideo() }}
              onSeeking={() => { updateCursorFromVideo(); syncMicToVideo() }}
              onSeeked={() => { updateCursorFromVideo(); syncMicToVideo() }}
              onLoadedMetadata={() => { updateCursorFromVideo(); syncMicToVideo(); updateVideoContentBox() }}
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
              className={`block max-w-full rounded-lg bg-black object-contain ${transcriptTokens.length > 0 || micAudioSrc ? 'max-h-[calc(100vh-350px)]' : 'max-h-[calc(100vh-280px)]'}`}
              data-testid="video-el"
            />
            {annotationLayer}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMediaMuted(v => !v)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-100 shadow ring-1 ring-white/10 hover:bg-zinc-700"
          title={mediaMuted ? 'Unmute' : 'Mute'}
          aria-label={mediaMuted ? 'Unmute' : 'Mute'}
          data-testid="video-mute"
        >
          <SpeakerIcon muted={mediaMuted} />
        </button>
      </div>
      {(transcriptTokens.length > 0 || micAudioSrc) && durationMs > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2" data-testid="transcript-debug">
          {micAudioSrc && (
            <audio
              ref={micAudioRef}
              src={micAudioSrc}
              preload="metadata"
              muted={mediaMuted}
              onLoadedMetadata={() => setMicTimeForSessionMs(cursorMs, true)}
              onSeeked={syncVideoFromMic}
              onTimeUpdate={syncVideoFromMic}
            />
          )}
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px] text-zinc-500">
            <span className="min-w-0 truncate">{transcriptTokens.length > 0 ? 'Transcript / MIC timeline' : 'MIC timeline'}</span>
            {transportControls}
            <span />
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
          {selectedBug?.annotations?.map(annotation => {
            const rawStartPct = timelinePctForMs(annotation.startMs)
            const rawEndPct = timelinePctForMs(annotation.endMs)
            if (annotation.endMs < viewportStartMs || annotation.startMs > viewportEndMs || rawEndPct <= rawStartPct) return null
            const startPct = Math.max(0, Math.min(100, rawStartPct))
            const endPct = Math.max(0, Math.min(100, rawEndPct))
            if (endPct <= startPct) return null
            const color = severityColor(severities, selectedBug.severity)
            const isSelectedAnnotation = annotation.id === selectedAnnotationId
            return (
              <div
                key={annotation.id}
                className={`pointer-events-none absolute top-6 h-1.5 -translate-y-1/2 rounded ${isSelectedAnnotation ? 'ring-1 ring-white/70' : ''}`}
                data-testid={`annotation-window-${annotation.id}`}
                style={{
                  left: `${startPct}%`,
                  width: `${Math.max(0.4, endPct - startPct)}%`,
                  backgroundColor: hexToRgba(color, isSelectedAnnotation ? 0.75 : 0.45),
                }}
                title={`Annotation: ${formatTimelineMs(annotation.startMs)} - ${formatTimelineMs(annotation.endMs)}`}
              />
            )
          })}
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
