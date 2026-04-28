import { Buffer } from 'node:buffer'
import type { IProcessRunner, SpawnedProcess } from './process-runner'

export interface ClickRecorderOptions {
  outputPath: string
  windowTitle: string
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildClickRecorderScript(opts: ClickRecorderOptions): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class LoupeWinApi {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
}
"@
$path = ${psQuote(opts.outputPath)}
$title = ${psQuote(opts.windowTitle)}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
Set-Content -Path $path -Value '' -Encoding UTF8
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$wasDown = $false
while ($true) {
  $down = (([LoupeWinApi]::GetAsyncKeyState(1) -band 0x8000) -ne 0)
  if ($down -and -not $wasDown) {
    $hwnd = [LoupeWinApi]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [LoupeWinApi]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
    if ($sb.ToString().Contains($title)) {
      $pt = New-Object LoupeWinApi+POINT
      $rect = New-Object LoupeWinApi+RECT
      $origin = New-Object LoupeWinApi+POINT
      if ([LoupeWinApi]::GetCursorPos([ref]$pt) -and [LoupeWinApi]::GetClientRect($hwnd, [ref]$rect) -and [LoupeWinApi]::ClientToScreen($hwnd, [ref]$origin)) {
        $w = [Math]::Max(1, $rect.Right - $rect.Left)
        $h = [Math]::Max(1, $rect.Bottom - $rect.Top)
        $localX = $pt.X - $origin.X
        $localY = $pt.Y - $origin.Y
        if ($localX -ge 0 -and $localY -ge 0 -and $localX -le $w -and $localY -le $h) {
          $nx = [Math]::Min(1, [Math]::Max(0, $localX / $w))
          $ny = [Math]::Min(1, [Math]::Max(0, $localY / $h))
          $line = ('{{"t":{0},"x":{1:0.######},"y":{2:0.######}}}' -f [int]$sw.ElapsedMilliseconds, $nx, $ny)
          [System.IO.File]::AppendAllText($path, $line + [Environment]::NewLine)
        }
      }
    }
  }
  $wasDown = $down
  Start-Sleep -Milliseconds 8
}
`.trim()
}

export class ClickRecorder {
  private process?: SpawnedProcess

  constructor(private runner: IProcessRunner, private platform: NodeJS.Platform = process.platform) {}

  start(opts: ClickRecorderOptions): void {
    if (this.platform !== 'win32') return
    this.stop()
    const encoded = Buffer.from(buildClickRecorderScript(opts), 'utf16le').toString('base64')
    this.process = this.runner.spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded])
  }

  stop(): void {
    const proc = this.process
    this.process = undefined
    if (!proc) return
    proc.kill()
  }
}
