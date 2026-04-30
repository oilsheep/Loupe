import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent } from 'react'
import type { Bug, DesktopApi } from '@shared/types'
import { localFileUrl } from '@/lib/api'

export interface VideoPlayerHandle {
  seekToMs(ms: number): void
  playWindow(startMs: number, endMs: number): void
  currentTimeMs(): number
}

interface Props {
  api: DesktopApi
  src: string
  micAudioSrc?: string | null
  bugs: Bug[]
  durationMs: number
  selectedBugId: string | null
  onMarkerClick(bug: Bug): void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ api, src, micAudioSrc, bugs, durationMs, selectedBugId, onMarkerClick }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const micAudioRef = useRef<HTMLAudioElement>(null)
  const clipEndMsRef = useRef<number | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [videoSrc, setVideoSrc] = useState(src)
  const [micMuted, setMicMuted] = useState(false)
  const [cursorMs, setCursorMs] = useState(0)
  const selectedBug = bugs.find(b => b.id === selectedBugId) ?? null
  const cursorPct = durationMs ? Math.max(0, Math.min(100, (cursorMs / durationMs) * 100)) : 0
  const selectionStartPct = selectedBug && durationMs
    ? Math.max(0, Math.min(100, ((selectedBug.offsetMs - selectedBug.preSec * 1000) / durationMs) * 100))
    : 0
  const selectionEndPct = selectedBug && durationMs
    ? Math.max(0, Math.min(100, ((selectedBug.offsetMs + selectedBug.postSec * 1000) / durationMs) * 100))
    : 0

  useImperativeHandle(ref, () => ({
    seekToMs(ms: number) {
      const v = videoRef.current; if (!v) return
      const nextMs = Math.max(0, ms)
      clipEndMsRef.current = null
      v.currentTime = nextMs / 1000
      setCursorMs(nextMs)
    },
    playWindow(startMs: number, endMs: number) {
      const v = videoRef.current; if (!v) return
      const start = Math.max(0, startMs)
      const end = Math.max(start, endMs)
      clipEndMsRef.current = end
      v.currentTime = start / 1000
      setCursorMs(start)
      v.play().catch(() => {})
    },
    currentTimeMs() {
      const v = videoRef.current
      return v ? v.currentTime * 1000 : 0
    },
  }), [])

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

  function stopAtClipEnd() {
    const video = videoRef.current
    const clipEndMs = clipEndMsRef.current
    if (!video || clipEndMs === null) return
    setCursorMs(video.currentTime * 1000)
    if (video.currentTime * 1000 >= clipEndMs) {
      video.pause()
      video.currentTime = clipEndMs / 1000
      setCursorMs(clipEndMs)
      clipEndMsRef.current = null
    }
  }

  function updateCursorFromVideo() {
    const video = videoRef.current
    if (!video) return
    setCursorMs(video.currentTime * 1000)
  }

  function syncMicToVideo() {
    const video = videoRef.current
    const audio = micAudioRef.current
    if (!video || !audio) return
    if (Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime
  }

  function playMicWithVideo() {
    syncMicToVideo()
    micAudioRef.current?.play().catch(() => {})
  }

  function pauseMicWithVideo() {
    micAudioRef.current?.pause()
  }

  function seekFromTimeline(e: MouseEvent<HTMLDivElement>) {
    const video = videoRef.current
    if (!video || durationMs <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    clipEndMsRef.current = null
    video.pause()
    video.currentTime = (durationMs * pct) / 1000
    setCursorMs(durationMs * pct)
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        preload="metadata"
        onPlay={playMicWithVideo}
        onPause={pauseMicWithVideo}
        onTimeUpdate={() => { stopAtClipEnd(); syncMicToVideo() }}
        onSeeked={() => { updateCursorFromVideo(); syncMicToVideo() }}
        onLoadedMetadata={updateCursorFromVideo}
        onError={(e) => {
          const mediaError = e.currentTarget.error
          console.warn('Loupe: video element failed', {
            code: mediaError?.code,
            message: mediaError?.message,
            src: e.currentTarget.currentSrc,
          })
        }}
        className="mx-auto block max-h-[calc(100vh-190px)] max-w-full rounded-lg bg-black object-contain"
        data-testid="video-el"
      />
      {micAudioSrc && (
        <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300" data-testid="mic-track-controls">
          <audio ref={micAudioRef} src={micAudioSrc} preload="metadata" muted={micMuted} />
          <div>
            <div className="font-medium text-zinc-200">Session MIC track</div>
            <div className="text-zinc-500">Synced with review playback</div>
          </div>
          <button
            type="button"
            onClick={() => setMicMuted(v => !v)}
            className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
            data-testid="mic-track-mute"
          >
            {micMuted ? 'Unmute MIC' : 'Mute MIC'}
          </button>
        </div>
      )}
      <div className="relative h-4 cursor-pointer rounded bg-zinc-800" data-testid="timeline" onClick={seekFromTimeline}>
        {selectedBug && durationMs > 0 && selectionEndPct > selectionStartPct && (
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-blue-500/30 ring-1 ring-blue-300/40"
            data-testid="selected-clip-window"
            style={{ left: `${selectionStartPct}%`, width: `${selectionEndPct - selectionStartPct}%` }}
            title={`Export range: -${selectedBug.preSec}s / +${selectedBug.postSec}s`}
          />
        )}
        {durationMs > 0 && (
          <div
            className="pointer-events-none absolute top-1/2 z-10 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            data-testid="playhead"
            style={{ left: `${cursorPct}%` }}
          />
        )}
        {bugs.map(b => {
          const left = durationMs ? Math.max(0, Math.min(100, (b.offsetMs / durationMs) * 100)) : 0
          const colour = b.severity === 'major'
            ? 'bg-red-500'
            : b.severity === 'minor'
              ? 'bg-sky-500'
              : b.severity === 'improvement'
                ? 'bg-emerald-500'
                : b.severity === 'note'
                  ? 'bg-zinc-300'
                  : 'bg-amber-500'
          const ring = b.id === selectedBugId ? 'ring-2 ring-white shadow-[0_0_10px_rgba(255,255,255,0.75)]' : ''
          const url = thumbs[b.id]
          return (
            <div
              key={b.id}
              className="group absolute top-1/2 -translate-y-1/2"
              style={{ left: `calc(${left}% - 2px)` }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onMarkerClick(b) }}
                data-testid={`marker-${b.id}`}
                className={`block h-3.5 w-1 rounded-sm ${colour} ${ring}`}
              />
              <div
                className="invisible absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl group-hover:visible"
                data-testid={`tooltip-${b.id}`}
              >
                {url
                  ? <img src={url} alt="" className="mb-2 w-full rounded" />
                  : <div className="mb-2 h-20 w-full rounded bg-zinc-800 text-center text-[10px] leading-[5rem] text-zinc-500">no screenshot</div>
                }
                <div className="font-mono text-[10px] text-zinc-400">{Math.floor(b.offsetMs / 1000)}s · {b.severity}</div>
                <div className="line-clamp-3 text-xs text-zinc-200">{b.note}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
VideoPlayer.displayName = 'VideoPlayer'
