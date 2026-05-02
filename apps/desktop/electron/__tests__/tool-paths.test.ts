import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformKey, resolveBundledTool, withToolPath } from '../tool-paths'

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
      expect(opts.env?.PATH).toContain(dir)
      expect(opts.env?.PATH?.split(delimiter).at(-1)).toBe('/usr/bin')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves Homebrew commands from the managed tool search path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loupe-tool-'))
    try {
      const bin = join(dir, 'bin')
      mkdirSync(bin)
      writeFileSync(join(bin, process.platform === 'win32' ? 'brew.exe' : 'brew'), '')
      vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', dir)
      const opts = withToolPath('brew', { env: { PATH: '/usr/bin' } })
      expect(opts.cwd).toBe(bin)
      expect(opts.env?.PATH).toContain(bin)
      expect(opts.env?.PATH?.split(delimiter).at(-1)).toBe('/usr/bin')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves go-ios from the managed platform directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loupe-tool-'))
    const iosName = process.platform === 'win32' ? 'ios.exe' : 'ios'
    try {
      const bin = join(dir, 'go-ios', platformKey(), 'bin')
      mkdirSync(bin, { recursive: true })
      const iosPath = join(bin, iosName)
      writeFileSync(iosPath, '')
      vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', dir)
      expect(resolveBundledTool('ios')).toBe(iosPath)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
