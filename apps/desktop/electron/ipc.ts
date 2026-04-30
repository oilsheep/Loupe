import { ipcMain, BrowserWindow, desktopCapturer, dialog, screen, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Writable, Readable } from 'node:stream'
import { clampClipWindow, extractClip, extractClipWithIntro, extractContactSheet, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import type { AppLocale, Bug, ExportProgress, ExportedMarkerFile, ExportPublishOptions, HotkeySettings, PcCaptureSource, Session, SessionLoadProgress, SeveritySettings, SlackPublishSettings } from '@shared/types'
import { doctor } from './doctor'
import { writeExportManifests } from './export-manifest'
import { publishManifestToSlack } from './slack-publisher'
import { readProjectFile, writeProjectFile } from './project-file'
import type { SettingsStore } from './settings'
import { formatTelemetryLine, nearestTelemetrySample, readTelemetrySamples } from './telemetry'

export const CHANNEL = {
  doctor:                  'app:doctor',
  showItemInFolder:        'app:showItemInFolder',
  openPath:                'app:openPath',
  getPrimaryScreenSource:  'app:getPrimaryScreenSource',
  listPcCaptureSources:   'app:listPcCaptureSources',
  showPcCaptureFrame:     'app:showPcCaptureFrame',
  hidePcCaptureFrame:     'app:hidePcCaptureFrame',
  deviceList:              'device:list',
  deviceConnect:           'device:connect',
  deviceMdnsScan:          'device:mdnsScan',
  devicePair:              'device:pair',
  deviceGetUserName:       'device:getUserName',
  sessionStart:            'session:start',
  sessionMarkBug:          'session:markBug',
  sessionStop:             'session:stop',
  sessionDiscard:          'session:discard',
  sessionList:             'session:list',
  sessionGet:              'session:get',
  sessionLoadProgress:     'session:loadProgress',
  sessionOpenProject:      'session:openProject',
  sessionUpdateMetadata:   'session:updateMetadata',
  sessionSavePcRecording:  'session:savePcRecording',
  sessionResolveAssetPath: 'session:resolveAssetPath',
  bugUpdate:               'bug:update',
  bugAddMarker:            'bug:addMarker',
  bugGetLogcatPreview:     'bug:getLogcatPreview',
  bugDelete:               'bug:delete',
  bugExportClip:           'bug:exportClip',
  bugExportClips:          'bug:exportClips',
  bugExportProgress:       'bug:exportProgress',
  bugExportCancel:         'bug:exportCancel',
  bugSaveAudio:            'bug:saveAudio',
  bugMarkRequested:        'bug:markRequested',
  sessionInterrupted:      'session:interrupted',
  hotkeySetEnabled:        'hotkey:setEnabled',
  settingsGet:             'settings:get',
  settingsSetExportRoot:   'settings:setExportRoot',
  settingsSetHotkeys:      'settings:setHotkeys',
  settingsSetSlack:        'settings:setSlack',
  settingsSetLocale:       'settings:setLocale',
  settingsSetSeverities:   'settings:setSeverities',
  settingsChooseExportRoot:'settings:chooseExportRoot',
} as const

let pcCaptureFrame: BrowserWindow | null = null
let pcCaptureFrameToken = 0
let pcRecordingProcess: ChildProcessByStdio<Writable, null, Readable> | null = null
let pcRecordingStderr = ''
const exportControllers = new Map<string, AbortController>()

export interface IpcDeps {
  adb: Adb
  manager: SessionManager
  paths: Paths
  runner: IProcessRunner
  db: Db
  settings: SettingsStore
  getWindow: () => BrowserWindow | null
  setHotkeyEnabled: (enabled: boolean) => void
  setHotkeys: (hotkeys: HotkeySettings) => void
}

function sessionVideoInputPath(session: { id: string; videoPath: string | null; pcVideoPath: string | null; connectionMode?: string }, paths: Paths): string {
  if (session.connectionMode === 'pc' && session.pcVideoPath) return session.pcVideoPath
  return session.videoPath ?? paths.videoFile(session.id)
}

function safeFilePart(value: string): string {
  return (value || 'session')
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80) || 'session'
}

function exportDirForSession(root: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  return join(root, `${safeFilePart(session.buildVersion)} - ${stamp}`)
}

function exportRecordsDir(outDir: string): string {
  return join(outDir, 'records')
}

function exportReportDir(outDir: string): string {
  return join(outDir, 'report')
}

function localDatePart(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function exportBaseName(session: Session, bug: { id: string; note: string; createdAt: number }): string {
  const note = safeFilePart(bug.note || 'marker')
  const build = safeFilePart(session.buildVersion || 'build')
  return `${note}_${build}_${localDatePart(bug.createdAt)}_${bug.id.slice(0, 8)}`
}

function exportLogcatSidecar(paths: Paths, session: Session, bug: { id: string; logcatRel: string | null }, outDir: string, baseName: string): string | null {
  if (!bug.logcatRel) return null
  const sourcePath = join(paths.sessionDir(session.id), bug.logcatRel)
  if (!existsSync(sourcePath)) return null
  const outputPath = join(outDir, `${baseName}.logcat.txt`)
  copyFileSync(sourcePath, outputPath)
  return outputPath
}

async function exportBugEvidence(args: {
  deps: IpcDeps
  session: Session
  bug: Bug
  outDir: string
  baseName: string
  includeLogcat?: boolean
}): Promise<ExportedMarkerFile> {
  const outputPath = join(args.outDir, `${args.baseName}.mp4`)
  const imagePath = join(args.outDir, `${args.baseName}.jpg`)
  const { startMs, endMs } = clampClipWindow({ ...args.bug, durationMs: args.session.durationMs })
  const ffmpegPath = resolveBundledFfmpegPath()
  const clicks = readClickLog(args.deps.paths.clicksFile(args.session.id))
  const inputPath = sessionVideoInputPath(args.session, args.deps.paths)
  const tileSize = await contactSheetTileSize(args.deps.runner, inputPath)
  const clipOptions = {
    inputPath,
    outputPath,
    startMs,
    endMs,
    narrationPath: args.bug.audioRel ? join(args.deps.paths.sessionDir(args.session.id), args.bug.audioRel) : null,
    narrationDurationMs: args.bug.audioDurationMs,
    severity: args.bug.severity,
    note: args.bug.note,
    markerMs: args.bug.offsetMs,
    deviceModel: args.session.deviceModel,
    buildVersion: args.session.buildVersion,
    androidVersion: args.session.androidVersion,
    testNote: args.session.testNote,
    tester: args.session.tester,
    testedAtMs: args.bug.createdAt,
    clicks,
  }
  await extractClip(args.deps.runner, ffmpegPath, clipOptions)
  await extractContactSheet(args.deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath })
  const logcatPath = args.includeLogcat
    ? exportLogcatSidecar(args.deps.paths, args.session, args.bug, args.outDir, args.baseName)
    : null
  return {
    bugId: args.bug.id,
    videoPath: outputPath,
    previewPath: imagePath,
    logcatPath,
  }
}

