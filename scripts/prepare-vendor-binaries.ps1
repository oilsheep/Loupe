param(
  [switch]$BestEffort,
  [switch]$Ci,
  [switch]$Force,
  [switch]$WithUxPlay,
  [string]$GoIosVersion = $env:GO_IOS_VERSION
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($GoIosVersion)) {
  $GoIosVersion = 'latest'
}

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$VendorDir = Join-Path $RootDir 'apps\desktop\vendor'
$Mode = if ($Ci) { 'ci' } elseif ($BestEffort) { 'best-effort' } else { 'normal' }

function Write-Step([string]$Message) {
  Write-Host "[vendor] $Message"
}

function Write-Warn([string]$Message) {
  Write-Warning "[vendor] $Message"
}

function Fail-Or-Skip([string]$Message) {
  if ($Mode -eq 'ci') {
    throw $Message
  }
  Write-Warn $Message
}

function Get-PlatformKey {
  if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
    throw 'This script is intended for Windows. Use prepare-vendor-binaries.sh on macOS/Linux.'
  }
  $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    'ARM64' { 'arm64' }
    default { 'x64' }
  }
  "win32-$arch"
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail-Or-Skip "$Name is required"
    return $false
  }
  return $true
}

function Get-FirstFile([string]$Root, [string]$Name) {
  Get-ChildItem -Path $Root -Recurse -File -Filter $Name -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Expand-ArchiveAny([string]$Archive, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  if ($Archive.EndsWith('.zip', [StringComparison]::OrdinalIgnoreCase)) {
    Expand-Archive -Path $Archive -DestinationPath $Destination -Force
    return
  }
  if ($Archive.EndsWith('.tgz', [StringComparison]::OrdinalIgnoreCase) -or $Archive.EndsWith('.tar.gz', [StringComparison]::OrdinalIgnoreCase)) {
    if (-not (Require-Command 'tar')) { return }
    tar -xzf $Archive -C $Destination
    return
  }
  Fail-Or-Skip "Unsupported archive format: $Archive"
}

function Prepare-GoIos([string]$Platform) {
  $DestDir = Join-Path $VendorDir "go-ios\$Platform\bin"
  $Dest = Join-Path $DestDir 'ios.exe'

  if ((Test-Path $Dest) -and -not $Force) {
    Write-Step "go-ios already prepared: $Dest"
    return
  }

  if (-not (Require-Command 'npm')) { return }
  if (-not (Require-Command 'tar')) { return }

  Write-Step "Preparing go-ios $GoIosVersion for $Platform"
  $WorkDir = Join-Path ([IO.Path]::GetTempPath()) "loupe-go-ios-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

  try {
    try {
      npm pack "go-ios@$GoIosVersion" --pack-destination $WorkDir | Out-Null
    } catch {
      Fail-Or-Skip 'Failed to download go-ios npm package'
      return
    }

    $Archive = Get-FirstFile $WorkDir '*.tgz'
    if (-not $Archive) {
      Fail-Or-Skip 'npm did not produce a go-ios package archive'
      return
    }

    tar -xzf $Archive.FullName -C $WorkDir
    $PackageDir = Join-Path $WorkDir 'package'
    $Candidate = Get-ChildItem -Path $PackageDir -Recurse -File -Filter 'ios.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like "*$Platform*" } |
      Select-Object -First 1
    if (-not $Candidate) {
      $Candidate = Get-FirstFile $PackageDir 'ios.exe'
    }
    if (-not $Candidate) {
      Fail-Or-Skip 'go-ios package did not contain ios.exe'
      return
    }

    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    Copy-Item -Force $Candidate.FullName $Dest

    $License = Get-ChildItem -Path $PackageDir -Recurse -File -Filter 'LICENSE*' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($License) {
      Copy-Item -Force $License.FullName (Join-Path $VendorDir 'go-ios\LICENSE.go-ios')
    }

    Write-Step "go-ios ready: $Dest"
  } finally {
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
  }
}

function Prepare-UxPlay([string]$Platform) {
  $DestDir = Join-Path $VendorDir "uxplay\$Platform\bin"
  $Dest = Join-Path $DestDir 'uxplay.exe'

  if ((Test-Path $Dest) -and -not $Force) {
    Write-Step "UxPlay already prepared: $Dest"
    return
  }

  $Archive = $env:LOUPE_UXPLAY_ARCHIVE
  if (-not [string]::IsNullOrWhiteSpace($Archive)) {
    if (-not (Test-Path $Archive)) {
      Fail-Or-Skip "LOUPE_UXPLAY_ARCHIVE does not exist: $Archive"
      return
    }

    $WorkDir = Join-Path ([IO.Path]::GetTempPath()) "loupe-uxplay-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    try {
      Expand-ArchiveAny $Archive $WorkDir
      $Candidate = Get-FirstFile $WorkDir 'uxplay.exe'
      if (-not $Candidate) {
        Fail-Or-Skip 'UxPlay archive did not contain uxplay.exe'
        return
      }
      New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
      Copy-Item -Force $Candidate.FullName $Dest
      Write-Step "UxPlay ready: $Dest"
      return
    } finally {
      Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
    }
  }

  if ($WithUxPlay -or $env:LOUPE_BUILD_UXPLAY -eq '1') {
    Fail-Or-Skip 'UxPlay Windows source build is not wired yet. Provide LOUPE_UXPLAY_ARCHIVE with a prebuilt uxplay.exe archive.'
    return
  }

  Fail-Or-Skip 'UxPlay not prepared. Set LOUPE_UXPLAY_ARCHIVE to a prebuilt uxplay.exe archive.'
}

function Check-Scrcpy {
  $Scrcpy = Join-Path $VendorDir 'scrcpy\scrcpy.exe'
  $Adb = Join-Path $VendorDir 'scrcpy\adb.exe'
  if ((Test-Path $Scrcpy) -and (Test-Path $Adb)) {
    Write-Step "scrcpy Windows bundle already present"
    return
  }
  Fail-Or-Skip 'scrcpy Windows bundle is missing. Place scrcpy.exe and adb.exe under apps\desktop\vendor\scrcpy.'
}

$Platform = Get-PlatformKey
Write-Step "Target platform: $Platform"
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null

try { Prepare-GoIos $Platform } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }
try { Prepare-UxPlay $Platform } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }
try { Check-Scrcpy } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }

Write-Step 'Done'
