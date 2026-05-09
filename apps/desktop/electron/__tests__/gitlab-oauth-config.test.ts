import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findBundledOAuthInstance, getBundledOAuthInstances, _resetBundledInstancesCacheForTests, _setBundledInstancesRawForTests } from '../gitlab-oauth-config'

describe('gitlab-oauth-config', () => {
  beforeEach(() => {
    _resetBundledInstancesCacheForTests()
  })

  afterEach(() => {
    _resetBundledInstancesCacheForTests()
    vi.restoreAllMocks()
  })

  it('returns empty array when env value is empty', () => {
    _setBundledInstancesRawForTests('')
    expect(getBundledOAuthInstances()).toEqual([])
  })

  it('returns empty array and logs error when env value is malformed JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    _setBundledInstancesRawForTests('not-json')
    expect(getBundledOAuthInstances()).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('parses a single entry and strips trailing slashes from url', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com/","clientId":"abc123"}]')
    expect(getBundledOAuthInstances()).toEqual([
      { url: 'https://gitlab.rayark.com', clientId: 'abc123' },
    ])
  })

  it('parses multiple entries preserving order', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"a"},{"url":"https://gitlab.com","clientId":"b"}]')
    const instances = getBundledOAuthInstances()
    expect(instances).toHaveLength(2)
    expect(instances[0]).toEqual({ url: 'https://gitlab.rayark.com', clientId: 'a' })
    expect(instances[1]).toEqual({ url: 'https://gitlab.com', clientId: 'b' })
  })

  it('drops entries missing url or clientId', () => {
    _setBundledInstancesRawForTests('[{"url":"https://ok.example.com","clientId":"x"},{"clientId":"no-url"},{"url":"https://no-id.example.com"}]')
    expect(getBundledOAuthInstances()).toEqual([
      { url: 'https://ok.example.com', clientId: 'x' },
    ])
  })

  it('returns the same array reference on repeated calls (cache)', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"a"}]')
    const first = getBundledOAuthInstances()
    const second = getBundledOAuthInstances()
    expect(second).toBe(first)
  })

  it('findBundledOAuthInstance matches by exact URL after normalization', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"a"}]')
    expect(findBundledOAuthInstance('https://gitlab.rayark.com/')).toEqual({
      url: 'https://gitlab.rayark.com', clientId: 'a',
    })
  })

  it('findBundledOAuthInstance returns undefined for non-matching url', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"a"}]')
    expect(findBundledOAuthInstance('https://gitlab.com')).toBeUndefined()
  })

  it('findBundledOAuthInstance returns undefined for empty string', () => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"a"}]')
    expect(findBundledOAuthInstance('')).toBeUndefined()
  })
})
