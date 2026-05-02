param(
  [switch]$BestEffort,
  [switch]$Ci,
  [switch]$Force,
  [switch]$WithUxPlay,
  [switch]$InstallDeps,
  [string]$BonjourSdkHome = $env:BONJOUR_SDK_HOME,
  [string]$BonjourSdkInstaller = $env:LOUPE_BONJOUR_SDK_INSTALLER,
  [string]$BonjourSdkDownloadUrl = $env:LOUPE_BONJOUR_SDK_DOWNLOAD_URL,
  [string]$BonjourSdkDownloadSha256 = $env:LOUPE_BONJOUR_SDK_DOWNLOAD_SHA256,
  [string]$BonjourSdkInstallerArgs = $env:LOUPE_BONJOUR_SDK_INSTALLER_ARGS,
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

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-InstallerProcess([string]$FilePath, [string[]]$ArgumentList) {
  $startInfo = @{
    FilePath     = $FilePath
    ArgumentList = $ArgumentList
    Wait         = $true
    PassThru     = $true
  }

  if (-not (Test-IsAdministrator)) {
    Write-Step 'Bonjour SDK installation requires administrator privileges; requesting elevation.'
    $startInfo.Verb = 'RunAs'
  }

  try {
    return Start-Process @startInfo
  } catch {
    Fail-Or-Skip "Bonjour SDK installation requires administrator privileges. Re-run from an elevated terminal or accept the UAC prompt. $($_.Exception.Message)"
    return $null
  }
}

function Start-PrivilegedProcess([string]$FilePath, [string[]]$ArgumentList, [string]$PrivilegeMessage) {
  $startInfo = @{
    FilePath     = $FilePath
    ArgumentList = $ArgumentList
    Wait         = $true
    PassThru     = $true
  }

  if (-not (Test-IsAdministrator)) {
    Write-Step $PrivilegeMessage
    $startInfo.Verb = 'RunAs'
  }

  try {
    return Start-Process @startInfo
  } catch {
    Fail-Or-Skip "$PrivilegeMessage $($_.Exception.Message)"
    return $null
  }
}

function Test-BonjourSdkHome([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $false
  }

  $resolved = [Environment]::ExpandEnvironmentVariables($Path)
  return (Test-Path (Join-Path $resolved 'Include')) -and (Test-Path (Join-Path $resolved 'Lib'))
}

function Resolve-BonjourSdkHome {
  $candidates = @(
    $BonjourSdkHome,
    $env:BONJOUR_SDK_HOME,
    'C:\Program Files\Bonjour SDK',
    'C:\Program Files (x86)\Bonjour SDK'
  )

  foreach ($candidate in $candidates) {
    if (Test-BonjourSdkHome $candidate) {
      return [Environment]::ExpandEnvironmentVariables($candidate)
    }
  }

  return $null
}

function Resolve-BonjourSdkInstaller {
  $candidates = @(
    $BonjourSdkInstaller,
    $env:LOUPE_BONJOUR_SDK_INSTALLER,
    (Join-Path $RootDir 'BonjourSDK.msi'),
    (Join-Path $RootDir 'BonjourSDK.exe'),
    (Join-Path $RootDir 'bonjoursdksetup.exe'),
    (Join-Path $RootDir 'scripts\BonjourSDK.msi'),
    (Join-Path $RootDir 'scripts\BonjourSDK.exe'),
    (Join-Path $RootDir 'scripts\bonjoursdksetup.exe'),
    (Join-Path $RootDir 'apps\desktop\vendor\uxplay\BonjourSDK.msi'),
    (Join-Path $RootDir 'apps\desktop\vendor\uxplay\bonjour-sdk.msi'),
    (Join-Path $RootDir 'apps\desktop\vendor\uxplay\BonjourSDK.exe'),
    (Join-Path $RootDir 'apps\desktop\vendor\uxplay\bonjoursdksetup.exe')
  )

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    $resolved = [Environment]::ExpandEnvironmentVariables($candidate)
    if (Test-Path $resolved) {
      return $resolved
    }
  }

  return $null
}

function Resolve-BonjourSdkDownloadUrl {
  $candidates = @(
    $BonjourSdkDownloadUrl,
    $env:LOUPE_BONJOUR_SDK_DOWNLOAD_URL,
    'https://office.macaca.games/bonjoursdk/bonjoursdksetup.exe'
  )

  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate.Trim()
    }
  }

  return $null
}

function Download-BonjourSdkIfRequested {
  $downloadUrl = Resolve-BonjourSdkDownloadUrl
  if ([string]::IsNullOrWhiteSpace($downloadUrl)) {
    return $null
  }

  $extension = [IO.Path]::GetExtension(([Uri]$downloadUrl).AbsolutePath)
  if (($extension -ne '.msi') -and ($extension -ne '.exe')) {
    Fail-Or-Skip 'Bonjour SDK download URL must point to a .msi or .exe installer. Set LOUPE_BONJOUR_SDK_DOWNLOAD_URL to a direct installer URL.'
    return $null
  }

  $downloadDir = Join-Path ([IO.Path]::GetTempPath()) 'loupe-bonjour-sdk'
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
  $destination = Join-Path $downloadDir ("BonjourSDK$extension")

  Write-Step "Downloading Bonjour SDK from $downloadUrl"
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $destination
  } catch {
    Fail-Or-Skip "Bonjour SDK download failed: $($_.Exception.Message)"
    return $null
  }

  $expectedSha = if ([string]::IsNullOrWhiteSpace($BonjourSdkDownloadSha256)) { $env:LOUPE_BONJOUR_SDK_DOWNLOAD_SHA256 } else { $BonjourSdkDownloadSha256 }
  if (-not [string]::IsNullOrWhiteSpace($expectedSha)) {
    $actualSha = (Get-FileHash -Path $destination -Algorithm SHA256).Hash
    if ($actualSha -ne $expectedSha.ToUpperInvariant()) {
      Remove-Item -Force $destination -ErrorAction SilentlyContinue
      Fail-Or-Skip "Bonjour SDK download SHA256 mismatch. Expected $expectedSha but got $actualSha"
      return $null
    }
  }

  return $destination
}

