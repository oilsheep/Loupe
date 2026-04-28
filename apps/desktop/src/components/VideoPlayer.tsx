import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Bug, DesktopApi } from '@shared/types'
import { localFileUrl } from '@/lib/api'

export interface VideoPlayerHandle {
  seekToMs(ms: number): void
}

interface Props {
  api: DesktopApi
  src: string
  bugs: Bug[]
  durationMs: number
  selectedBugId: string | null
  onMarkerClick(bug: Bug): void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ api, src, bugs, durationMs, selectedBugId, onMarkerClick }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useImperativeHandle(ref, () => ({
    seekToMs(ms: number) {
      const v = videoRef.current; if (!v) return
      v.currentTime = Math.max(0, ms / 1000)
      v.play().catch(() => {})
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

  return (
    <div className="flex flex-col gap-2">
      <video ref={videoRef} src={src} controls className="w-full rounded-lg bg-black" data-testid="video-el" />
      <div className="relative h-3 rounded bg-zinc-800" data-testid="timeline">
        {bugs.map(b => {
          const left = durationMs ? (b.offsetMs / durationMs) * 100 : 0
          const colour = b.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'
          const ring = b.id === selectedBugId ? 'ring-2 ring-white' : ''
          const url = thumbs[b.id]
          return (
            <div
              key={b.id}
              className="group absolute top-1/2 -translate-y-1/2"
              style={{ left: `calc(${left}% - 6px)` }}
            >
              <button
                onClick={() => onMarkerClick(b)}
                data-testid={`marker-${b.id}`}
                className={`block h-3 w-3 rounded-full ${colour} ${ring}`}
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
