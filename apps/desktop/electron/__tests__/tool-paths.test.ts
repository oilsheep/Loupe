import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withToolPath } from '../tool-paths'

describe('tool-paths', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prepends the resolved tool directory using the platform PATH delimiter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loupe-tool-'))
    const toolName = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy'
    try {
      writeFileSync(join(dir, toolName), '')
      vi.stubEnv('LOUPE_TOOLS_DIR', dir)
      const opts = withToolPath('scrcpy', { env: { PATH: '/usr/bin' } })
      expect(opts.cwd).toBe(dir)
      expect(opts.env?.PATH).toBe(`${dir}${delimiter}/usr/bin`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})