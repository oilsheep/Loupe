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

export async function doctor(runner: IProcessRunner): Promise<ToolCheck[]> {
  const out: ToolCheck[] = []
  for (const t of TOOLS) {
    try {
      const r = await runner.run(t.cmd, t.args)
      if (r.code === 0) {
        const firstLine = ((r.stdout || r.stderr).split('\n')[0] || '').trim()
        out.push({ name: t.name, ok: true, version: firstLine })
      } else {
        out.push({ name: t.name, ok: false, error: (r.stderr || `exit ${r.code}`).trim() })
      }
    } catch (e) {
      out.push({ name: t.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
