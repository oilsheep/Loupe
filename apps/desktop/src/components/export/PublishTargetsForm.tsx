import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GitLabProject, GitLabPublishMode, ProfileSettings, SlackChannel, SlackPublishSettings, SlackThreadMode } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import { FIELD_LABEL, SEG_ACTIVE, SEG_IDLE } from '@/lib/controlStyles'
import { slackConnectionLabel } from '@/lib/connection'
import { GitLabProjectPicker } from '../GitLabProjectPicker'
import { SlackChannelPicker } from '../SlackChannelPicker'
import { SlackIcon, GitLabIcon, GoogleDriveIcon } from './BrandIcon'
import { PublishTargetRow } from './PublishTargetRow'

export interface MentionOption {
  id: string
  label: string
  detail: string
  hasSlack: boolean
  hasGitLab: boolean
  hasGoogle: boolean
  slackUserId?: string
}

export function formatManualSlackMentions(ids: string[]): string {
  return ids.filter(id => id.startsWith('!')).map(id => id.replace(/^!(here|channel|everyone)$/, '@$1')).join(', ')
}

function MentionProviderBadges({ hasSlack, hasGitLab, hasGoogle }: { hasSlack: boolean; hasGitLab: boolean; hasGoogle: boolean }) {
  if (!hasSlack && !hasGitLab && !hasGoogle) {
    return (
      <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        No mappings
      </span>
    )
  }
  return (
    <>
      {hasSlack && (
        <span className="rounded-full border border-sky-900/70 bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
          Slack
        </span>
      )}
      {hasGitLab && (
        <span className="rounded-full border border-orange-900/70 bg-orange-950/50 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
          GitLab
        </span>
      )}
      {hasGoogle && (
        <span className="rounded-full border border-emerald-900/70 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
          Google
        </span>
      )}
    </>
  )
}

export function RefreshOrConnectButton({ connected, refreshing, connecting, busy, onRefresh, onConnect, refreshLabel, connectLabel }: {
  connected: boolean
  refreshing: boolean
  connecting: boolean
  busy: boolean
  onRefresh(): void
  onConnect(): void
  refreshLabel: string
  connectLabel: string
}) {
  return connected ? (
    <button
      type="button"
      onClick={onRefresh}
      disabled={busy || refreshing}
      className="mt-5 shrink-0 rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
    >
      {refreshLabel}
    </button>
  ) : (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy || connecting}
      className="mt-5 shrink-0 rounded bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
    >
      {connectLabel}
    </button>
  )
}

interface MentionPickerProps {
  options: MentionOption[]
  selectedIds: string[]
  aliases: Record<string, string>
  dropdownMode?: 'absolute' | 'fixed'
  onChange(ids: string[]): void
}

