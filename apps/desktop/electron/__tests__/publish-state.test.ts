import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendPublishState } from '../publish-state'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'loupe-pubstate-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('appendPublishState', () => {
  it('writes a slack record and skips local', () => {
    const state = appendPublishState(dir, { target: 'slack', channelId: 'C1', rootTs: '123.45', markerThreadTs: {}, mode: 'single-thread', uploadErrors: [] } as any, '2026-07-03T00:00:00Z')
    expect(state.targets.slack).toHaveLength(1)
    expect(state.targets.slack![0]).toMatchObject({ channelId: 'C1', rootTs: '123.45', publishedAt: '2026-07-03T00:00:00Z' })
    expect(existsSync(join(dir, 'publish-state.json'))).toBe(true)
  })

  it('appends (never overwrites) across multiple publishes', () => {
    appendPublishState(dir, { target: 'gitlab', projectId: 'p', issueUrls: ['u1'], mode: 'single-issue', uploadErrors: [] } as any, '2026-07-03T00:00:00Z')
    const state = appendPublishState(dir, { target: 'gitlab', projectId: 'p', issueUrls: ['u2'], mode: 'single-issue', uploadErrors: [] } as any, '2026-07-03T01:00:00Z')
    expect(state.targets.gitlab).toHaveLength(2)
    expect(state.targets.gitlab!.map(r => r.issueUrls[0])).toEqual(['u1', 'u2'])
  })

  it('expands a multi result into per-target records and ignores failed/local', () => {
    const state = appendPublishState(dir, { target: 'multi', results: [
      { target: 'slack', channelId: 'C1', rootTs: 't', markerThreadTs: {}, mode: 'single-thread', uploadErrors: [] },
      { target: 'gitlab', failed: true, error: 'x' },
      { target: 'local', skipped: true },
    ] } as any, '2026-07-03T00:00:00Z')
    expect(state.targets.slack).toHaveLength(1)
    expect(state.targets.gitlab ?? []).toHaveLength(0)
  })
})
