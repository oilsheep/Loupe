import { create } from 'zustand'
import type { Session } from '@shared/types'
import type { RecordingSourceSelection } from '@/lib/recordingSource'

type View =
  | { name: 'home' }
  | { name: 'tools' }
  | { name: 'legal' }
  | { name: 'recording'; session: Session }
  | { name: 'draft'; sessionId: string }

interface AppState {
  view: View
  recentBuilds: string[]
  lastRecordingSource: RecordingSourceSelection | null
  goHome(): void
  goTools(): void
  goLegal(): void
  goRecording(s: Session): void
  goDraft(id: string): void
  setLastRecordingSource(source: RecordingSourceSelection): void
  pushRecentBuild(b: string): void
}

const RECENT_KEY = 'recentBuilds'
const initialRecent: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
})()

export const useApp = create<AppState>((set, get) => ({
  view: { name: 'home' },
  recentBuilds: initialRecent,
  lastRecordingSource: null,
  goHome:      () => set({ view: { name: 'home' } }),
  goTools:     () => set({ view: { name: 'tools' } }),
  goLegal:     () => set({ view: { name: 'legal' } }),
  goRecording: (session) => set({ view: { name: 'recording', session } }),
  goDraft:     (sessionId) => set({ view: { name: 'draft', sessionId } }),
  setLastRecordingSource: (source) => set({ lastRecordingSource: source }),
  pushRecentBuild: (b) => {
    if (!b) return
    const next = [b, ...get().recentBuilds.filter(x => x !== b)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    set({ recentBuilds: next })
  },
}))
