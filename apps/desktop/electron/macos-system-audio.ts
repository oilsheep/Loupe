import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

const SWIFT_HELPER = String.raw`
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

func loupeLog(_ message: String) {
  fputs("\(message)\n", stdout)
  fflush(stdout)
}

@available(macOS 13.0, *)
final class SystemAudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
  private let outputURL: URL
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var didStart = false
  private var audioSampleCount = 0

  init(outputPath: String) {
    self.outputURL = URL(fileURLWithPath: outputPath)
    super.init()
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
    guard outputType == .audio else { return }
    guard sampleBuffer.isValid else { return }
    do {
      if writer == nil {
        writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
        let settings: [String: Any] = [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: 48000,
          AVNumberOfChannelsKey: 2,
          AVEncoderBitRateKey: 128000,
        ]
        input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
        input?.expectsMediaDataInRealTime = true
        if let input, writer?.canAdd(input) == true {
          writer?.add(input)
        }
      }
      guard let writer, let input else { return }
      let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
      if !didStart {
        writer.startWriting()
        writer.startSession(atSourceTime: pts)
        didStart = true
        loupeLog("loupe-system-audio-started")
      }
      if input.isReadyForMoreMediaData {
        input.append(sampleBuffer)
        audioSampleCount += 1
      }
    } catch {
      fputs("loupe-system-audio-error: \(error)\n", stderr)
    }
  }

  func finish(_ done: @escaping () -> Void) {
    guard let writer, didStart else {
      loupeLog("loupe-system-audio-finished samples=\(audioSampleCount) empty=1")
      done()
      return
    }
    input?.markAsFinished()
    writer.finishWriting {
      loupeLog("loupe-system-audio-finished samples=\(self.audioSampleCount) status=\(writer.status.rawValue)")
      done()
    }
  }
}

@available(macOS 13.0, *)
func makeFilter(content: SCShareableContent, sourceId: String) -> SCContentFilter {
  guard let display = content.displays.first else {
    fputs("loupe-system-audio-error: no display available\n", stderr)
    exit(3)
  }
  if sourceId.hasPrefix("window:") {
    let parts = sourceId.split(separator: ":")
    if parts.count >= 2, let windowId = UInt32(parts[1]) {
      if content.windows.contains(where: { $0.windowID == windowId }) {
        return SCContentFilter(display: display, excludingWindows: [])
      }
    }
  }
  return SCContentFilter(display: display, excludingWindows: [])
}

@available(macOS 13.0, *)
func runRecorder(outputPath: String, sourceId: String) async throws {
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
  let filter = makeFilter(content: content, sourceId: sourceId)
  let configuration = SCStreamConfiguration()
  configuration.capturesAudio = true
  configuration.excludesCurrentProcessAudio = false
  configuration.sampleRate = 48000
  configuration.channelCount = 2
  configuration.width = 2
  configuration.height = 2
  configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)

  let recorder = SystemAudioRecorder(outputPath: outputPath)
  let stream = SCStream(filter: filter, configuration: configuration, delegate: recorder)
  let queue = DispatchQueue(label: "loupe.system-audio")
  try stream.addStreamOutput(recorder, type: .audio, sampleHandlerQueue: queue)
  try await stream.startCapture()
  loupeLog("loupe-system-audio-capturing")

  signal(SIGTERM, SIG_IGN)
  signal(SIGINT, SIG_IGN)
  signal(SIGTRAP, SIG_IGN)
  let stopSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
  stopSource.setEventHandler {
    Task {
      try? await stream.stopCapture()
      recorder.finish {
        exit(0)
      }
    }
  }
  stopSource.resume()

  let interruptSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
  interruptSource.setEventHandler {
    Task {
      try? await stream.stopCapture()
      recorder.finish {
        exit(0)
      }
    }
  }
  interruptSource.resume()

  dispatchMain()
}

guard CommandLine.arguments.count >= 3 else {
  exit(2)
}

if #available(macOS 13.0, *) {
  do {
    try await runRecorder(outputPath: CommandLine.arguments[1], sourceId: CommandLine.arguments[2])
  } catch {
    fputs("loupe-system-audio-error: \(error)\n", stderr)
    exit(1)
  }
} else {
  fputs("loupe-system-audio-error: macOS 13 or later is required\n", stderr)
  exit(12)
}
`

export interface MacSystemAudioCaptureResult {
  path: string | null
  stdout: string
  stderr: string
  exitedEarly?: boolean
}

export class MacSystemAudioCapture {
  private proc: SpawnedProcess | null = null
  private outputPath: string | null = null
  private stderr = ''
  private stdout = ''
  private stopping: Promise<MacSystemAudioCaptureResult | null> | null = null
  private exitCode: number | null | undefined
  private exitSignal: NodeJS.Signals | null | undefined
  private exitedEarly = false