function readClickLog(filePath: string): { t: number; x: number; y: number }[] {
  if (!existsSync(filePath)) return []
  const clicks: { t: number; x: number; y: number }[] = []
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const raw = JSON.parse(trimmed) as { t?: unknown; x?: unknown; y?: unknown }
      if (typeof raw.t === 'number' && typeof raw.x === 'number' && typeof raw.y === 'number') {
        clicks.push({ t: raw.t, x: raw.x, y: raw.y })
      }
    } catch {
      // Ignore partial lines if the click recorder was stopped while writing.
    }
  }
  return clicks
}

function dockRecordingPanel(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(460, Math.max(380, area.width))
  win.setBounds({
    x: area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  })
}

function restoreReviewWindow(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(1280, area.width)
  const height = Math.min(820, area.height)
  win.setBounds({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  })
}

async function getVideoSize(runner: IProcessRunner, inputPath: string): Promise<{ width: number; height: number } | null> {
  const ffmpegPath = resolveBundledFfmpegPath()
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const r = await runner.run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    inputPath,
  ]).catch(() => null)
  if (r && r.code === 0) {
    const [w, h] = r.stdout.trim().split('x').map(Number)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  }

  const info = await runner.run(ffmpegPath, ['-hide_banner', '-i', inputPath]).catch(() => null)
  const text = `${info?.stdout ?? ''}\n${info?.stderr ?? ''}`
  const matches = [...text.matchAll(/Video:.*?(\d{2,5})x(\d{2,5})/g)]
  const last = matches.at(-1)
  if (!last) return null
  const width = Number(last[1])
  const height = Number(last[2])
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null
}

async function contactSheetTileSize(runner: IProcessRunner, inputPath: string): Promise<{ tileWidth: number; tileHeight: number | null; outputWidth?: number; outputHeight?: number }> {
  const size = await getVideoSize(runner, inputPath)
  if (size) {
    const outputWidth = even(size.width)
    const outputHeight = even(size.height)
    const tileWidth = even(Math.max(2, Math.floor(outputWidth / 3)))
    const tileHeight = even(Math.max(2, Math.floor(outputHeight / 3)))
    return { tileWidth, tileHeight, outputWidth, outputHeight }
  }
  return { tileWidth: 240, tileHeight: 426, outputWidth: 720, outputHeight: 1280 }
}

async function getVideoHasAudio(runner: IProcessRunner, inputPath: string): Promise<boolean> {
  const ffmpegPath = resolveBundledFfmpegPath()
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const r = await runner.run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=index',
    '-of', 'csv=p=0',
    inputPath,
  ]).catch(() => null)
  if (r && r.code === 0) return r.stdout.trim().length > 0

  const info = await runner.run(ffmpegPath, ['-hide_banner', '-i', inputPath]).catch(() => null)
  const text = `${info?.stdout ?? ''}\n${info?.stderr ?? ''}`
  return /Stream #\d+:\d+.*Audio:/i.test(text)
}

function telemetryLineForMarker(paths: Paths, sessionId: string, offsetMs: number): string | null {
  const samples = readTelemetrySamples(paths.telemetryFile(sessionId))
  return formatTelemetryLine(nearestTelemetrySample(samples, offsetMs))
}

