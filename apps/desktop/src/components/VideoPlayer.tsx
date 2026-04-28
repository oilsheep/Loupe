import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Bug } from '@shared/types'

export interface VideoPlayerHandle {
  seekToMs(ms: number): void
}

interface Props {
  src: string
  bugs: Bug[]
  durationMs: number
  selectedBugId: string | null
  onMarkerClick(bug: Bug): void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ src, bugs, durationMs, selectedBugId, onMarkerClick }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [, force] = useState(0)

  useImperativeHandle(ref, () => ({
    seekToMs(ms: number) {
      const v = videoRef.current; if (!v) return
      v.currentTime = Math.max(0, ms / 1000)
      v.play().catch(() => {})
    },
  }), [])

  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onLoaded = () => force(x => x + 1)
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <video ref={videoRef} src={src} controls className="w-full rounded-lg bg-black" data-testid="video-el" />
      <div className="relative h-3 rounded bg-zinc-800" data-testid="timeline">
        {bugs.map(b => {
          const left = durationMs ? (b.offsetMs / durationMs) * 100 : 0
          const colour = b.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'
          const ring = b.id === selectedBugId ? 'ring-2 ring-white' : ''
          return (
            <button
              key={b.id}
              onClick={() => onMarkerClick(b)}
              title={b.note}
              data-testid={`marker-${b.id}`}
              style={{ left: `calc(${left}% - 6px)` }}
              className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${colour} ${ring}`}
            />
          )
        })}
      </div>
    </div>
  )
})
VideoPlayer.displayName = 'VideoPlayer'
