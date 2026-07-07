import { describe, expect, it, vi, beforeEach } from 'vitest'

const slackSpy = vi.fn().mockResolvedValue({ failed: false, uploadErrors: [] })
const gitlabSpy = vi.fn().mockResolvedValue({ failed: false, uploadErrors: [] })
const googleSpy = vi.fn().mockResolvedValue({ failed: false, uploadErrors: [] })

vi.mock('../slack-publisher', () => ({ publishManifestToSlack: (a: unknown) => slackSpy(a) }))
vi.mock('../gitlab-publisher', () => ({ publishManifestToGitLab: (a: unknown) => gitlabSpy(a) }))
vi.mock('../google-publisher', () => ({ publishManifestToGoogleDrive: (a: unknown) => googleSpy(a) }))
vi.mock('@shared/profileLookup', () => ({
  findProfileForSession: () => ({
    matched: true,
    profile: {
      name: 'P', slack: { channelId: 'CPROFILE', mentionUserIds: ['U_PROFILE'] },
      gitlab: { projectId: 'proj/profile' }, google: {}, publishTemplates: {},
    },
  }),
}))

import { publishManifestToRemote } from '../remote-publisher'

function manifest(targets: string[]) {
  return {
    version: 2, publish: { target: targets[0], targets, slackThreadMode: 'single-thread', gitlabMode: 'single-issue' },
    session: { id: 's', project: 'p' },
  } as never
}
const base = { manifestPaths: { jsonPath: '', csvPath: '' }, settings: { mentionIdentities: [] } as never }

beforeEach(() => { slackSpy.mockClear(); gitlabSpy.mockClear(); googleSpy.mockClear() })

describe('publishManifestToRemote overrides', () => {
  it('applies slack channel/mentions/thread-mode overrides', async () => {
    await publishManifestToRemote({
      ...base, manifest: manifest(['slack']),
      overrides: { slack: { channelId: 'COVERRIDE', threadMode: 'per-marker-thread', mentionUserIds: ['U_X'] } },
    })
    const arg = slackSpy.mock.calls[0][0]
    expect(arg.settings.channelId).toBe('COVERRIDE')
    expect(arg.settings.mentionUserIds).toEqual(['U_X'])
    expect(arg.manifest.publish.slackThreadMode).toBe('per-marker-thread')
  })

  it('applies gitlab project/mode overrides', async () => {
    await publishManifestToRemote({
      ...base, manifest: manifest(['gitlab']),
      overrides: { gitlab: { projectId: 'proj/override', mode: 'per-marker-issue' } },
    })
    const arg = gitlabSpy.mock.calls[0][0]
    expect(arg.settings.projectId).toBe('proj/override')
    expect(arg.manifest.publish.gitlabMode).toBe('per-marker-issue')
  })

  it('falls back to profile values when no override for that target', async () => {
    await publishManifestToRemote({ ...base, manifest: manifest(['slack']) })
    expect(slackSpy.mock.calls[0][0].settings.channelId).toBe('CPROFILE')
    expect(slackSpy.mock.calls[0][0].manifest.publish.slackThreadMode).toBe('single-thread')
  })
})
