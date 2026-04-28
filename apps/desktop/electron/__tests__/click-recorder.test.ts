import { describe, expect, it, vi } from 'vitest'
import { ClickRecorder, buildClickRecorderScript } from '../click-recorder'
import type { IProcessRunner } from '../process-runner'

function runner() {
  const proc = {
    pid: 123,
    stdout: null as any,
    stderr: null as any,
    kill: vi.fn().mockReturnValue(true),
    onExit: vi.fn(),
  }
  const r: IProcessRunner = {
    run: vi.fn() as any,
    spawn: vi.fn().mockReturnValue(proc) as any,
  }
  return { r, proc }
}

describe('ClickRecorder', () => {
  it('builds a script scoped to the scrcpy window title and output path', () => {
    const script = buildClickRecorderScript({ outputPath: 'C:/tmp/clicks.jsonl', windowTitle: 'Loupe - Pixel 7' })
    expect(script).toContain("C:/tmp/clicks.jsonl")
    expect(script).toContain("Loupe - Pixel 7")
    expect(script).toContain('GetAsyncKeyState(1)')
    expect(script).toContain('ClientToScreen')
  })

  it('does not start by default to avoid antivirus/EDR false positives', () => {
    const { r } = runner()
    new ClickRecorder(r, 'win32').start({ outputPath: 'C:/tmp/clicks.jsonl', windowTitle: 'Loupe - Pixel 7' })
    expect(r.spawn).not.toHaveBeenCalled()
  })

  it('starts a PowerShell recorder only when explicitly enabled', () => {
    const { r } = runner()
    new ClickRecorder(r, 'win32', true).start({ outputPath: 'C:/tmp/clicks.jsonl', windowTitle: 'Loupe - Pixel 7' })
    expect(r.spawn).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-EncodedCommand', expect.any(String)]))
  })

  it('does nothing on non-Windows platforms', () => {
    const { r } = runner()
    new ClickRecorder(r, 'linux').start({ outputPath: '/tmp/clicks.jsonl', windowTitle: 'Loupe - Pixel 7' })
    expect(r.spawn).not.toHaveBeenCalled()
  })

  it('kills the recorder process on stop', () => {
    const { r, proc } = runner()
    const recorder = new ClickRecorder(r, 'win32', true)
    recorder.start({ outputPath: 'C:/tmp/clicks.jsonl', windowTitle: 'Loupe - Pixel 7' })
    recorder.stop()
    expect(proc.kill).toHaveBeenCalled()
  })
})
