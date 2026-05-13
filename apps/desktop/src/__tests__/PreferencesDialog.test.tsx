import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type {
  AppLocale,
  AudioAnalysisSettings,
  CommonSessionSettings,
  GitLabPublishSettings,
  GooglePublishSettings,
  HotkeySettings,
  ProfileSettings,
  PublishTemplateSettings,
  SeveritySettings,
  SlackPublishSettings,
} from '@shared/types'
import { PreferencesDialog } from '@/components/PreferencesDialog'

const slack: SlackPublishSettings = {
  botToken: '', userToken: '', publishIdentity: 'user', channelId: '',
  oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'loupe://slack-oauth',
  oauthUserId: '', oauthTeamId: '', oauthTeamName: '', oauthConnectedAt: null, oauthUserScopes: [],
  channels: [], channelsFetchedAt: null,
  mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null,
}
const gitlab: GitLabPublishSettings = {
  baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue',
  labels: [], confidential: false, mentionUsernames: [],
}
const google: GooglePublishSettings = {
  token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '',
  oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '',
  driveFolderId: '', driveFolderName: '', updateSheet: false,
  spreadsheetId: '', spreadsheetName: '', sheetName: '',
}
const profile: ProfileSettings = { id: 'p1', name: 'Default', slack, gitlab, google, markerFieldPresets: [] }

