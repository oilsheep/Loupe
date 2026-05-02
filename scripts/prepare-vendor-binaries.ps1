param(
  [switch]$BestEffort,
  [switch]$Ci,
  [switch]$Force,
  [switch]$WithUxPlay,
  [switch]$InstallDeps,
  [string]$GoIosVersion = $env:GO_IOS_VERSION,
  [string]$UxPlayRef = $env:UXPLAY_REF
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($GoIosVersion)) {
  $GoIosVersion = 'latest'
}
if ([string]::IsNullOrWhiteSpace($UxPlayRef)) {
  $UxPlayRef = 'master'
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

function Get-MsysRoot {
  if (-not [string]::IsNullOrWhiteSpace($env:MSYS2_ROOT)) {
    return $env:MSYS2_ROOT
  }
  return 'C:\msys64'
}

function Get-MsysBash {
  $Root = Get-MsysRoot
  $Bash = Join-Path $Root 'usr\bin\bash.exe'
  if (Test-Path $Bash) {
    return $Bash
  }
  return $null
}

function Invoke-Msys([string]$Command) {
  $Bash = Get-MsysBash
  if (-not $Bash) {
    Fail-Or-Skip 'MSYS2 bash was not found. Install MSYS2 at C:\msys64 or set MSYS2_ROOT.'
    return $false
  }

  $oldMsystem = $env:MSYSTEM
  $oldChere = $env:CHERE_INVOKING
  $oldPath = $env:PATH
  try {
    $env:MSYSTEM = 'UCRT64'
    $env:CHERE_INVOKING = '1'
    $env:PATH = '/ucrt64/bin:/usr/bin:' + $env:PATH
    & $Bash -lc $Command
    return $LASTEXITCODE -eq 0
  } finally {
    $env:MSYSTEM = $oldMsystem
    $env:CHERE_INVOKING = $oldChere
    $env:PATH = $oldPath
  }
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
    Prepare-UxPlayFromSource $Platform
    return
  }

  Fail-Or-Skip 'UxPlay not prepared. Set LOUPE_UXPLAY_ARCHIVE to a prebuilt uxplay.exe archive.'
}

function Prepare-UxPlayFromSource([string]$Platform) {
  $MsysRoot = Get-MsysRoot
  $BonjourDefault = 'C:\Program Files\Bonjour SDK'
  if ([string]::IsNullOrWhiteSpace($env:BONJOUR_SDK_HOME) -and -not (Test-Path $BonjourDefault)) {
    Fail-Or-Skip 'Bonjour SDK is required to build UxPlay on Windows. Install Bonjour SDK v3.0 or set BONJOUR_SDK_HOME.'
    return
  }

  $DestDir = Join-Path $VendorDir "uxplay\$Platform\bin"
  $TempName = "loupe-uxplay-$([Guid]::NewGuid().ToString('N'))"
  $WorkDirWin = Join-Path (Join-Path $MsysRoot 'tmp') $TempName
  $WorkDirUnix = "/tmp/$TempName"
  New-Item -ItemType Directory -Force -Path $WorkDirWin | Out-Null

  try {
    if ($InstallDeps -or $env:LOUPE_UXPLAY_INSTALL_DEPS -eq '1') {
      Write-Step 'Installing UxPlay MSYS2 build dependencies'
      $packages = @(
        'git',
        'mingw-w64-ucrt-x86_64-cmake',
        'mingw-w64-ucrt-x86_64-gcc',
        'mingw-w64-ucrt-x86_64-ninja',
        'mingw-w64-ucrt-x86_64-libplist',
        'mingw-w64-ucrt-x86_64-gstreamer',
        'mingw-w64-ucrt-x86_64-gst-plugins-base',
        'mingw-w64-ucrt-x86_64-gst-plugins-good',
        'mingw-w64-ucrt-x86_64-gst-plugins-bad',
        'mingw-w64-ucrt-x86_64-gst-libav'
      )
      $installCommand = 'pacman -S --needed --noconfirm ' + ($packages -join ' ')
      if (-not (Invoke-Msys $installCommand)) {
        Fail-Or-Skip 'UxPlay MSYS2 dependency installation failed'
        return
      }
    }

    Write-Step "Building UxPlay $UxPlayRef from source for $Platform"
    $commands = @(
      'set -e',
      "cd '$WorkDirUnix'",
      "git clone --depth 1 --branch '$UxPlayRef' https://github.com/FDH2/UxPlay.git UxPlay",
      'cmake -S UxPlay -B build -G Ninja -DCMAKE_BUILD_TYPE=Release',
      'cmake --build build --parallel'
    ) -join '; '
    if (-not (Invoke-Msys $commands)) {
      Fail-Or-Skip 'UxPlay source build failed'
      return
    }

    $Candidate = Join-Path $WorkDirWin 'build\uxplay.exe'
    if (-not (Test-Path $Candidate)) {
      Fail-Or-Skip 'UxPlay build did not produce uxplay.exe'
      return
    }

    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    Copy-Item -Force $Candidate (Join-Path $DestDir 'uxplay.exe')

    $License = Join-Path $WorkDirWin 'UxPlay\LICENSE'
    if (Test-Path $License) {
      Copy-Item -Force $License (Join-Path $VendorDir 'uxplay\LICENSE.UxPlay')
    }

    $destCommand = 'dest="$(cygpath -u ''' + $DestDir + ''')"'
    $awkCommand = 'ldd uxplay.exe | awk ''/=> \/ucrt64/ { print $3 } /^\/ucrt64/ { print $1 }'' | sort -u | while read dll; do cp -n "$dll" "$dest/"; done'
    $copyDlls = @(
      'set -e',
      "cd '$WorkDirUnix/build'",
      $destCommand,
      $awkCommand
    ) -join '; '
    Invoke-Msys $copyDlls | Out-Null

    Write-Step "UxPlay ready: $(Join-Path $DestDir 'uxplay.exe')"
  } finally {
    Remove-Item -Recurse -Force $WorkDirWin -ErrorAction SilentlyContinue
  }
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