export function MentionPicker({ options, selectedIds, aliases, dropdownMode = 'absolute', onChange }: MentionPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [fixedMenuStyle, setFixedMenuStyle] = useState<CSSProperties | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = new Set(selectedIds)
  const optionMap = new Map(options.map(option => [option.id, option]))
  const slackOptionMap = new Map(options.flatMap(option => option.slackUserId ? [[option.slackUserId, option] as const] : []))
  const labels = selectedIds.map(id => aliases[id] || optionMap.get(id)?.label || slackOptionMap.get(id)?.label || id)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter(option => [
        option.label,
        option.detail,
        option.id,
        option.hasSlack ? 'slack' : '',
        option.hasGitLab ? 'gitlab' : '',
        option.hasGoogle ? 'google' : '',
      ].some(value => value.toLowerCase().includes(normalizedQuery)))
    : options

  function optionSelected(option: MentionOption): boolean {
    return selected.has(option.id) || Boolean(option.slackUserId && selected.has(option.slackUserId))
  }

  function toggle(option: MentionOption) {
    const next = new Set(selected)
    if (optionSelected(option)) {
      next.delete(option.id)
      if (option.slackUserId) next.delete(option.slackUserId)
    } else {
      next.add(option.id)
    }
    onChange([...next])
  }

  useEffect(() => {
    if (!open) return
    function updateFixedMenuStyle() {
      if (dropdownMode !== 'fixed') return
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 4
      const margin = 16
      const width = Math.min(320, window.innerWidth - margin * 2)
      const maxHeight = Math.min(256, window.innerHeight - margin * 2)
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))
      const opensAbove = rect.bottom + gap + maxHeight > window.innerHeight - margin && rect.top > window.innerHeight - rect.bottom
      const top = opensAbove
        ? Math.max(margin, rect.top - gap - maxHeight)
        : Math.min(rect.bottom + gap, window.innerHeight - margin - maxHeight)
      setFixedMenuStyle({ position: 'fixed', top, left, width, maxHeight })
    }
    updateFixedMenuStyle()
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updateFixedMenuStyle)
    window.addEventListener('scroll', updateFixedMenuStyle, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updateFixedMenuStyle)
      window.removeEventListener('scroll', updateFixedMenuStyle, true)
    }
  }, [dropdownMode, open])

  return (
    <div ref={rootRef} className="relative" data-row-click-ignore="true">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="max-w-full rounded bg-zinc-700 px-2 py-1 text-left text-[11px] text-zinc-300 hover:bg-zinc-600"
      >
        {labels.length > 0 ? t('bug.mentionSelected', { people: labels.join(', ') }) : t('bug.mentionPeople')}
      </button>
      {open && (
        <div
          style={dropdownMode === 'fixed' ? fixedMenuStyle : undefined}
          className={`${dropdownMode === 'fixed' ? 'fixed z-[70]' : 'absolute z-20 mt-1 w-80'} max-h-64 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl`}
        >
          {options.length > 0 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              className="mb-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
          )}
          {options.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">{t('publish.refreshUsersHelp')}</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">{t('publish.noMatchingPeople')}</div>
          ) : filteredOptions.map(option => (
            <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={optionSelected(option)}
                onChange={() => toggle(option)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <MentionProviderBadges hasSlack={option.hasSlack} hasGitLab={option.hasGitLab} hasGoogle={option.hasGoogle} />
                </span>
              </span>
              <span className="max-w-24 shrink-0 truncate text-[10px] text-zinc-600">{option.detail || option.id}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export interface PublishTargetsFormProps {
  profiles: ProfileSettings[]
  selectedProfileId: string
  onSelectedProfileIdChange(value: string): void
  slackSettings: SlackPublishSettings | null
  slackConnected: boolean
  slackConnecting: boolean
  gitlabConnected: boolean
  gitlabConnecting: boolean
  googleDriveConnected: boolean
  googleConnecting: boolean
  canPublishGoogleDrive: boolean
  publishSlack: boolean
  publishGitLab: boolean
  publishGoogleDrive: boolean
  slackThreadMode: SlackThreadMode
  slackChannels: SlackChannel[]
  slackChannelId: string
  mentionOptions: MentionOption[]
  slackMentionIds: string[]
  slackMentionAliases: Record<string, string>
  slackDirectoryRefreshing: boolean
  slackDirectoryError: string
  gitlabMode: GitLabPublishMode
  gitlabProjectId: string
  gitlabProjects: GitLabProject[]
  gitlabProjectsRefreshing: boolean
  gitlabProjectsError: string
  busy: boolean
  onConnectSlack(): void
  onConnectGitLab(): void
  onConnectGoogle(): void
  onPublishSlackChange(v: boolean): void
  onPublishGitLabChange(v: boolean): void
  onPublishGoogleDriveChange(v: boolean): void
  onSlackThreadModeChange(v: SlackThreadMode): void
  onSlackChannelIdChange(v: string): void
  onSlackMentionIdsChange(v: string[]): void
  onSlackManualMentionInputChange(v: string): void
  onRefreshSlackDirectory(): void
  onGitLabModeChange(v: GitLabPublishMode): void
  onGitLabProjectIdChange(v: string): void
  onRefreshGitLabProjects(): void
}

export function PublishTargetsForm({
  profiles,
  selectedProfileId,
  onSelectedProfileIdChange,
  slackSettings,
  slackConnected,
  slackConnecting,
  gitlabConnected,
  gitlabConnecting,
  googleDriveConnected,
  googleConnecting,
  canPublishGoogleDrive,
  publishSlack,
  publishGitLab,
  publishGoogleDrive,
  slackThreadMode,
  slackChannels,
  slackChannelId,
  mentionOptions,
  slackMentionIds,
  slackMentionAliases,
  slackDirectoryRefreshing,
  slackDirectoryError,
  gitlabMode,
  gitlabProjectId,
  gitlabProjects,
  gitlabProjectsRefreshing,
  gitlabProjectsError,
  busy,
  onConnectSlack,
  onConnectGitLab,
  onConnectGoogle,
  onPublishSlackChange,
  onPublishGitLabChange,
  onPublishGoogleDriveChange,
  onSlackThreadModeChange,
  onSlackChannelIdChange,
  onSlackMentionIdsChange,
  onSlackManualMentionInputChange,
  onRefreshSlackDirectory,
  onGitLabModeChange,
  onGitLabProjectIdChange,
  onRefreshGitLabProjects,
}: PublishTargetsFormProps) {
  const isSlack = publishSlack
  const isGitLab = publishGitLab
  const { t } = useI18n()

  return (
    <>
      {profiles.length > 0 && (
        <label className={`block ${FIELD_LABEL}`}>
          {t('export.profile')}
          <select
            aria-label={t('export.profile')}
            value={selectedProfileId}
            onChange={(e) => onSelectedProfileIdChange(e.target.value)}
            className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      <PublishTargetRow
        icon={<SlackIcon />}
        name="Slack"
        connected={slackConnected}
        connecting={slackConnecting}
        connectionLabel={slackConnectionLabel(slackSettings, t)}
        connectLabel={slackConnecting ? t('publish.connecting') : t('publish.connectSlack')}
        enabled={publishSlack}
        onToggle={onPublishSlackChange}
        onConnect={onConnectSlack}
      >
        {isSlack && (
          <div className="mt-3 space-y-3 border-t border-blue-900/60 pt-3">
            {slackSettings?.publishIdentity === 'bot' && (
              <div className="rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-100/80">
                {t('publish.botTokenChannelHelp')}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className={`min-w-0 flex-1 ${FIELD_LABEL}`}>
                  {t('publish.channel')}
                  <SlackChannelPicker
                    channels={slackChannels}
                    value={slackChannelId}
                    onChange={onSlackChannelIdChange}
                    disabled={busy}
                    loading={slackDirectoryRefreshing}
                    onOpen={() => {
                      if (slackChannels.length === 0 && !slackDirectoryRefreshing) onRefreshSlackDirectory()
                    }}
                  />
                </label>
                <RefreshOrConnectButton
                  connected={slackConnected}
                  refreshing={slackDirectoryRefreshing}
                  connecting={slackConnecting}
                  busy={busy}
                  onRefresh={onRefreshSlackDirectory}
                  onConnect={onConnectSlack}
                  refreshLabel={slackDirectoryRefreshing ? t('publish.refreshing') : t('publish.refresh')}
                  connectLabel={slackConnecting ? t('publish.connecting') : t('publish.connectSlack')}
                />
              </div>
              {slackDirectoryError && <div className="mt-1 text-xs text-red-300">{slackDirectoryError}</div>}
              {slackChannels.length === 0 && !slackDirectoryError && (
                <div className="mt-1 text-xs text-zinc-500">{t('publish.reconnectSlackHelp')}</div>
              )}
            </div>

            <div>
              <div className={FIELD_LABEL}>{t('publish.mentions')}</div>
              <div className="mt-1">
                <MentionPicker
                  options={mentionOptions}
                  selectedIds={slackMentionIds}
                  aliases={slackMentionAliases}
                  dropdownMode="fixed"
                  onChange={(ids) => {
                    onSlackMentionIdsChange(ids)
                    onSlackManualMentionInputChange(formatManualSlackMentions(ids))
                  }}
                />
              </div>
            </div>

            <div>
              <div className={FIELD_LABEL}>{t('publish.slackThreadLayout')}</div>
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t('publish.slackPublishMode')}>
                <button
                  type="button"
                  onClick={() => onSlackThreadModeChange('single-thread')}
                  className={`rounded px-3 py-2 text-sm ${slackThreadMode === 'single-thread' ? SEG_ACTIVE : SEG_IDLE}`}
                >
                  {t('publish.singleThread')}
                </button>
                <button
                  type="button"
                  onClick={() => onSlackThreadModeChange('per-marker-thread')}
                  className={`rounded px-3 py-2 text-sm ${slackThreadMode === 'per-marker-thread' ? SEG_ACTIVE : SEG_IDLE}`}
                >
                  {t('publish.perMarkerThread')}
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                {t('publish.markerMentionHelp')}
              </div>
            </div>
          </div>
        )}
      </PublishTargetRow>

      <PublishTargetRow
        icon={<GitLabIcon />}
        name="GitLab"
        connected={gitlabConnected}
        connecting={gitlabConnecting}
        connectionLabel={gitlabConnected ? t('publish.connectedByOAuth') : t('publish.notConnected')}
        connectLabel={gitlabConnecting ? t('publish.connecting') : t('publish.connectGitLab')}
        enabled={publishGitLab}
        onToggle={onPublishGitLabChange}
        onConnect={onConnectGitLab}
      >
        {isGitLab && (
          <div className="mt-3 space-y-3 border-t border-sky-900/60 pt-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className={`min-w-0 flex-1 ${FIELD_LABEL}`}>
                  {t('export.project')}
                  <GitLabProjectPicker
                    projects={gitlabProjects}
                    value={gitlabProjectId}
                    loading={gitlabProjectsRefreshing}
                    onOpen={() => {
                      if (gitlabProjects.length === 0 && !gitlabProjectsRefreshing) onRefreshGitLabProjects()
                    }}
                    onChange={onGitLabProjectIdChange}
                  />
                </label>
                <RefreshOrConnectButton
                  connected={gitlabConnected}
                  refreshing={gitlabProjectsRefreshing}
                  connecting={gitlabConnecting}
                  busy={busy}
                  onRefresh={onRefreshGitLabProjects}
                  onConnect={onConnectGitLab}
                  refreshLabel={gitlabProjectsRefreshing ? t('publish.refreshing') : t('publish.refresh')}
                  connectLabel={gitlabConnecting ? t('publish.connecting') : t('publish.connectGitLab')}
                />
              </div>
              {gitlabProjectsError && <div className="mt-1 text-xs text-red-300">{gitlabProjectsError}</div>}
              {gitlabProjects.length === 0 && !gitlabProjectsError && (
                <div className="mt-1 text-xs text-zinc-500">{t('publish.gitlabProjectHelp')}</div>
              )}
            </div>

            <div>
              <div className={FIELD_LABEL}>{t('publish.gitlabMode')}</div>
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t('publish.gitlabMode')}>
                <button
                  type="button"
                  onClick={() => onGitLabModeChange('single-issue')}
                  className={`rounded px-3 py-2 text-sm ${gitlabMode === 'single-issue' ? SEG_ACTIVE : SEG_IDLE}`}
                >
                  {t('publish.singleIssue')}
                </button>
                <button
                  type="button"
                  onClick={() => onGitLabModeChange('per-marker-issue')}
                  className={`rounded px-3 py-2 text-sm ${gitlabMode === 'per-marker-issue' ? SEG_ACTIVE : SEG_IDLE}`}
                >
                  {t('publish.issuePerMarker')}
                </button>
              </div>
            </div>
          </div>
        )}
      </PublishTargetRow>

      <PublishTargetRow
        icon={<GoogleDriveIcon />}
        name="Google Drive"
        connected={googleDriveConnected}
        connecting={googleConnecting}
        connectionLabel={googleDriveConnected ? t('publish.connectedByOAuth') : t('publish.notConnected')}
        connectLabel={googleConnecting ? t('publish.connecting') : t('publish.connectGoogle')}
        enabled={publishGoogleDrive}
        disabledReason={googleDriveConnected && !canPublishGoogleDrive ? t('publish.googleNeedsDriveFolder') : undefined}
        onToggle={onPublishGoogleDriveChange}
        onConnect={onConnectGoogle}
      >
        {googleDriveConnected && <p className="text-[11px] text-zinc-500">{t('publish.driveFolderInPrefs')}</p>}
      </PublishTargetRow>
    </>
  )
}
