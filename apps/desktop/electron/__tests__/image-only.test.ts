import { describe, it, expect } from 'vitest'
import { isImageOnly } from '../export-image-only'

describe('isImageOnly', () => {
  it('true only when both pre and post are 0', () => {
    expect(isImageOnly({ preSec: 0, postSec: 0 })).toBe(true)
    expect(isImageOnly({ preSec: 0, postSec: 5 })).toBe(false)
    expect(isImageOnly({ preSec: 3, postSec: 0 })).toBe(false)
  })
})