const hotkeys: HotkeySettings = { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }
const severities: SeveritySettings = {
  note: { label: 'Note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
}
const audioAnalysis: AudioAnalysisSettings = {
  enabled: true, engine: 'faster-whisper', modelPath: 'small',
  language: 'auto', triggerKeywords: 'record', showTriggerWords: false,
}
const commonSession: CommonSessionSettings = { platforms: [], testers: [], lastPlatform: '', lastTester: '' }
const publishTemplates: PublishTemplateSettings = { slack: {}, gitlab: {}, 'google-drive': {}, 'local-folder': {} } as any

function mockProps() {
  return {
    locale: 'en' as AppLocale,
    localeOptions: [{ value: 'en' as AppLocale, label: 'English' }],
    exportRoot: '/exports',
    hotkeys,
    severities,
    audioAnalysis,
    audioAnalysisSaved: false,
    commonSession,
    profiles: [profile],
    selectedProfile: profile,
    onSwitchProfile: vi.fn(),
    onAddProfile: vi.fn(),
    onRenameProfile: vi.fn(),
    onDeleteProfile: vi.fn(),
    slack,
    startingSlackOAuth: false,
    refreshingSlackUsers: false,
    slackError: '',
    activeSlackUsers: [],
    gitlab,
    bundledGitLabOAuthInstances: [],
    gitlabLabelsInput: '',
    gitlabMentionsInput: '',
    savingGitLab: false,
    refreshingGitLabUsers: false,
    gitlabProjects: [],
    refreshingGitLabProjects: false,
    connectingGitLabOAuth: false,
    gitlabError: '',
    activeGitLabUsers: [],
    google,
    connectingGoogleOAuth: false,
    googleFolders: [],
    refreshingGoogleFolders: false,
    newGoogleFolderName: '',
    creatingGoogleFolder: false,
    googleSpreadsheets: [],
    refreshingGoogleSpreadsheets: false,
    googleSheetTabs: [],
    refreshingGoogleSheetTabs: false,
    googleError: '',
    googleStatus: '',
    mentionIdentities: [],
    savingMentionIdentities: false,
    mentionIdentitiesSaved: false,
    mentionIdentitiesError: '',
    mentionIdentitiesStatus: '',
    markerFieldPresets: [],
    markerFieldPresetsSaved: false,
    publishTemplates,
    publishTemplatesSaved: false,
    onLocaleChange: vi.fn(),
    onExportRootChange: vi.fn(),
    onSaveExportRoot: vi.fn(),
    onChooseExportRoot: vi.fn(),
    onHotkeysChange: vi.fn(),
    onSaveHotkeys: vi.fn(),
    onSeveritiesChange: vi.fn(),
    onSaveSeverities: vi.fn(),
    onResetLabels: vi.fn(),
    onAudioAnalysisChange: vi.fn(),
    onSaveAudioAnalysis: vi.fn(),
    onAudioAnalysisLanguageChange: vi.fn(),
    onCommonSessionChange: vi.fn(),
    onSaveCommonSession: vi.fn(),
    onSlackChange: vi.fn(),
    onCommitSlack: vi.fn(),
    onStartSlackOAuth: vi.fn(),
    onRefreshSlackUsers: vi.fn(),
    onLoadSlackChannels: vi.fn(),
    refreshingSlackChannels: false,
    onSelectSlackChannel: vi.fn(),
    onDisconnect: vi.fn(),
    disconnectingService: null,
    onGitLabChange: vi.fn(),
    onCommitGitLab: vi.fn(),
    onGitLabLabelsInputChange: vi.fn(),
    onGitLabMentionsInputChange: vi.fn(),
    onConnectGitLabOAuth: vi.fn(),
    onCancelGitLabOAuth: vi.fn(),
    onLoadGitLabProjects: vi.fn(),
    onSelectGitLabProject: vi.fn(),
    onRefreshGitLabUsers: vi.fn(),
    onGoogleChange: vi.fn(),
    onCommitGoogle: vi.fn(),
    onConnectGoogleOAuth: vi.fn(),
    onCancelGoogleOAuth: vi.fn(),
    onLoadGoogleFolders: vi.fn(),
    onCreateGoogleFolder: vi.fn(),
    onNewGoogleFolderNameChange: vi.fn(),
    onLoadGoogleSpreadsheets: vi.fn(),
    onLoadGoogleSheetTabs: vi.fn(),
    onOpenGoogleDriveFolder: vi.fn(),
    onOpenGoogleSpreadsheet: vi.fn(),
    onUpdateMentionIdentity: vi.fn(),
    onAddMentionIdentity: vi.fn(),
    onRemoveMentionIdentity: vi.fn(),
    onImportMentionIdentities: vi.fn(),
    onExportMentionIdentities: vi.fn(),
    onSaveMentionIdentities: vi.fn(),
    onMarkerFieldPresetsChange: vi.fn(),
    onSaveMarkerFieldPresets: vi.fn(),
    onPublishTemplatesChange: vi.fn(),
    onSavePublishTemplates: vi.fn(),
    onClose: vi.fn(),
  }
}

describe('PreferencesDialog top-level tabs', () => {
  it('renders Profile tab and Global tab', () => {
    render(<PreferencesDialog {...mockProps()} />)
    expect(screen.getByRole('tab', { name: /profile/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /global/i })).toBeTruthy()
  })

  it('Profile tab shows the profile switcher and per-profile sections (Slack, Google, GitLab)', () => {
    render(<PreferencesDialog {...mockProps()} />)
    // Default tab is Profile, so the profile switcher should be visible.
    expect(screen.getByTestId('preferences-profile-switcher')).toBeTruthy()
    // Slack / Google Drive / GitLab summaries appear inside Publish.
    expect(screen.getByText('Slack')).toBeTruthy()
    expect(screen.getByText('Google Drive')).toBeTruthy()
    expect(screen.getByText('GitLab')).toBeTruthy()
  })

  it('Global tab shows hotkeys / severities / audio analysis (not Slack/GitLab/Google)', () => {
    render(<PreferencesDialog {...mockProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /global/i }))
    // Global-side headings appear.
    expect(screen.getByText(/Speech recognition/i)).toBeTruthy()
    expect(screen.getByText(/Default marker labels/i)).toBeTruthy()
    expect(screen.getByText(/General/i)).toBeTruthy()
    // Per-profile publish targets are not visible on Global tab.
    expect(screen.queryByText('Google Drive')).toBeNull()
    expect(screen.queryByText('GitLab')).toBeNull()
  })
})
