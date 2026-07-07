import { useState } from 'react'
import type { CommonSessionSettings, ExportProgress, GitLabProject, GitLabPublishMode, ProfileSettings, SlackChannel, SlackPublishSettings, SlackThreadMode } from '@shared/types'
import type { ExportQuality } from '@shared/exportQuality'
import { exportConfirmSummary } from '@shared/exportConfirmSummary'
import { DEFAULT_REPORT_TITLE } from '@shared/reportTitle'
import { useI18n } from '@/lib/i18n'
import { BTN_PRIMARY, BTN_SECONDARY, FIELD_LABEL } from '@/lib/controlStyles'
import { SuggestInput } from '../SuggestInput'
import { QualitySelector } from './QualitySelector'
import { PublishTargetsForm } from './PublishTargetsForm'
import type { MentionOption } from './PublishTargetsForm'
export type { MentionOption } from './PublishTargetsForm'
export { MentionPicker, formatManualSlackMentions } from './PublishTargetsForm'

export interface ExportConfirmDialogProps {
  count: number
  outputRoot: string
  buildVersion: string
  platform: string
  project: string
  tester: string
  testNote: string
  commonSession: CommonSessionSettings
  profiles: ProfileSettings[]
  selectedProfileId: string
  onSelectedProfileIdChange(value: string): void
  includeLogcat: boolean
  includeMicTrack: boolean
  includeOriginalFiles: boolean
  mergeOriginalAudio: boolean
  hasSessionMicTrack: boolean
  hasMarkerAudioNotes: boolean
  slackSettings: SlackPublishSettings | null
  slackConnected: boolean
  gitlabConnected: boolean
  googleDriveConnected: boolean
  canPublishGoogleDrive: boolean
  slackConnecting: boolean
  gitlabConnecting: boolean
  googleConnecting: boolean
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
  error: string
  canceling: boolean
  progress: ExportProgress | null
  hasMissingNotes: boolean
  hasChangesSinceExport?: boolean
  reportTitle: string
  onReportTitleChange(value: string): void
  onOutputRootChange(value: string): void
  onBuildVersionChange(value: string): void
  onPlatformChange(value: string): void
  onProjectChange(value: string): void
  onTesterChange(value: string): void
  onTestNoteChange(value: string): void
  /** Persist the session metadata fields (called on field blur) so edits are
   *  saved as you make them, not only on export. */
  onCommitMetadata?(): void
  exportQuality: ExportQuality
  onExportQualityChange(value: ExportQuality): void
  onIncludeLogcatChange(value: boolean): void
  onIncludeMicTrackChange(value: boolean): void
  onIncludeOriginalFilesChange(value: boolean): void
  onMergeOriginalAudioChange(value: boolean): void
  onConnectSlack(): void
  onConnectGitLab(): void
  onConnectGoogle(): void
  onPublishSlackChange(value: boolean): void
  onPublishGitLabChange(value: boolean): void
  onPublishGoogleDriveChange(value: boolean): void
  onSlackThreadModeChange(value: SlackThreadMode): void
  onSlackChannelIdChange(value: string): void
  onSlackMentionIdsChange(value: string[]): void
  onSlackManualMentionInputChange(value: string): void
  onRefreshSlackDirectory(): void
  onGitLabModeChange(value: GitLabPublishMode): void
  onGitLabProjectIdChange(value: string): void
  onRefreshGitLabProjects(): void
  onBrowseOutputRoot(): void
  onCancel(): void
  onConfirm(): void
}

