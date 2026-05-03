import { useEffect, useMemo, useState } from 'react'
import type { AudioAnalysisProgress } from '@shared/types'
import { useI18n } from '@/lib/i18n'

interface Props {
  progress: AudioAnalysisProgress | null
  error?: string | null
  sourceLabel?: 'microphone' | 'video'
  mediaDurationMs?: number | null
  onCancel(): void
  onBackground(): void
}

function realProgressPercent(progress: AudioAnalysisProgress | null): number {
  if (!progress || progress.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)))
}

function fmtTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms))
  const totalSeconds = Math.ceil(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function estimateTranscribeMs(mediaDurationMs: number | null | undefined): number {
  if (!mediaDurationMs || mediaDurationMs <= 0) return 90_000
  return Math.max(30_000, Math.min(45 * 60_000, mediaDurationMs * 0.8))
}

export function AudioAnalysisWaitDialog({
  progress,
  error,
  sourceLabel = 'microphone',
  mediaDurationMs,
  onCancel,
  onBackground,
}: Props) {
  const { resolvedLocale } = useI18n()
  const zh = resolvedLocale.startsWith('zh')
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const elapsedMs = now - startedAt
  const isTranscribing = progress?.phase === 'transcribe'
  const estimatedMs = useMemo(() => estimateTranscribeMs(mediaDurationMs), [mediaDurationMs])
  const realPercent = realProgressPercent(progress)
  const estimatedTranscribePercent = isTranscribing
    ? 25 + Math.min(54, Math.floor((Math.min(elapsedMs, estimatedMs) / estimatedMs) * 54))
    : realPercent
  const displayPercent = progress?.phase === 'complete'
    ? 100
    : Math.max(realPercent, estimatedTranscribePercent)
  const etaMs = isTranscribing ? Math.max(0, estimatedMs - elapsedMs) : null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="text-lg font-semibold text-zinc-100">
          {zh ? '正在進行語音分析' : 'Analyzing audio'}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {zh
            ? sourceLabel === 'video'
              ? 'Loupe 正在使用影片音軌進行 STT，自動建立可編輯點位。長影片會花一些時間，可以留在這裡等待，或先進入 review 讓它背景處理。'
              : 'Loupe 正在分析 QA 麥克風錄音，自動建立可編輯點位。可以留在這裡等待，或先進入 review 讓它背景處理。'
            : sourceLabel === 'video'
              ? 'Loupe is transcribing the video audio and creating editable markers. Long videos can take a while; you can wait here or continue to review in the background.'
              : 'Loupe is transcribing QA microphone audio and creating editable markers. You can wait here or continue to review in the background.'}
        </p>
        <div className="mt-5 rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
            <span className="min-w-0 truncate">{progress?.message ?? (zh ? '準備語音分析' : 'Preparing audio analysis')}</span>
            <span className="font-mono tabular-nums text-zinc-400">{displayPercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full bg-blue-500 transition-all duration-700 ${isTranscribing ? 'animate-pulse' : ''}`}
              style={{ width: `${displayPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>{zh ? '已用時間' : 'Elapsed'} {fmtTime(elapsedMs)}</span>
            <span>
              {etaMs !== null
                ? `${zh ? '預估剩餘' : 'ETA'} ${fmtTime(etaMs)}`
                : progress?.phase === 'complete'
                  ? (zh ? '完成' : 'Complete')
                  : (zh ? '處理中' : 'Working')}
            </span>
          </div>
          <div className="mt-2 min-h-5 break-words text-xs leading-relaxed text-zinc-500">
            {error || progress?.detail || (zh ? '請稍候，分析期間 session 內容不會遺失。' : 'Please wait. Session data is safe during analysis.')}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            {zh ? '取消分析' : 'Cancel analysis'}
          </button>
          <button
            type="button"
            onClick={onBackground}
            className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
          >
            {zh ? '背景處理' : 'Continue in background'}
          </button>
        </div>
      </div>
    </div>
  )
}
