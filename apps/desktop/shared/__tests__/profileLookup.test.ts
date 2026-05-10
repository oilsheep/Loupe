import { describe, expect, it } from 'vitest'
import { findProfileForSession } from '../profileLookup'
import type { AppSettings } from '../types'

function profile(id: string, name: string) {
  return {
    id, name,
    slack: { botToken: '', channelId: '' },
    gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' as const },
    google: { token: '' },
  }
}

const A = profile('A', 'Cytus')
const B = profile('B', 'Deemo')
const settings = { profiles: [A, B], activeProfileId: 'A' } as unknown as AppSettings

describe('findProfileForSession', () => {
  it('returns reason="id" when profileId hits a profile', () => {
    const r = findProfileForSession(settings, { profileId: 'B', project: 'whatever' })
    expect(r.profile.id).toBe('B')
    expect(r.matched).toBe(true)
    expect(r.reason).toBe('id')
  })

  it('returns reason="name" when profileId is null but project name matches', () => {
    const r = findProfileForSession(settings, { profileId: null, project: 'Deemo' })
    expect(r.profile.id).toBe('B')
    expect(r.matched).toBe(true)
    expect(r.reason).toBe('name')
  })

  it('returns reason="fallback" when neither id nor name matches; uses active profile', () => {
    const r = findProfileForSession(settings, { profileId: null, project: 'NoMatch' })
    expect(r.profile.id).toBe('A')
    expect(r.matched).toBe(false)
    expect(r.reason).toBe('fallback')
  })

  it('falls back to first profile if active id is missing from list', () => {
    const broken = { ...settings, activeProfileId: 'GHOST' }
    const r = findProfileForSession(broken, { profileId: null, project: '' })
    expect(r.profile.id).toBe('A')
    expect(r.reason).toBe('fallback')
  })
})