export function ExportConfirmDialog({
  count,
  outputRoot,
  buildVersion,
  platform,
  project,
  tester,
  testNote,
  commonSession,
  profiles,
  selectedProfileId,
  onSelectedProfileIdChange,
  exportQuality,
  onExportQualityChange,
  includeLogcat,
  includeMicTrack,
  includeOriginalFiles,
  mergeOriginalAudio,
  hasSessionMicTrack,
  hasMarkerAudioNotes,
  slackSettings,
  slackConnected,
  gitlabConnected,
  googleDriveConnected,
  canPublishGoogleDrive,
  slackConnecting,
  gitlabConnecting,
  googleConnecting,
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
  error,
  canceling,
  progress,
  hasMissingNotes,
  hasChangesSinceExport,
  reportTitle,
  onReportTitleChange,
  onOutputRootChange,
  onBuildVersionChange,
  onPlatformChange,
  onProjectChange,
  onTesterChange,
  onTestNoteChange,
  onCommitMetadata,
  onIncludeLogcatChange,
  onIncludeMicTrackChange,
  onIncludeOriginalFilesChange,
  onMergeOriginalAudioChange,
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
  onBrowseOutputRoot,
  onCancel,
  onConfirm,
}: ExportConfirmDialogProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<0 | 1>(0)
  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" data-testid="export-dialog">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-2xl">
        <div className="shrink-0 px-4 pt-4">
          <div className="text-sm font-medium text-zinc-100">{count === 0 ? t('export.title.noMarkers') : count === 1 ? t('export.title.one') : t('export.title.many', { count })}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('export.body')}</div>
        </div>

        <div className="grid shrink-0 grid-cols-2 px-4 pt-3" role="tablist" aria-label={t('export.title.many', { count })}>
          {([['0', t('export.step.details')], ['1', t('export.step.publish')]] as const).map(([s, label]) => {
            const i = Number(s) as 0 | 1
            const state = i === step ? 'active' : i < step ? 'done' : 'todo'
            return (
              <button key={s} type="button" role="tab" onClick={() => setStep(i)}
                className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-1.5 pb-2.5 pt-1.5 text-xs ${
                  state === 'active' ? 'border-blue-600 text-zinc-100'
                  : state === 'done' ? 'border-zinc-700 text-zinc-100'
                  : 'border-zinc-700 text-zinc-500'}`}>
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border text-[11px] ${
                  state === 'active' ? 'border-blue-600 bg-blue-600 font-semibold text-white'
                  : state === 'done' ? 'border-zinc-600 bg-zinc-600 text-zinc-100' : 'border-current'}`}>{i + 1}</span>
                <span className="min-w-0 truncate">{label}</span>
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="export-scroll-body">
          {step === 0 && (
            <div>
              {(hasChangesSinceExport || hasMissingNotes) && (
                <div className="mb-3 space-y-1 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  {hasChangesSinceExport && <div>{t('export.staleHint')}</div>}
                  {hasMissingNotes && <div>{t('export.missingNotes')}</div>}
                </div>
              )}
              <label className={`block ${FIELD_LABEL}`}>
                {t('export.outputFolder')}
                <div className="mt-1 flex gap-2">
                  <input
                    value={outputRoot}
                    onChange={(e) => onOutputRootChange(e.target.value)}
                    className="min-w-0 flex-1 rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    autoFocus
                  />
                  <button type="button" onClick={onBrowseOutputRoot} disabled={busy} className={BTN_SECONDARY}>
                    {t('common.browse')}
                  </button>
                </div>
              </label>

              <label className={`mt-3 block ${FIELD_LABEL}`}>
                {t('export.reportTitle')}
                <input
                  value={reportTitle}
                  onChange={(e) => onReportTitleChange(e.target.value)}
                  onBlur={() => onCommitMetadata?.()}
                  placeholder={DEFAULT_REPORT_TITLE}
                  className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>

              <label className={`mt-3 block ${FIELD_LABEL}`}>
                {t('new.buildVersion')}
                <input
                  value={buildVersion}
                  onChange={(e) => onBuildVersionChange(e.target.value)}
                  onBlur={() => onCommitMetadata?.()}
                  placeholder="1.4.2-RC3"
                  className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className={FIELD_LABEL}>
                  {t('export.platform')}
                  <SuggestInput
                    value={platform}
                    suggestions={commonSession.platforms}
                    ariaLabel={t('export.platform')}
                    placeholder="android"
                    onChange={onPlatformChange}
                    onCommit={() => onCommitMetadata?.()}
                  />
                </label>
                <label className={FIELD_LABEL}>
                  {t('export.project')}
                  <input
                    value={project}
                    onChange={(e) => onProjectChange(e.target.value)}
                    onBlur={() => onCommitMetadata?.()}
                    placeholder={t('export.project')}
                    className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className={FIELD_LABEL}>
                  {t('export.tester')}
                  <SuggestInput
                    value={tester}
                    suggestions={commonSession.testers}
                    ariaLabel={t('export.tester')}
                    placeholder={t('export.qaName')}
                    onChange={onTesterChange}
                    onCommit={() => onCommitMetadata?.()}
                  />
                </label>
                <label className={FIELD_LABEL}>
                  {t('export.testNote')}
                  <input
                    value={testNote}
                    onChange={(e) => onTestNoteChange(e.target.value)}
                    onBlur={() => onCommitMetadata?.()}
                    placeholder={t('export.scope')}
                    className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={includeLogcat}
                  onChange={(e) => onIncludeLogcatChange(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                {t('export.includeLogcat')}
              </label>

              <div className="mt-3">
                <QualitySelector value={exportQuality} onChange={onExportQualityChange} />
              </div>

              {hasSessionMicTrack && (
                <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={includeMicTrack}
                    onChange={(e) => onIncludeMicTrackChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <span className="block text-zinc-300">{t('export.useMicTrack')}</span>
                    {hasMarkerAudioNotes && (
                      <span className="mt-1 block text-amber-300">{t('export.useMicTrackWarning')}</span>
                    )}
                  </span>
                </label>
              )}

              <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  aria-label={t('export.includeOriginalFiles')}
                  data-testid="include-original-files"
                  checked={includeOriginalFiles}
                  onChange={(e) => {
                    onIncludeOriginalFilesChange(e.target.checked)
                    if (!e.target.checked) onMergeOriginalAudioChange(false)
                  }}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                  <span className="block text-zinc-300">{t('export.includeOriginalFiles')}</span>
                  <span className="mt-1 block text-zinc-500">{t('export.includeOriginalFilesHelp')}</span>
                </span>
              </label>

              {includeOriginalFiles && hasSessionMicTrack && (
                <label className="ml-6 mt-2 flex items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    aria-label={t('export.mergeOriginalAudio')}
                    data-testid="merge-original-audio"
                    checked={mergeOriginalAudio}
                    onChange={(e) => onMergeOriginalAudioChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <span className="block text-zinc-300">{t('export.mergeOriginalAudio')}</span>
                    <span className="mt-1 block text-zinc-500">{t('export.mergeOriginalAudioHelp')}</span>
                  </span>
                </label>
              )}

              {count === 0 && (
                <div className="mt-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  {t('export.noMarkersBody')}
                </div>
              )}

              {error && (
                <div className="mt-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              {error && (
                <div className="mb-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</div>
              )}
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-zinc-300">{t('publish.title')}</div>
                  <div className="mt-1 text-xs text-zinc-500">{t('publish.localAlways')}</div>
                </div>
                <PublishTargetsForm
                  profiles={profiles} selectedProfileId={selectedProfileId} onSelectedProfileIdChange={onSelectedProfileIdChange}
                  slackSettings={slackSettings} slackConnected={slackConnected} slackConnecting={slackConnecting}
                  gitlabConnected={gitlabConnected} gitlabConnecting={gitlabConnecting}
                  googleDriveConnected={googleDriveConnected} googleConnecting={googleConnecting} canPublishGoogleDrive={canPublishGoogleDrive}
                  publishSlack={publishSlack} publishGitLab={publishGitLab} publishGoogleDrive={publishGoogleDrive}
                  slackThreadMode={slackThreadMode} slackChannels={slackChannels} slackChannelId={slackChannelId}
                  mentionOptions={mentionOptions} slackMentionIds={slackMentionIds} slackMentionAliases={slackMentionAliases}
                  slackDirectoryRefreshing={slackDirectoryRefreshing} slackDirectoryError={slackDirectoryError}
                  gitlabMode={gitlabMode} gitlabProjectId={gitlabProjectId} gitlabProjects={gitlabProjects}
                  gitlabProjectsRefreshing={gitlabProjectsRefreshing} gitlabProjectsError={gitlabProjectsError} busy={busy}
                  onConnectSlack={onConnectSlack} onConnectGitLab={onConnectGitLab} onConnectGoogle={onConnectGoogle}
                  onPublishSlackChange={onPublishSlackChange} onPublishGitLabChange={onPublishGitLabChange} onPublishGoogleDriveChange={onPublishGoogleDriveChange}
                  onSlackThreadModeChange={onSlackThreadModeChange} onSlackChannelIdChange={onSlackChannelIdChange}
                  onSlackMentionIdsChange={onSlackMentionIdsChange} onSlackManualMentionInputChange={onSlackManualMentionInputChange}
                  onRefreshSlackDirectory={onRefreshSlackDirectory} onGitLabModeChange={onGitLabModeChange}
                  onGitLabProjectIdChange={onGitLabProjectIdChange} onRefreshGitLabProjects={onRefreshGitLabProjects}
                />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-700 bg-zinc-800 px-4 py-3" data-testid="export-footer">
          {busy && (
            <div className="mb-3 rounded border border-zinc-700 bg-zinc-950/70 p-3" data-testid="export-progress">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                <span>{progress?.message ?? t('export.progressStarting')}</span>
                <span className="font-mono tabular-nums">{progressPct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                <div>
                  {t('export.progressStep', {
                    current: progress?.current ?? 0,
                    total: progress?.total ?? 0,
                  })}
                </div>
                <div className="text-right">
                  {t('export.progressRemaining', { count: progress?.remaining ?? count })}
                </div>
              </div>
              {progress?.detail && (
                <div className="mt-2 break-words text-[11px] leading-4 text-zinc-500">{progress.detail}</div>
              )}
            </div>
          )}
          {(() => {
            const summary = exportConfirmSummary({ slack: publishSlack, gitlab: publishGitLab, googleDrive: publishGoogleDrive })
            return (
              <div className="flex flex-col gap-2.5">
                {step === 1 && (
                  <div className={`text-[11.5px] leading-snug ${summary.hasTarget ? 'text-zinc-400' : 'text-amber-300'}`}>
                    {summary.hasTarget
                      ? t('export.confirm.publishTo', { targets: summary.targetLabels.join(', ') })
                      : t('export.confirm.localOnly')}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={onCancel} disabled={canceling} className={BTN_SECONDARY}>
                    {canceling ? t('export.canceling') : t('common.cancel')}
                  </button>
                  {step === 0 ? (
                    <button type="button" onClick={() => setStep(1)} data-testid="export-next" className={BTN_PRIMARY}>
                      {t('export.step.next')}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setStep(0)} className={BTN_SECONDARY}>
                        {t('export.step.back')}
                      </button>
                      <button onClick={() => onConfirm()} disabled={busy || !outputRoot.trim()} data-testid="confirm-export" className={BTN_PRIMARY}>
                        {busy ? t('common.exporting') : summary.hasTarget ? t('export.button.exportPublish') : t('export.button.exportLocal')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
