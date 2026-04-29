import { writeFile } from 'node:fs/promises'
import type { IProcessRunner } from './process-runner'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function extractPngBytes(buffer: Buffer): Buffer | null {
  const start = buffer.indexOf(PNG_SIGNATURE)
  return start >= 0 ? buffer.subarray(start) : null
}

export async function captureScreenshot(runner: IProcessRunner, deviceId: string, outPath: string): Promise<void> {
  const proc = runner.spawn('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'])
  const chunks: Buffer[] = []
  const stdoutDone = new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    proc.stdout.once('end', resolve)
    proc.stdout.once('error', reject)
  })
  const exitCode = await new Promise<number | null>((resolve) => {
    proc.onExit(resolve)
  })
  await stdoutDone

  const output = Buffer.concat(chunks)
  const png = extractPngBytes(output)
  if (exitCode !== 0) {
    throw new Error(`adb screencap failed with exit code ${exitCode ?? -1}`)
  }
  if (!png) {
    const sample = output.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ').trim()
    throw new Error(`adb screencap did not return a PNG${sample ? `: ${sample}` : ''}`)
  }
  await writeFile(outPath, png)
}
