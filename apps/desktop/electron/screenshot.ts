import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { IProcessRunner } from './process-runner'

export async function captureScreenshot(runner: IProcessRunner, deviceId: string, outPath: string): Promise<void> {
  const proc = runner.spawn('adb', ['-s', deviceId, 'exec-out', 'screencap', '-p'])
  await pipeline(proc.stdout, createWriteStream(outPath))
}