function Install-BonjourSdkIfRequested {
  $installerPath = Resolve-BonjourSdkInstaller
  if ([string]::IsNullOrWhiteSpace($installerPath)) {
    $installerPath = Download-BonjourSdkIfRequested
  }
  if ([string]::IsNullOrWhiteSpace($installerPath)) {
    return $false
  }

  if (-not (Test-Path $installerPath)) {
    Fail-Or-Skip "Bonjour SDK installer was not found: $installerPath"
    return $false
  }

  $extension = [IO.Path]::GetExtension($installerPath)
  if (($extension -ne '.msi') -and ($extension -ne '.exe')) {
    Fail-Or-Skip 'Bonjour SDK auto-install currently supports MSI and EXE installers only. Set LOUPE_BONJOUR_SDK_INSTALLER to a local installer file or LOUPE_BONJOUR_SDK_DOWNLOAD_URL to a direct installer URL.'
    return $false
  }

  Write-Step "Installing Bonjour SDK from $installerPath"
  if ($extension -eq '.msi') {
    $process = Start-InstallerProcess 'msiexec.exe' @('/i', $installerPath, '/qn', '/norestart')
  } else {
    $installerArgs = if ([string]::IsNullOrWhiteSpace($BonjourSdkInstallerArgs)) {
      @('/q')
    } else {
      $BonjourSdkInstallerArgs -split '\s+'
    }
    $process = Start-InstallerProcess $installerPath $installerArgs
  }

  if (-not $process) {
    return $false
  }

  if ($process.ExitCode -ne 0) {
    if (($process.ExitCode -eq 1603) -and (-not (Test-IsAdministrator))) {
      Fail-Or-Skip 'Bonjour SDK installation failed because administrator privileges are required. Re-run from an elevated terminal or accept the UAC prompt.'
      return $false
    }
    Fail-Or-Skip "Bonjour SDK installation failed with exit code $($process.ExitCode)"
    return $false
  }

  return $true
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

function Convert-WindowsPathToMsys([string]$Path) {
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  $normalized = $expanded -replace '\\', '/'
  if ($normalized -match '^([A-Za-z]):/(.*)$') {
    return "/$($matches[1].ToLowerInvariant())/$($matches[2])"
  }
  return $normalized
}

function Install-Msys2IfRequested {
  if (Get-MsysBash) {
    return $true
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Fail-Or-Skip 'MSYS2 bash was not found and winget is unavailable. Install MSYS2 at C:\msys64 or set MSYS2_ROOT.'
    return $false
  }

  Write-Step 'MSYS2 was not found; installing MSYS2 Installer via winget.'
  $process = Start-PrivilegedProcess $winget.Source @(
    'install',
    '--id', 'MSYS2.MSYS2',
    '--exact',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--disable-interactivity'
  ) 'MSYS2 installation requires administrator privileges; requesting elevation.'

  if (-not $process) {
    return $false
  }

  if ($process.ExitCode -ne 0) {
    Fail-Or-Skip "MSYS2 installation failed with exit code $($process.ExitCode)"
    return $false
  }

  return [bool](Get-MsysBash)
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
    if (-not (Install-Msys2IfRequested)) {
      Fail-Or-Skip 'MSYS2 bash was not found. Install MSYS2 at C:\msys64 or set MSYS2_ROOT.'
      return $false
    }
    $Bash = Get-MsysBash
    if (-not $Bash) {
      Fail-Or-Skip 'MSYS2 installation completed but bash.exe was not found. Set MSYS2_ROOT to the installed MSYS2 location.'
      return $false
    }
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

  Write-Step 'UxPlay not prepared; skipping optional AirPlay fallback. Set LOUPE_UXPLAY_ARCHIVE or pass -WithUxPlay to include it.'
}

function Prepare-UxPlayFromSource([string]$Platform) {
  $MsysRoot = Get-MsysRoot
  $ResolvedBonjourSdkHome = Resolve-BonjourSdkHome
  if (-not $ResolvedBonjourSdkHome -and (Install-BonjourSdkIfRequested)) {
    $ResolvedBonjourSdkHome = Resolve-BonjourSdkHome
  }

  if (-not $ResolvedBonjourSdkHome) {
    Fail-Or-Skip 'Bonjour SDK is required to build UxPlay on Windows. Install Bonjour SDK v3.0, set BONJOUR_SDK_HOME, set LOUPE_BONJOUR_SDK_INSTALLER to a local installer file, or set LOUPE_BONJOUR_SDK_DOWNLOAD_URL to a direct installer URL.'
    return
  }

  $env:BONJOUR_SDK_HOME = $ResolvedBonjourSdkHome
  Write-Step "Using Bonjour SDK: $ResolvedBonjourSdkHome"

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

    $destCommand = "dest='$(Convert-WindowsPathToMsys $DestDir)'"
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

function Invoke-VendorPreparation {
  $Platform = Get-PlatformKey
  Write-Step "Target platform: $Platform"
  New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null

  try { Prepare-GoIos $Platform } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }
  try { Prepare-UxPlay $Platform } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }
  try { Check-Scrcpy } catch { if ($Ci) { throw } else { Write-Warn $_.Exception.Message } }

  Write-Step 'Done'
}

try {
  Invoke-VendorPreparation
} catch {
  [Console]::Error.WriteLine("[vendor] $($_.Exception.Message)")
  exit 1
}
