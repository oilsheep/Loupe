import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentionPicker, PublishTargetsForm, type MentionOption, type PublishTargetsFormProps } from '../PublishTargetsForm'

// useI18n() falls back to dictionaries.en when there is no I18nContext, so
// no wrapper or window.api stub is needed for these pure-UI tests.

function baseProps(over: Partial<PublishTargetsFormProps> = {}): PublishTargetsFormProps {
  return {
    profiles: [], selectedProfileId: '', onSelectedProfileIdChange: vi.fn(),
    slackSettings: null, slackConnected: true, slackConnecting: false,
    gitlabConnected: true, gitlabConnecting: false,
    googleDriveConnected: false, googleConnecting: false, canPublishGoogleDrive: false,
    publishSlack: false, publishGitLab: false, publishGoogleDrive: false,
    slackThreadMode: 'single-thread', slackChannels: [], slackChannelId: '',
    mentionOptions: [], slackMentionIds: [], slackMentionAliases: {},
    slackDirectoryRefreshing: false, slackDirectoryError: '',
    gitlabMode: 'single-issue', gitlabProjectId: '', gitlabProjects: [],
    gitlabProjectsRefreshing: false, gitlabProjectsError: '', busy: false,
    onConnectSlack: vi.fn(), onConnectGitLab: vi.fn(), onConnectGoogle: vi.fn(),
    onPublishSlackChange: vi.fn(), onPublishGitLabChange: vi.fn(), onPublishGoogleDriveChange: vi.fn(),
    onSlackThreadModeChange: vi.fn(), onSlackChannelIdChange: vi.fn(),
    onSlackMentionIdsChange: vi.fn(), onSlackManualMentionInputChange: vi.fn(),
    onRefreshSlackDirectory: vi.fn(), onGitLabModeChange: vi.fn(),
    onGitLabProjectIdChange: vi.fn(), onRefreshGitLabProjects: vi.fn(),
    ...over,
  }
}

function renderForm(over?: Partial<PublishTargetsFormProps>) {
  const props = baseProps(over)
  render(<PublishTargetsForm {...props} />)
  return props
}

describe('PublishTargetsForm', () => {
  it('renders Slack, GitLab and Google Drive rows', () => {
    renderForm()
    expect(screen.getByText('Slack')).toBeTruthy()
    expect(screen.getByText('GitLab')).toBeTruthy()
    expect(screen.getByText('Google Drive')).toBeTruthy()
  })

  it('shows Slack detail fields only when Slack is enabled', () => {
    const { rerender } = render(<PublishTargetsForm {...baseProps({ publishSlack: false })} />)
    expect(screen.queryByText('single-thread', { exact: false })).toBeNull()
    rerender(<PublishTargetsForm {...baseProps({ publishSlack: true })} />)
    // thread-mode buttons appear when enabled
    expect(screen.getByRole('group', { name: /slack/i })).toBeTruthy()
  })

  it('selecting GitLab per-marker mode calls onGitLabModeChange', () => {
    const props = renderForm({ publishGitLab: true })
    fireEvent.click(screen.getByText('Issue per marker'))
    expect(props.onGitLabModeChange).toHaveBeenCalledWith('per-marker-issue')
  })
})

const mentionOptions: MentionOption[] = [
  { id: 'alice', label: 'Alice', detail: 'alice@example.com', hasSlack: true, hasGitLab: true, hasGoogle: false, slackUserId: 'U_ALICE' },
  { id: 'bob', label: 'Bob', detail: 'bob@example.com', hasSlack: true, hasGitLab: false, hasGoogle: false, slackUserId: 'U_BOB' },
]

describe('MentionPicker', () => {
  it('removes one selected person without opening the picker', () => {
    const onChange = vi.fn()
    render(
      <MentionPicker
        options={mentionOptions}
        selectedIds={['alice', 'bob']}
        aliases={{}}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }))

    expect(onChange).toHaveBeenCalledWith(['bob'])
    expect(screen.queryByPlaceholderText('Search people')).toBeNull()
  })

  it('removes a selected Slack user ID through its mapped person chip', () => {
    const onChange = vi.fn()
    render(
      <MentionPicker
        options={mentionOptions}
        selectedIds={['U_ALICE']}
        aliases={{}}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }))

    expect(onChange).toHaveBeenCalledWith([])
  })
})