  constructor(private runner: IProcessRunner) {}

  async start(sessionId: string, sourceId = ''): Promise<string | null> {
    if (process.platform !== 'darwin' || this.proc) return null
    const helperPath = ensureSwiftHelper()
    const binaryPath = await ensureSwiftHelperBinary(this.runner, helperPath)
    const outputDir = join(tmpdir(), 'loupe-system-audio')
    mkdirSync(outputDir, { recursive: true })
    const outputPath = join(outputDir, `${sanitizeFilePart(sessionId)}-${Date.now()}.m4a`)
    const proc = this.runner.spawn(binaryPath, [outputPath, sourceId])
    console.log(`Loupe: macOS system audio capture starting pid=${proc.pid ?? 'unknown'} source=${sourceId || '(none)'} output=${outputPath}`)
    this.proc = proc
    this.outputPath = outputPath
    this.stderr = ''
    this.stdout = ''
    this.stopping = null
    this.exitCode = undefined
    this.exitSignal = undefined
    this.exitedEarly = false
    proc.stderr.on('data', chunk => { this.stderr += chunk.toString() })
    proc.stdout.on('data', chunk => { this.stdout += chunk.toString() })
    proc.onExit((code, signal) => {
      this.exitCode = code
      this.exitSignal = signal ?? null
      this.exitedEarly = true
      const size = this.outputPath && existsSync(this.outputPath) ? statSync(this.outputPath).size : 0
      console.log(`Loupe: macOS system audio capture exited code=${code ?? 'null'} signal=${signal ?? 'null'} size=${size} output=${this.outputPath ?? '(none)'} stdout=${JSON.stringify(this.stdout.trim())} stderr=${JSON.stringify(this.stderr.trim())}`)
      this.proc = null
    })
    return outputPath
  }

  async stop(timeoutMs = 5000): Promise<MacSystemAudioCaptureResult | null> {
    if (this.stopping) return this.stopping
    const proc = this.proc
    const outputPath = this.outputPath
    if (!proc || !outputPath) {
      const path = this.outputPath
      const stdout = this.stdout.trim()
      const stderr = this.stderr.trim()
      const size = path && existsSync(path) ? statSync(path).size : 0
      console.log(`Loupe: macOS system audio capture stop requested but no helper is running. exitedEarly=${this.exitedEarly} size=${size} output=${path ?? '(none)'}`)
      this.outputPath = null
      if (path && size > 0) return { path, stdout, stderr, exitedEarly: true }
      return { path: null, stdout, stderr, exitedEarly: this.exitedEarly }
    }
    console.log(`Loupe: macOS system audio capture stopping pid=${proc.pid ?? 'unknown'} output=${outputPath}`)
    this.stopping = new Promise(resolve => {
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        this.proc = null
        const path = outputPath
        const stdout = this.stdout.trim()
        const stderr = this.stderr.trim()
        this.outputPath = null
        if (existsSync(path) && statSync(path).size > 0) {
          resolve({ path, stdout, stderr })
        } else {
          resolve({ path: null, stdout, stderr })
        }
      }
      proc.onExit(() => settle())
      proc.kill('SIGTERM')
      setTimeout(() => {
        if (!settled) {
          proc.kill('SIGKILL')
          settle()
        }
      }, timeoutMs).unref()
    })
    return this.stopping
  }
}

function ensureSwiftHelper(): string {
  const dir = join(tmpdir(), 'loupe-system-audio')
  mkdirSync(dir, { recursive: true })
  const helperPath = join(dir, 'macos-system-audio.swift')
  if (!existsSync(helperPath) || readFileSync(helperPath, 'utf8') !== SWIFT_HELPER) {
    writeFileSync(helperPath, SWIFT_HELPER)
  }
  return helperPath
}

async function ensureSwiftHelperBinary(runner: IProcessRunner, helperPath: string): Promise<string> {
  const dir = join(app.getPath('userData'), 'helpers')
  mkdirSync(dir, { recursive: true })
  const hash = createHash('sha256').update(SWIFT_HELPER).digest('hex').slice(0, 12)
  const binaryPath = join(dir, 'loupe-macos-system-audio')
  const versionPath = `${binaryPath}.version`
  if (existsSync(binaryPath) && existsSync(versionPath) && readFileSync(versionPath, 'utf8') === hash) return binaryPath
  const nextBinaryPath = join(dir, `loupe-macos-system-audio-${hash}`)
  if (existsSync(nextBinaryPath)) {
    writeFileSync(versionPath, hash)
    return nextBinaryPath
  }
  const r = await runner.run('/usr/bin/xcrun', ['swiftc', helperPath, '-o', nextBinaryPath])
  if (r.code !== 0) throw new Error(`macOS system audio helper compile failed (code ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`)
  writeFileSync(versionPath, hash)
  return nextBinaryPath
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'session'
}
