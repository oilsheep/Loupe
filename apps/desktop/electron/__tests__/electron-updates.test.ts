import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.5.0') },
}))

import { deriveFeedOverride } from '../electron-updates'

describe('deriveFeedOverride', () => {
  it('strips embedded credentials into a Basic Authorization header', () => {
    const url = 'https://user:t0ken@gitlab.rayark.com/api/v4/projects/3617/packages/generic/loupe/latest/latest-mac.yml'
    const out = deriveFeedOverride(url)!
    expect(out.channelDirUrl).toBe('https://gitlab.rayark.com/api/v4/projects/3617/packages/generic/loupe/latest/')
    expect(out.authHeader).toBe(`Basic ${Buffer.from('user:t0ken').toString('base64')}`)
  })

  it('trims the trailing .yml filename to leave a channel directory URL', () => {
    const out = deriveFeedOverride('https://example.com/path/latest.yml')!
    expect(out.channelDirUrl).toBe('https://example.com/path/')
    expect(out.authHeader).toBeUndefined()
  })

  it('leaves a directory URL untouched when no filename is present', () => {
    const out = deriveFeedOverride('https://example.com/path/')!
    expect(out.channelDirUrl).toBe('https://example.com/path/')
  })

  it('URL-decodes credentials before re-encoding to Basic', () => {
    const url = 'https://user:t%2Bok%2Fen@host/p/latest.yml'
    const out = deriveFeedOverride(url)!
    expect(out.authHeader).toBe(`Basic ${Buffer.from('user:t+ok/en').toString('base64')}`)
  })

  it('returns null for empty input', () => {
    expect(deriveFeedOverride('')).toBeNull()
  })

  it('returns null for malformed URLs', () => {
    expect(deriveFeedOverride('not a url')).toBeNull()
  })
})
