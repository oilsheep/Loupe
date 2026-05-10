import { describe, expect, it } from 'vitest'
import { backfillProfileIds } from '../profile-backfill'
import type { AppSettings, Session } from '@shared/types'

function makeSettings(): AppSettings {
  return {
    profiles: [
      { id: 'pA', name: 'Cytus', slack: {} as any, gitlab: {} as any, google: {} as any },
      { id: 'pB', name: 'Deemo', slack: {} as any, gitlab: {} as any, google: {} as any },
    ],
    activeProfileId: 'pA',
  } as unknown as AppSettings
}

describe('backfillProfileIds', () => {
  it('sets profile_id for sessions whose project matches a profile name', () => {
    const settings = makeSettings()
    const orphans: Session[] = [
      { id: 's1', project: 'Cytus' } as Session,
      { id: 's2', project: 'Deemo' } as Session,
      { id: 's3', project: 'NoMatch' } as Session,
    ]
    const calls: Array<{ id: string; profileId: string }> = []
    const setSessionProfileId = (id: string, profileId: string) => calls.push({ id, profileId })
    backfillProfileIds(settings, orphans, setSessionProfileId)
    expect(calls).toEqual([
      { id: 's1', profileId: 'pA' },
      { id: 's2', profileId: 'pB' },
    ])
  })

  it('skips sessions with empty project label', () => {
    const calls: Array<{ id: string; profileId: string }> = []
    backfillProfileIds(makeSettings(), [{ id: 's1', project: '' } as Session], (id, pid) => calls.push({ id, profileId: pid }))
    expect(calls).toEqual([])
  })
})
