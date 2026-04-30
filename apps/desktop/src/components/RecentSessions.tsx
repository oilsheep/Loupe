import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@shared/types'
import { api, assetUrl } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

interface RecentSessionsProps {
  onOpenSession(id: string): void
}

function formatSessionDate(ms: number): string {
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSessionDuration(ms: number | null): string {
  if (ms == null) return '-'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function sessionTitle(session: Session): string {
  return session.buildVersion.trim() || session.testNote.trim() || session.deviceModel || session.id
}

function sessionSubtitle(session: Session): string {
  return [session.deviceModel, session.tester, session.connectionMode.toUpperCase()].filter(Boolean).join(' · ')
}

async function loadSessionPreview(sessionId: string): Promise<string | null> {
  const loaded = await api.session.get(sessionId)
  const screenshotRel = loaded?.bugs.find(bug => bug.screenshotRel)?.screenshotRel
  return screenshotRel ? assetUrl(sessionId, screenshotRel) : null
}

function SessionPreview({ session, previewUrl }: { session: Session; previewUrl?: string }) {
  if (previewUrl) {
    return <img src={previewUrl} alt="" className="h-full w-full object-cover" />
  }
  return (
    <div className="flex h-full w-full flex-col justify-between bg-zinc-950 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-600">{session.connectionMode}</div>
      <div>
        <div className="truncate text-sm font-semibold text-zinc-300">{session.deviceModel || 'Loupe session'}</div>
        <div className="mt-1 text-xs text-zinc-600">{formatSessionDuration(session.durationMs)}</div>
      </div>
    </div>
  )
}

interface RecentSessionCardProps {
  session: Session
  previewUrl?: string
  opening: boolean
  compact?: boolean
  onSelect(id: string): void
  onDelete(session: Session): void
}

function RecentSessionCard({ session, previewUrl, opening, compact = false, onSelect, onDelete }: RecentSessionCardProps) {
  const { t } = useI18n()
  return (
    <div className="group relative min-w-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900/70 shadow-sm transition hover:border-zinc-700 hover:bg-zinc-900">
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        disabled={opening}
        className="block w-full text-left disabled:opacity-50"
      >
        <div className={compact ? 'aspect-[16/9] overflow-hidden bg-zinc-950' : 'aspect-[4/3] overflow-hidden bg-zinc-950'}>
          <SessionPreview session={session} previewUrl={previewUrl} />
        </div>
        <div className="p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-100">{sessionTitle(session)}</div>
              <div className="mt-1 truncate text-[11px] text-zinc-500">{sessionSubtitle(session) || t('home.noSessionNote')}</div>
            </div>
            <span className="shrink-0 rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-500">{formatSessionDuration(session.durationMs)}</span>
          </div>
          <div className="mt-2 truncate text-[11px] text-zinc-500">{formatSessionDate(session.startedAt)}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(session)}
        disabled={opening}
        className="absolute bottom-2 right-2 rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-500 opacity-0 transition hover:bg-red-950 hover:text-red-100 focus:opacity-100 disabled:opacity-50 group-hover:opacity-100"
      >
        {t('common.remove')}
      </button>
    </div>
  )
}

interface RecentSessionDialogProps {
  sessions: Session[]
  opening: boolean
  previewUrls: Record<string, string>
  onSelect(id: string): void
  onBrowse(): void
  onDelete(session: Session): void
  onCancel(): void
}

function RecentSessionDialog({ sessions, opening, previewUrls, onSelect, onBrowse, onDelete, onCancel }: RecentSessionDialogProps) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="recent-session-dialog">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-medium text-zinc-100">{t('home.moreSessionsTitle')}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('home.recentSessionsBody')}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">{t('home.noRecentSessions')}</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {sessions.map(session => (
                <RecentSessionCard
                  key={session.id}
                  session={session}
                  previewUrl={previewUrls[session.id]}
                  opening={opening}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={opening} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onBrowse} disabled={opening} className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50">
              {opening ? t('home.opening') : t('home.browseOtherSession')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RecentSessions({ onOpenSession }: RecentSessionsProps) {
  const { t } = useI18n()
  const [sessions, setSessions] = useState<Session[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const next = await api.session.list()
      setSessions(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])

  useEffect(() => {
    let cancelled = false
    const targets = sessions.slice(0, showMore ? 24 : 8).filter(session => !previewUrls[session.id])
    if (targets.length === 0) return
    void Promise.all(targets.map(async (session) => {
      try {
        const url = await loadSessionPreview(session.id)
        return url ? [session.id, url] as const : null
      } catch {
        return null
      }
    })).then(entries => {
      if (cancelled) return
      const pairs = entries.filter((entry): entry is readonly [string, string] => Boolean(entry))
      if (pairs.length === 0) return
      setPreviewUrls(prev => ({ ...prev, ...Object.fromEntries(pairs) }))
    })
    return () => { cancelled = true }
  }, [previewUrls, sessions, showMore])

  async function openSession(id: string) {
    setOpening(true)
    try {
      setShowMore(false)
      onOpenSession(id)
    } finally {
      setOpening(false)
    }
  }

  async function browseSession() {
    setOpening(true)
    try {
      const session = await api.session.openProject()
      setShowMore(false)
      if (session) onOpenSession(session.id)
    } finally {
      setOpening(false)
    }
  }

  async function deleteSession(session: Session) {
    if (!window.confirm(t('home.deleteSessionConfirm', { name: sessionTitle(session) }))) return
    setOpening(true)
    try {
      await api.session.discard(session.id)
      setSessions(prev => prev.filter(item => item.id !== session.id))
      setPreviewUrls(prev => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
    } finally {
      setOpening(false)
    }
  }

  const visible = sessions.slice(0, 8)

  return (
    <>
      {showMore && (
        <RecentSessionDialog
          sessions={sessions}
          opening={opening}
          previewUrls={previewUrls}
          onSelect={(id) => { void openSession(id) }}
          onBrowse={() => { void browseSession() }}
          onDelete={(session) => { void deleteSession(session) }}
          onCancel={() => setShowMore(false)}
        />
      )}
      <section className="mb-4 border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">{t('home.recentSessionsTitle')}</h2>
            <div className="mt-1 text-xs text-zinc-500">{t('home.recentSessionsInlineBody')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { void browseSession() }} disabled={opening} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
              {opening ? t('home.opening') : t('home.browseOtherSession')}
            </button>
            <button type="button" onClick={() => setShowMore(true)} disabled={sessions.length === 0} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
              {t('home.moreSessions')}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="rounded border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">{t('common.loading')}</div>
        ) : visible.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">{t('home.noRecentSessions')}</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {visible.map(session => (
              <RecentSessionCard
                key={session.id}
                session={session}
                previewUrl={previewUrls[session.id]}
                opening={opening}
                compact
                onSelect={(id) => { void openSession(id) }}
                onDelete={(session) => { void deleteSession(session) }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