interface ReportEntry {
  index: number
  bug: Bug
  imagePath: string
  videoPath: string
  clipStartMs: number
  clipEndMs: number
  severityLabel: string
  severityColor: string
  telemetryLine: string | null
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatReportDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatReportTime(msValue: number): string {
  const totalSeconds = Math.max(0, Math.round(msValue / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function colorText(hex: string): string {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '888888'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? '#111111' : '#ffffff'
}

function reportPdfPath(outDir: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return join(outDir, `QA_bug_report_${safeFilePart(session.buildVersion || session.deviceModel)}_${date}.pdf`)
}

function reportBasePath(outDir: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return join(outDir, `QA_bug_report_${safeFilePart(session.buildVersion || session.deviceModel)}_${date}`)
}

function sortedReportEntries(entries: ReportEntry[]): ReportEntry[] {
  const order: Record<string, number> = { major: 0, normal: 1, minor: 2, improvement: 3, note: 4 }
  return [...entries].sort((a, b) => {
    const ao = order[a.bug.severity] ?? 10
    const bo = order[b.bug.severity] ?? 10
    return ao === bo ? a.index - b.index : ao - bo
  })
}

function groupReportEntries(entries: ReportEntry[]): Map<string, ReportEntry[]> {
  const groups = new Map<string, ReportEntry[]>()
  for (const entry of sortedReportEntries(entries)) {
    const key = entry.bug.severity
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return groups
}

function normalizedReportTitle(reportTitle?: string | null): string {
  return reportTitle?.trim() || 'Loupe QA Report'
}

function buildSlackSummaryText(session: Session, entries: ReportEntry[], pdfPath: string, reportTitle?: string | null): string {
  const groups = groupReportEntries(entries)
  const counts = [...groups.values()].map(items => `${items[0].severityLabel}: ${items.length}`).join(' / ')
  const majorItems = entries.filter(entry => entry.bug.severity === 'major')
  const focusItems = (majorItems.length > 0 ? majorItems : sortedReportEntries(entries)).slice(0, 8)
  const lines = [
    `*${normalizedReportTitle(reportTitle)}*`,
    `Build: ${session.buildVersion || '-'}`,
    `Device: ${session.deviceModel || '-'} / ${session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion || '-'}`}`,
    `Tester: ${session.tester || '-'} / ${formatReportDate(session.startedAt)}`,
    session.testNote ? `Test note: ${session.testNote}` : '',
    `Markers: ${entries.length}${counts ? ` (${counts})` : ''}`,
    '',
    focusItems.length > 0 ? `*${majorItems.length > 0 ? 'Major issues' : 'Highlights'}*` : '',
    ...focusItems.map(entry => {
      const note = entry.bug.note.trim() || 'marker'
      return `#${String(entry.index).padStart(2, '0')} [${entry.severityLabel}] ${note} (${formatReportTime(entry.clipStartMs)}-${formatReportTime(entry.clipEndMs)})`
    }),
    '',
    `PDF: ${pdfPath}`,
  ]
  return `${lines.filter((line, index, arr) => line || arr[index - 1]).join('\n')}\n`
}

function buildReportHtml(session: Session, entries: ReportEntry[], reportTitle?: string | null): string {
  const groups = groupReportEntries(entries)
  const groupList = [...groups.entries()]
  const total = entries.length
  const summaryCards = groupList.map(([severity, items]) => {
    const first = items[0]
    return `
      <div class="summary-card">
        <div class="summary-count" style="color:${escapeHtml(first.severityColor)}">${items.length}</div>
        <div class="summary-label">${escapeHtml(first.severityLabel || severity)}</div>
      </div>
    `
  }).join('')
  const sections = groupList.map(([severity, items]) => {
    const first = items[0]
    const label = first.severityLabel || severity
    const color = first.severityColor || '#888888'
    return `
      <section class="severity-section">
        <div class="section-heading">
          <h2>${escapeHtml(label)}</h2>
          <span class="section-count" style="background:${escapeHtml(color)};color:${colorText(color)}">${items.length}</span>
        </div>
        ${items.map(entry => {
          const note = entry.bug.note.trim() || 'marker'
          const imageUrl = pathToFileURL(entry.imagePath).toString()
          const videoName = entry.videoPath.split(/[\\/]/).pop() ?? entry.videoPath
          return `
            <article class="bug-card">
              <div class="accent" style="background:${escapeHtml(entry.severityColor)}"></div>
              <div class="bug-content">
                <div class="bug-top">
                  <span class="bug-id">#${String(entry.index).padStart(2, '0')}</span>
                  <span class="badge" style="background:${escapeHtml(entry.severityColor)};color:${colorText(entry.severityColor)}">${escapeHtml(entry.severityLabel)}</span>
                  <span class="clip-name">${escapeHtml(videoName)}</span>
                </div>
                <div class="bug-meta">
                  ${escapeHtml(formatReportDate(entry.bug.createdAt))}
                  <span>Clip ${escapeHtml(formatReportTime(entry.clipStartMs))} - ${escapeHtml(formatReportTime(entry.clipEndMs))}</span>
                </div>
                <div class="bug-note">${escapeHtml(note)}</div>
                ${entry.telemetryLine ? `<div class="bug-telemetry">${escapeHtml(entry.telemetryLine)}</div>` : ''}
              </div>
              <img class="thumb" src="${imageUrl}" />
            </article>
          `
        }).join('')}
      </section>
    `
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f1eb;
      color: #202124;
      font-family: "Microsoft JhengHei", "Microsoft YaHei", "Noto Sans CJK TC", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { padding: 38px 46px 44px; }
    .cover {
      min-height: 260px;
      border-bottom: 3px solid #202124;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .kicker {
      display: inline-block;
      border-radius: 999px;
      background: #242320;
      color: white;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
    }
    h1 { margin: 22px 0 10px; font-size: 34px; line-height: 1.15; }
    .subtitle { max-width: 920px; color: #625b53; font-size: 15px; line-height: 1.65; }
    .summary {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin-top: 24px;
    }
    .summary-card {
      min-height: 76px;
      border: 1px solid #d6cdc1;
      border-radius: 10px;
      background: #fffdf8;
      padding: 12px 14px;
    }
    .summary-count { font-size: 28px; line-height: 1; font-weight: 800; }
    .summary-label { margin-top: 12px; color: #625b53; font-size: 13px; font-weight: 700; }
    .severity-section { margin-top: 24px; break-inside: avoid-page; }
    .section-heading {
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #d6cdc1;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .section-heading h2 { margin: 0; font-size: 24px; }
    .section-count {
      min-width: 34px;
      border-radius: 999px;
      padding: 5px 10px;
      text-align: center;
      font-size: 12px;
      font-weight: 800;
    }
    .bug-card {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 172px;
      gap: 18px;
      min-height: 132px;
      margin: 0 0 12px;
      border: 1px solid #d6cdc1;
      border-radius: 12px;
      background: #fffdf8;
      overflow: hidden;
      break-inside: avoid;
    }
    .accent { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; }
    .bug-content { padding: 15px 0 14px 24px; min-width: 0; }
    .bug-top { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .bug-id { font-size: 20px; font-weight: 800; }
    .badge {
      border-radius: 999px;
      padding: 5px 10px 6px;
      font-size: 12px;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
    }
    .clip-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #625b53;
      font-size: 12px;
      font-weight: 700;
    }
    .bug-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
      color: #746b61;
      font-size: 11px;
    }
    .bug-note {
      margin-top: 12px;
      font-size: 19px;
      line-height: 1.45;
      font-weight: 800;
      word-break: break-word;
    }
    .bug-telemetry {
      margin-top: 8px;
      color: #746b61;
      font-size: 11px;
      line-height: 1.35;
    }
    .thumb {
      width: 152px;
      height: 96px;
      margin: 18px 18px 18px 0;
      border: 1px solid #cfc6b9;
      border-radius: 8px;
      object-fit: contain;
      background: #eee9e1;
      justify-self: end;
      align-self: start;
    }
    .footer {
      margin-top: 22px;
      color: #726a60;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <div class="kicker">QA RESULT REPORT</div>
      <h1>${escapeHtml(normalizedReportTitle(reportTitle))}</h1>
      <div class="subtitle">
        ${escapeHtml(session.deviceModel)} / ${escapeHtml(session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion}`)} / ${escapeHtml(session.buildVersion)}
        <br />
        Tester: ${escapeHtml(session.tester || '-')} / Session: ${escapeHtml(formatReportDate(session.startedAt))}
        ${session.testNote ? `<br />${escapeHtml(session.testNote)}` : ''}
      </div>
      <div class="summary">
        ${summaryCards}
        <div class="summary-card">
          <div class="summary-count">${total}</div>
          <div class="summary-label">Total</div>
        </div>
      </div>
    </section>
    ${sections}
    <div class="footer">Generated by Loupe QA Recorder</div>
  </main>
</body>
</html>`
}

async function writeQaReportPdf(outDir: string, session: Session, entries: ReportEntry[], reportTitle?: string | null, owner?: BrowserWindow | null): Promise<string> {
  if (entries.length === 0) throw new Error('cannot create PDF report without entries')
  mkdirSync(outDir, { recursive: true })
  const htmlPath = join(outDir, 'qa-report.html')
  const pdfPath = `${reportBasePath(outDir, session)}.pdf`
  writeFileSync(htmlPath, buildReportHtml(session, entries, reportTitle), 'utf8')

  const win = new BrowserWindow({
    show: false,
    parent: owner ?? undefined,
    width: 1240,
    height: 1754,
    webPreferences: { sandbox: true },
  })
  try {
    await win.loadURL(pathToFileURL(htmlPath).toString())
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
    })
    writeFileSync(pdfPath, pdf)
    return pdfPath
  } finally {
    if (!win.isDestroyed()) win.close()
  }
}

async function writeSummaryText(outDir: string, session: Session, entries: ReportEntry[], pdfPath: string, reportTitle?: string | null): Promise<string> {
  if (entries.length === 0) throw new Error('cannot create summary without entries')
  mkdirSync(outDir, { recursive: true })
  const textPath = join(outDir, 'summery.txt')
  writeFileSync(textPath, buildSlackSummaryText(session, entries, pdfPath, reportTitle), 'utf8')
  return textPath
}

function emitExportProgress(
  sender: Electron.WebContents,
  progress: ExportProgress,
): void {
  sender.send(CHANNEL.bugExportProgress, progress)
}

function emitSessionLoadProgress(sender: Electron.WebContents, progress: SessionLoadProgress): void {
  sender.send(CHANNEL.sessionLoadProgress, progress)
}

function sessionLoadProgress(
  sessionId: string,
  phase: SessionLoadProgress['phase'],
  message: string,
  current: number,
  total: number,
  detail?: string,
): SessionLoadProgress {
  return { sessionId, phase, message, current: Math.max(0, Math.min(total, current)), total, detail }
}

function exportProgress(
  exportId: string,
  phase: ExportProgress['phase'],
  message: string,
  detail: string | undefined,
  current: number,
  total: number,
  clipIndex: number,
  clipCount: number,
): ExportProgress {
  return {
    exportId,
    phase,
    message,
    detail,
    current: Math.max(0, Math.min(total, current)),
    total,
    clipIndex,
    clipCount,
    remaining: Math.max(0, clipCount - clipIndex),
  }
}

function throwIfExportCancelled(exportId: string, signal: AbortSignal): void {
  if (signal.aborted) throw new Error(`export cancelled: ${exportId}`)
}

async function listPcCaptureSources(): Promise<PcCaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    type: source.id.startsWith('screen:') ? 'screen' : 'window',
    displayId: source.display_id || undefined,
    thumbnailDataUrl: source.thumbnail.isEmpty() ? undefined : source.thumbnail.toDataURL(),
  }))
}

async function hidePcCaptureFrame(): Promise<void> {
  pcCaptureFrameToken += 1
  const frame = pcCaptureFrame
  pcCaptureFrame = null
  if (!frame || frame.isDestroyed()) return
  await new Promise<void>((resolve) => {
    frame.once('closed', resolve)
    frame.close()
  })
}

function even(n: number): number {
  const floored = Math.max(2, Math.floor(n))
  return floored % 2 === 0 ? floored : floored - 1
}

function displayPhysicalBounds(display: Electron.Display): Electron.Rectangle {
  if (process.platform !== 'win32') return display.bounds
  return screen.dipToScreenRect(null, display.bounds)
}

function virtualPhysicalBounds(): Electron.Rectangle {
  const rects = screen.getAllDisplays().map(displayPhysicalBounds)
  const left = Math.min(...rects.map(r => r.x))
  const top = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.width))
  const bottom = Math.max(...rects.map(r => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clampToVirtualDesktop(rect: Electron.Rectangle): Electron.Rectangle {
  const virtual = virtualPhysicalBounds()
  return clampRectToBounds(rect, virtual)
}

function clampRectToBounds(rect: Electron.Rectangle, bounds: Electron.Rectangle): Electron.Rectangle {
  const x = Math.max(bounds.x, Math.floor(rect.x))
  const y = Math.max(bounds.y, Math.floor(rect.y))
  const right = Math.min(bounds.x + bounds.width, Math.floor(rect.x + rect.width))
  const bottom = Math.min(bounds.y + bounds.height, Math.floor(rect.y + rect.height))
  return {
    x,
    y,
    width: even(right - x),
    height: even(bottom - y),
  }
}

function parseGdigrabWindowArea(stderr: string): Electron.Rectangle | null {
  const match = stderr.match(/window area \((-?\d+),(-?\d+)\),\((-?\d+),(-?\d+)\)/i)
  if (!match) return null
  const [, x1, y1, x2, y2] = match
  const left = Number(x1)
  const top = Number(y1)
  const right = Number(x2)
  const bottom = Number(y2)
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function isUnsupportedGdigrabDrawMouseError(stderr: string): boolean {
  return /Unrecognized option 'draw_mouse'|Option not found/i.test(stderr)
}

function gdigrabWindowInput(source: PcCaptureSource): string {
  const match = source.id.match(/^window:(\d+):/)
  const hwnd = match ? Number(match[1]) : NaN
  if (Number.isFinite(hwnd) && hwnd > 0) return `hwnd=0x${hwnd.toString(16)}`
  return `title=${source.name}`
}

export function buildMacAvfoundationInputName(source: PcCaptureSource, screenSources: PcCaptureSource[]): string {
  if (source.type !== 'screen') throw new Error('Window PC recording is only supported on Windows for now. Please choose a screen instead.')
  const screenIndex = Math.max(0, screenSources.findIndex(s => s.id === source.id))
  return `Capture screen ${screenIndex}:none`
}

async function startPcFfmpegRecording(sourceId: string, outputPath: string): Promise<void> {
  if (pcRecordingProcess) throw new Error('PC recording is already running')

  const sources = await listPcCaptureSources()
  const source = sources.find(s => s.id === sourceId)
  if (!source) throw new Error('Selected PC capture source is no longer available.')
  if (process.platform !== 'win32' && source.type === 'window') {
    throw new Error('Window PC recording is only supported on Windows for now. Please choose a screen instead.')
  }
  const display = source.type === 'screen'
    ? (source.displayId
        ? screen.getAllDisplays().find(d => String(d.id) === source.displayId)
        : screen.getPrimaryDisplay())
    : null
  if (source.type === 'screen' && !display) throw new Error('Selected display is no longer available.')

  function buildArgs(boundsOverride?: Electron.Rectangle, includeMouse = true): string[] {
    if (process.platform === 'darwin') {
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'warning',
        '-f', 'avfoundation',
        '-framerate', '30',
        '-capture_cursor', '1',
        '-i', buildMacAvfoundationInputName(source!, sources.filter(s => s.type === 'screen')),
      ]
      args.push(
        '-c:v', 'libvpx-vp9',
        '-deadline', 'realtime',
        '-cpu-used', '8',
        '-b:v', '4M',
        '-pix_fmt', 'yuv420p',
        outputPath,
      )
      return args
    }

    if (process.platform !== 'win32') {
      throw new Error(`PC recording is not supported on ${process.platform}.`)
    }

    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'gdigrab', '-framerate', '30']
    if (includeMouse) args.push('-draw_mouse', '1')
    if (source!.type === 'screen') {
      const rawBounds = displayPhysicalBounds(display!)
      const physicalBounds = boundsOverride
        ? clampRectToBounds(rawBounds, boundsOverride)
        : clampToVirtualDesktop(rawBounds)
      args.push(
        '-offset_x', String(physicalBounds.x),
        '-offset_y', String(physicalBounds.y),
        '-video_size', `${physicalBounds.width}x${physicalBounds.height}`,
        '-i', 'desktop',
      )
    } else {
      args.push('-i', gdigrabWindowInput(source!))
    }

    args.push(
      '-c:v', 'libvpx-vp9',
      '-deadline', 'realtime',
      '-cpu-used', '8',
      '-b:v', '4M',
      '-pix_fmt', 'yuv420p',
      outputPath,
    )
    return args
  }

  async function spawnAndWait(args: string[]): Promise<void> {
    pcRecordingStderr = ''
    const proc = spawn(resolveBundledFfmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] })
    pcRecordingProcess = proc
    proc.stderr.on('data', d => { pcRecordingStderr += d.toString() })
    proc.once('exit', () => {
      if (pcRecordingProcess === proc) pcRecordingProcess = null
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.off('exit', onExit)
        resolve()
      }, 800)
      const onExit = (code: number | null) => {
        clearTimeout(timer)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(new Error(`PC recording failed to start (${code ?? 'unknown'}): ${pcRecordingStderr.trim()}`))
      }
      proc.once('exit', onExit)
      proc.once('error', err => {
        clearTimeout(timer)
        proc.off('exit', onExit)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(err)
      })
    })
  }

  let includeMouse = true
  let boundsOverride: Electron.Rectangle | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await spawnAndWait(buildArgs(boundsOverride, includeMouse))
      return
    } catch (err) {
      lastErr = err
      const stderr = pcRecordingStderr
      if (includeMouse && isUnsupportedGdigrabDrawMouseError(stderr)) {
        includeMouse = false
        continue
      }

      const gdigrabBounds = source.type === 'screen' && !boundsOverride ? parseGdigrabWindowArea(stderr) : null
      if (gdigrabBounds) {
        boundsOverride = gdigrabBounds
        continue
      }
      throw err
    }
  }
  throw lastErr
}

