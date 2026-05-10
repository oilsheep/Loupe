import type { AppSettings, ProfileSettings, Session } from './types'

export interface ProfileLookupResult {
  profile: ProfileSettings
  matched: boolean
  reason: 'id' | 'name' | 'fallback'
}

export function findProfileForSession(
  settings: AppSettings,
  session: Pick<Session, 'profileId' | 'project'>,
): ProfileLookupResult {
  if (session.profileId) {
    const direct = settings.profiles.find(p => p.id === session.profileId)
    if (direct) return { profile: direct, matched: true, reason: 'id' }
  }
  if (session.project) {
    const byName = settings.profiles.find(p => p.name === session.project)
    if (byName) return { profile: byName, matched: true, reason: 'name' }
  }
  const active = settings.profiles.find(p => p.id === settings.activeProfileId) ?? settings.profiles[0]
  return { profile: active, matched: false, reason: 'fallback' }
}
