import { describe, expect, it } from 'vitest'
import { localFileUrl } from '@/lib/api'

describe('localFileUrl', () => {
  it('builds a valid file URL for absolute macOS paths', () => {
    expect(localFileUrl('/Users/miki/Loupe/screenshots/bug 1.png'))
      .toBe('file:///Users/miki/Loupe/screenshots/bug%201.png')
  })

  it('builds a valid file URL for Windows drive paths', () => {
    expect(localFileUrl('C:\\Users\\miki\\Loupe\\bug 1.png'))
      .toBe('file:///C:/Users/miki/Loupe/bug%201.png')
  })
})