import type { AppSettings, Session } from '@shared/types'

/**
 * Pure backfill: for each orphan session (profile_id IS NULL) whose `project`
 * label exactly matches a profile name, write the profile id back. Sessions
 * whose project doesn't match anything stay null and rely on Draft view's
 * fallback path.
 */
export function backfillProfileIds(
  settings: Pick<AppSettings, 'profiles'>,
  orphans: Pick<Session, 'id' | 'project'>[],
  setSessionProfileId: (id: string, profileId: string) => void,
): void {
  for (const session of orphans) {
    if (!session.project) continue
    const match = settings.profiles.find(p => p.name === session.project)
    if (match) setSessionProfileId(session.id, match.id)
  }
}