async function stopPcFfmpegRecording(): Promise<void> {
  const proc = pcRecordingProcess
  if (!proc) return
  pcRecordingProcess = null
  await new Promise<void>((resolve) => {
    const hardKill = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 5000)
    proc.once('close', () => {
      clearTimeout(hardKill)
      resolve()
    })
    try {
      proc.stdin.write('q')
      proc.stdin.end()
    } catch {
      proc.kill()
    }
  })
}

async function showPcCaptureFrame(sourceId: string, color: 'green' | 'red' = 'red', displayId?: string): Promise<boolean> {
  const token = pcCaptureFrameToken + 1
  await hidePcCaptureFrame()
  pcCaptureFrameToken = token
  if (!sourceId.startsWith('screen:')) return false

  const resolvedDisplayId = displayId ?? sourceId.match(/^screen:(\d+):/)?.[1]
  const display = resolvedDisplayId
    ? screen.getAllDisplays().find(d => String(d.id) === resolvedDisplayId)
    : screen.getPrimaryDisplay()
  if (!display) return false

  if (pcCaptureFrameToken !== token) return false
  const frame = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true },
  })
  pcCaptureFrame = frame
  frame.setIgnoreMouseEvents(true)
  frame.setAlwaysOnTop(true, 'screen-saver')
  const borderColor = color === 'green' ? '#22c55e' : '#ff2d2d'
  const inset = 4
  await frame.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <body style="margin:0;overflow:hidden;background:transparent;">
        <div style="position:fixed;inset:${inset}px;border:2px solid ${borderColor};box-sizing:border-box;"></div>
      </body>
    </html>
  `)}`)
  if (pcCaptureFrameToken !== token) {
    if (!frame.isDestroyed()) frame.close()
    return false
  }
  return true
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))
  ipcMain.handle(CHANNEL.showItemInFolder, async (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(CHANNEL.openPath, async (_e, path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  ipcMain.handle(CHANNEL.getPrimaryScreenSource, async (): Promise<{ id: string; name: string } | null> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    const primaryDisplayId = String(screen.getPrimaryDisplay().id)
    const source = sources.find(s => s.display_id === primaryDisplayId) ?? sources[0]
    return source ? { id: source.id, name: source.name } : null
  })
  ipcMain.handle(CHANNEL.listPcCaptureSources, async () => listPcCaptureSources())
  ipcMain.handle(CHANNEL.showPcCaptureFrame, async (_e, sourceId: string, color?: 'green' | 'red', displayId?: string) => showPcCaptureFrame(sourceId, color, displayId))
  ipcMain.handle(CHANNEL.hidePcCaptureFrame, async () => hidePcCaptureFrame())

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))
  ipcMain.handle(CHANNEL.deviceMdnsScan, async () => deps.adb.mdnsServices())
  ipcMain.handle(CHANNEL.devicePair, async (_e, args: { ipPort: string; code: string }) => deps.adb.pair(args.ipPort, args.code))
  ipcMain.handle(CHANNEL.deviceGetUserName, async (_e, id: string) => deps.adb.getUserDeviceName(id))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => {
    const session = await deps.manager.start(args)
    if (session.connectionMode === 'pc') {
      const outputPath = deps.paths.pcVideoFile(session.id)
      try {
        await showPcCaptureFrame(args.deviceId, 'red').catch(() => false)
        if (process.platform !== 'darwin') {
          await startPcFfmpegRecording(args.deviceId, outputPath)
          deps.db.updateSessionPcRecording(session.id, { pcRecordingEnabled: true, pcVideoPath: outputPath })
          deps.manager.persistProject(session.id)
        }
      } catch (err) {
        await hidePcCaptureFrame()
        await stopPcFfmpegRecording().catch(() => {})
        await deps.manager.discard(session.id).catch(() => {})
        throw err
      }
    }
    dockRecordingPanel(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    const session = await deps.manager.stop()
    restoreReviewWindow(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    return deps.manager.discard(id)
  })
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (event, id: string) => {
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'load', 'Loading session metadata', 0, 4))
    const session = deps.manager.getSession(id)
    if (!session) return null
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'repair', 'Checking marker thumbnails', 1, 4, 'Large sessions can take a moment while missing screenshots are repaired.'))
    await deps.manager.repairBrokenThumbnails(id)
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'load', 'Loading marker list', 2, 4))
    const updated = deps.manager.getSession(id)
    const bugs = deps.manager.listBugs(id)
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'assets', 'Preparing recorded video', 3, 4))
    const result = updated ? { session: updated, bugs } : { session, bugs }
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'complete', 'Session ready', 4, 4))
    return result
  })
  ipcMain.handle(CHANNEL.sessionUpdateMetadata, async (_e, id: string, patch: { buildVersion: string; testNote: string; tester: string }) => {
    deps.manager.updateSessionMetadata(id, patch)
  })
  ipcMain.handle(CHANNEL.sessionSavePcRecording, async (_e, args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string> => {
    const bytes = Buffer.from(args.base64, 'base64')
    return deps.manager.savePcRecording(args.sessionId, bytes)
  })
  ipcMain.handle(CHANNEL.sessionOpenProject, async (): Promise<Session | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] })
      : dialog.showOpenDialog({ title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] }))
    if (pick.canceled || pick.filePaths.length === 0) return null

    const project = readProjectFile(pick.filePaths[0])
    let session: Session = {
      ...project.session,
      tester: project.session.tester ?? '',
      videoPath: project.session.videoPath ?? null,
      pcRecordingEnabled: project.session.pcRecordingEnabled ?? false,
      pcVideoPath: project.session.pcVideoPath ?? null,
    }
    const currentVideoPath = session.connectionMode === 'pc' ? session.pcVideoPath : session.videoPath
    if (!currentVideoPath || !existsSync(currentVideoPath)) {
      const message = currentVideoPath
        ? `The recorded video could not be found:\n${currentVideoPath}\n\nChoose the video file to relink this session.`
        : 'This session does not have a recorded video path. Choose the video file to relink it.'
      const response = await (win
        ? dialog.showMessageBox(win, { type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message })
        : dialog.showMessageBox({ type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message }))
      if (response.response !== 0) return null
      const videoPick = await (win
        ? dialog.showOpenDialog(win, { title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] })
        : dialog.showOpenDialog({ title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] }))
      if (videoPick.canceled || videoPick.filePaths.length === 0) return null
      session = session.connectionMode === 'pc'
        ? { ...session, pcVideoPath: videoPick.filePaths[0] }
        : { ...session, videoPath: videoPick.filePaths[0] }
      writeProjectFile(pick.filePaths[0], session, project.bugs)
    }
    deps.manager.importProject(session, project.bugs.map(b => ({
      ...b,
      sessionId: session.id,
      audioRel: b.audioRel ?? null,
      audioDurationMs: b.audioDurationMs ?? null,
    })))
    return session
  })
  ipcMain.handle(CHANNEL.sessionResolveAssetPath, async (_e, sessionId: string, relPath: string) => {
    if (relPath === 'video.mp4') {
      const session = deps.manager.getSession(sessionId)
      if (session?.videoPath) return session.videoPath
    }
    if (relPath === 'pc-recording.webm') {
      const session = deps.manager.getSession(sessionId)
      if (session?.pcVideoPath) return session.pcVideoPath
    }
    return join(deps.paths.sessionDir(sessionId), relPath)
  })

  ipcMain.handle(CHANNEL.bugUpdate, async (_e, id: string, patch) => deps.manager.updateBug(id, patch))
  ipcMain.handle(CHANNEL.bugGetLogcatPreview, async (_e, args: { sessionId: string; relPath: string; maxLines?: number }) => {
    const filePath = join(deps.paths.sessionDir(args.sessionId), args.relPath)
    if (!existsSync(filePath)) return null
    const lines = readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return null
    if (args.maxLines === undefined) return lines.join('\n')
    const maxLines = Math.max(1, args.maxLines)
    return lines.slice(-maxLines).join('\n')
  })
  ipcMain.handle(CHANNEL.bugDelete, async (_e, id: string) => deps.manager.deleteBug(id))

  ipcMain.handle(CHANNEL.hotkeySetEnabled, async (_e, enabled: boolean) => deps.setHotkeyEnabled(enabled))
  ipcMain.handle(CHANNEL.settingsGet, async () => deps.settings.get())
  ipcMain.handle(CHANNEL.settingsSetExportRoot, async (_e, path: string) => deps.settings.setExportRoot(path))
  ipcMain.handle(CHANNEL.settingsSetHotkeys, async (_e, hotkeys: HotkeySettings) => {
    const settings = deps.settings.setHotkeys(hotkeys)
    deps.setHotkeys(settings.hotkeys)
    return settings
  })
  ipcMain.handle(CHANNEL.settingsSetSlack, async (_e, slack: SlackPublishSettings) => deps.settings.setSlack(slack))
  ipcMain.handle(CHANNEL.settingsSetLocale, async (_e, locale: AppLocale) => deps.settings.setLocale(locale))
  ipcMain.handle(CHANNEL.settingsSetSeverities, async (_e, severities: SeveritySettings) => deps.settings.setSeverities(severities))
  ipcMain.handle(CHANNEL.settingsChooseExportRoot, async (): Promise<ReturnType<SettingsStore['get']> | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] })
      : dialog.showOpenDialog({ title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] }))
    if (pick.canceled || pick.filePaths.length === 0) return null
    return deps.settings.setExportRoot(pick.filePaths[0])
  })

  ipcMain.handle(CHANNEL.bugAddMarker, async (_e, args: { sessionId: string; offsetMs: number; severity?: any; note?: string }) => {
    return deps.manager.addMarker(args)
  })
  ipcMain.handle(CHANNEL.bugSaveAudio, async (_e, args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }) => {
    const bytes = Buffer.from(args.base64, 'base64')
    deps.manager.saveBugAudio(args.sessionId, args.bugId, bytes, args.durationMs)
  })
  ipcMain.handle(CHANNEL.bugExportCancel, async (_e, exportId: string): Promise<void> => {
    exportControllers.get(exportId)?.abort()
  })
  ipcMain.handle(CHANNEL.bugExportClip, async (event, args: { sessionId: string; bugId: string; exportId?: string; reportTitle?: string; includeLogcat?: boolean; publish?: ExportPublishOptions }): Promise<string | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId)
    const bug = bugs.find(b => b.id === args.bugId)
    if (!session || !bug) throw new Error('session or bug not found')
    const exportId = args.exportId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const controller = new AbortController()
    exportControllers.set(exportId, controller)
    const runOpts = { signal: controller.signal }
    const total = 6

    try {
      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing export folder', 'Creating output paths and reading marker metadata.', 0, total, 1, 1))
      const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
      const recordsDir = exportRecordsDir(outDir)
      const reportDir = exportReportDir(outDir)
      mkdirSync(recordsDir, { recursive: true })
      mkdirSync(reportDir, { recursive: true })
      const baseName = exportBaseName(session, bug)
      const outputPath = join(recordsDir, `${baseName}.mp4`)
      const imagePath = join(recordsDir, `${baseName}.jpg`)

      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing clip metadata', `Marker 1 of 1 at ${Math.round(bug.offsetMs / 1000)}s.`, 1, total, 1, 1))
      throwIfExportCancelled(exportId, controller.signal)
      const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
      const ffmpegPath = resolveBundledFfmpegPath()
      const clicks = readClickLog(deps.paths.clicksFile(session.id))
      const inputPath = sessionVideoInputPath(session, deps.paths)
      const tileSize = await contactSheetTileSize(deps.runner, inputPath)
      const sourceHasAudio = await getVideoHasAudio(deps.runner, inputPath)
      const severityStyle = deps.settings.get().severities[bug.severity]
      const telemetryLine = telemetryLineForMarker(deps.paths, session.id, bug.offsetMs)
      const clipOptions = {
        inputPath,
        outputPath,
        startMs, endMs,
        narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
        narrationDurationMs: bug.audioDurationMs,
        severity: bug.severity,
        severityLabel: severityStyle?.label ?? bug.severity,
        severityColor: severityStyle?.color ?? '#888888',
        note: bug.note,
        markerMs: bug.offsetMs,
        clipStartMs: startMs,
        clipEndMs: endMs,
        deviceModel: session.deviceModel,
        buildVersion: session.buildVersion,
        androidVersion: session.androidVersion,
        testNote: session.testNote,
        tester: session.tester,
        testedAtMs: bug.createdAt,
        telemetryLine,
        clicks,
      }
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating 3x2 intro card', `Writing ${imagePath}`, 2, total, 1, 1))
      await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath }, runOpts)
      throwIfExportCancelled(exportId, controller.signal)
      const introSize = await getVideoSize(deps.runner, imagePath)
      emitExportProgress(event.sender, exportProgress(exportId, 'video', 'Exporting video clip', `Writing ${outputPath}`, 3, total, 1, 1))
      if (bug.audioRel || !introSize) {
        await extractClip(deps.runner, ffmpegPath, clipOptions, runOpts)
      } else {
        await extractClipWithIntro(deps.runner, ffmpegPath, {
          ...clipOptions,
          introImagePath: imagePath,
          canvasWidth: introSize.width,
          canvasHeight: introSize.height,
          sourceHasAudio,
        }, runOpts)
      }
      if (!existsSync(outputPath)) throw new Error(`exported clip was not created: ${outputPath}`)
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating PDF report', `Writing PDF report for ${outputPath}`, 4, total, 1, 1))
      const reportTitle = normalizedReportTitle(args.reportTitle)
      const pdfPath = await writeQaReportPdf(reportDir, session, [{
        index: 1,
        bug,
        imagePath,
        videoPath: outputPath,
        clipStartMs: startMs,
        clipEndMs: endMs,
        severityLabel: clipOptions.severityLabel,
        severityColor: clipOptions.severityColor,
        telemetryLine,
      }], reportTitle, deps.getWindow())
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating summary text', `Writing summary text.`, 5, total, 1, 1))
      await writeSummaryText(outDir, session, [{
        index: 1,
        bug,
        imagePath,
        videoPath: outputPath,
        clipStartMs: startMs,
        clipEndMs: endMs,
        severityLabel: clipOptions.severityLabel,
        severityColor: clipOptions.severityColor,
        telemetryLine,
      }], pdfPath, reportTitle)
      const file: ExportedMarkerFile = {
        bugId: bug.id,
        videoPath: outputPath,
        previewPath: imagePath,
        logcatPath: args.includeLogcat ? exportLogcatSidecar(deps.paths, session, bug, recordsDir, baseName) : null,
      }
      const manifestFiles = writeExportManifests({ session, bugs: [bug], files: [file], outDir, publish: args.publish })
      if (args.publish?.target === 'slack') {
        await publishManifestToSlack({
          manifest: manifestFiles.manifest,
          manifestPaths: { jsonPath: manifestFiles.jsonPath, csvPath: manifestFiles.csvPath },
          settings: deps.settings.get().slack,
        })
      }
      emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Export complete', `${outputPath}\n${pdfPath}`, total, total, 1, 1))
      return outputPath
    } catch (err) {
      if (controller.signal.aborted) {
        emitExportProgress(event.sender, exportProgress(exportId, 'error', 'Export canceled', 'The current FFmpeg task was stopped.', total, total, 1, 1))
        throw new Error('export cancelled')
      }
      throw err
    } finally {
      exportControllers.delete(exportId)
    }
  })

  ipcMain.handle(CHANNEL.bugExportClips, async (event, args: { sessionId: string; bugIds: string[]; exportId?: string; reportTitle?: string; includeLogcat?: boolean; publish?: ExportPublishOptions }): Promise<string[] | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId).filter(b => args.bugIds.includes(b.id))
    if (!session) throw new Error('session not found')
    if (bugs.length === 0) return []
    const exportId = args.exportId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const controller = new AbortController()
    exportControllers.set(exportId, controller)
    const runOpts = { signal: controller.signal }
    const total = 3 + bugs.length * 3

    try {
      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing batch export', `Preparing ${bugs.length} selected marker${bugs.length === 1 ? '' : 's'}.`, 0, total, 0, bugs.length))
      const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
      const recordsDir = exportRecordsDir(outDir)
      const reportDir = exportReportDir(outDir)
      mkdirSync(recordsDir, { recursive: true })
      mkdirSync(reportDir, { recursive: true })
      const outputs: string[] = []
      const files: ExportedMarkerFile[] = []
      const reportEntries: ReportEntry[] = []
      const clicks = readClickLog(deps.paths.clicksFile(session.id))
      const telemetrySamples = readTelemetrySamples(deps.paths.telemetryFile(session.id))
      const severities = deps.settings.get().severities
      for (let i = 0; i < bugs.length; i++) {
        throwIfExportCancelled(exportId, controller.signal)
        const bug = bugs[i]
        const clipIndex = i + 1
        const baseProgress = 1 + i * 3
        emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing clip metadata', `Marker ${clipIndex} of ${bugs.length} at ${Math.round(bug.offsetMs / 1000)}s.`, baseProgress, total, clipIndex, bugs.length))
        const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
        const baseName = `${String(i + 1).padStart(2, '0')}-${exportBaseName(session, bug)}`
        const outputPath = join(recordsDir, `${baseName}.mp4`)
        const imagePath = join(recordsDir, `${baseName}.jpg`)
        const ffmpegPath = resolveBundledFfmpegPath()
        const inputPath = sessionVideoInputPath(session, deps.paths)
        const tileSize = await contactSheetTileSize(deps.runner, inputPath)
        const sourceHasAudio = await getVideoHasAudio(deps.runner, inputPath)
        const severityStyle = severities[bug.severity]
        const telemetryLine = formatTelemetryLine(nearestTelemetrySample(telemetrySamples, bug.offsetMs))
        const clipOptions = {
          inputPath,
          outputPath,
          startMs,
          endMs,
          narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
          narrationDurationMs: bug.audioDurationMs,
          severity: bug.severity,
          severityLabel: severityStyle?.label ?? bug.severity,
          severityColor: severityStyle?.color ?? '#888888',
          note: bug.note,
          markerMs: bug.offsetMs,
          clipStartMs: startMs,
          clipEndMs: endMs,
          deviceModel: session.deviceModel,
          buildVersion: session.buildVersion,
          androidVersion: session.androidVersion,
          testNote: session.testNote,
          tester: session.tester,
          testedAtMs: bug.createdAt,
          telemetryLine,
          clicks,
        }
        emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating 3x2 intro card', `Marker ${clipIndex} of ${bugs.length}: ${imagePath}`, baseProgress + 1, total, clipIndex, bugs.length))
        await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath }, runOpts)
        throwIfExportCancelled(exportId, controller.signal)
        const introSize = await getVideoSize(deps.runner, imagePath)
        emitExportProgress(event.sender, exportProgress(exportId, 'video', 'Exporting video clip', `Marker ${clipIndex} of ${bugs.length}: ${outputPath}`, baseProgress + 2, total, clipIndex, bugs.length))
        if (bug.audioRel || !introSize) {
          await extractClip(deps.runner, ffmpegPath, clipOptions, runOpts)
        } else {
          await extractClipWithIntro(deps.runner, ffmpegPath, {
            ...clipOptions,
            introImagePath: imagePath,
            canvasWidth: introSize.width,
            canvasHeight: introSize.height,
            sourceHasAudio,
          }, runOpts)
        }
        if (!existsSync(outputPath)) throw new Error(`exported clip was not created: ${outputPath}`)
        outputs.push(outputPath)
        files.push({
          bugId: bug.id,
          videoPath: outputPath,
          previewPath: imagePath,
          logcatPath: args.includeLogcat ? exportLogcatSidecar(deps.paths, session, bug, recordsDir, baseName) : null,
        })
        reportEntries.push({
          index: clipIndex,
          bug,
          imagePath,
          videoPath: outputPath,
          clipStartMs: startMs,
          clipEndMs: endMs,
          severityLabel: clipOptions.severityLabel,
          severityColor: clipOptions.severityColor,
          telemetryLine,
        })
        emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Finished marker export', `Marker ${clipIndex} of ${bugs.length} complete.`, baseProgress + 3, total, clipIndex, bugs.length))
      }
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating PDF report', `Writing QA report for ${outputs.length} exported clip${outputs.length === 1 ? '' : 's'}.`, total - 2, total, bugs.length, bugs.length))
      const reportTitle = normalizedReportTitle(args.reportTitle)
      const pdfPath = await writeQaReportPdf(reportDir, session, reportEntries, reportTitle, deps.getWindow())
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating summary text', 'Writing summary text.', total - 1, total, bugs.length, bugs.length))
      await writeSummaryText(outDir, session, reportEntries, pdfPath, reportTitle)
      const manifestFiles = writeExportManifests({ session, bugs, files, outDir, publish: args.publish })
      if (args.publish?.target === 'slack') {
        await publishManifestToSlack({
          manifest: manifestFiles.manifest,
          manifestPaths: { jsonPath: manifestFiles.jsonPath, csvPath: manifestFiles.csvPath },
          settings: deps.settings.get().slack,
        })
      }
      emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Export complete', `${outputs.length} clip${outputs.length === 1 ? '' : 's'} exported.\n${pdfPath}`, total, total, bugs.length, bugs.length))
      return outputs
    } catch (err) {
      if (controller.signal.aborted) {
        emitExportProgress(event.sender, exportProgress(exportId, 'error', 'Export canceled', 'The current FFmpeg task was stopped. Finished files are kept.', total, total, bugs.length, bugs.length))
        throw new Error('export cancelled')
      }
      throw err
    } finally {
      exportControllers.delete(exportId)
    }
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null, severity = 'normal') {
  win?.webContents.send(CHANNEL.bugMarkRequested, severity)
}
