import type { IProcessRunner } from './process-runner'

export interface ToolCheck {
  name: 'adb' | 'scrcpy'
  ok: boolean
  version?: string
  error?: string
}

const TOOLS: { name: ToolCheck['name']; cmd: string; args: string[] }[] = [
  { name: 'adb',    cmd: 'adb',    args: ['--version'] },
  { name: 'scrcpy', cmd: 'scrcpy', args: ['--version'] },
]

function installHint(name: ToolCheck['name']): string | null {
  if (process.platform === 'darwin') {
    return name === 'adb'
      ? 'Install with: brew install android-platform-tools'
      : 'Install with: brew install scrcpy'
  }
  if (process.platform === 'linux') {
    return name === 'adb'
      ? 'Install Android Platform Tools and ensure adb is on PATH.'
      : 'Install scrcpy and ensure it is on PATH.'
  }
  if (process.platform === 'win32') {
    return 'Packaged Windows builds include bundled tools; dev builds still require adb/scrcpy on PATH unless you point LOUPE_TOOLS_DIR at a tool folder.'
  }
  return null
}

function formatToolError(name: ToolCheck['name'], error: string): string {
  if (!/enoent|spawn/i.test(error)) return error
  const hint = installHint(name)
  return hint ? `${error}. ${hint}` : error
}

export async function doctor(runner: IProcessRunner): Promise<ToolCheck[]> {
  const out: ToolCheck[] = []
  for (const t of TOOLS) {
    try {
      const r = await runner.run(t.cmd, t.args)
      if (r.code === 0) {
        const firstLine = ((r.stdout || r.stderr).split('\n')[0] || '').trim()
        out.push({ name: t.name, ok: true, version: firstLine })
      } else {
        out.push({ name: t.name, ok: false, error: formatToolError(t.name, (r.stderr || `exit ${r.code}`).trim()) })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      out.push({ name: t.name, ok: false, error: formatToolError(t.name, message) })
    }
  }
  return out
}
