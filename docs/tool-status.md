# Tool Status Page

The Tool Status page is Loupe's dependency health dashboard. It shows which
third-party tools are available, where Loupe found them, and which tools can be
installed or downloaded into Loupe's managed tool directory.

## Goals

- Make missing recording and analysis dependencies visible before a workflow fails.
- Keep user-facing errors specific: missing runtime, missing model, missing binary,
  or failed install.
- Prefer bundled or Loupe-managed tools over system-wide tools.
- Avoid requiring users to manually edit `PATH`.

## Where It Lives

- UI route: `apps/desktop/src/routes/ToolStatus.tsx`
- Tool checks and installers: `apps/desktop/electron/doctor.ts`
- Tool path resolution: `apps/desktop/electron/tool-paths.ts`
- faster-whisper runtime/model resolution:
  `apps/desktop/electron/audio-analysis/fasterWhisperRuntime.ts`

The Home screen links to Tool Status through `HomeTopBar`. If any required tool
is missing, Home shows a small attention indicator.

## Checked Tools

### adb

Used for Android device discovery, USB/Wi-Fi debugging, logcat, screenshots, and
device control.

Check:

```bash
adb --version
```

macOS installer:

```bash
brew install android-platform-tools
```

### scrcpy

Used for Android screen mirroring and recording.

Check:

```bash
scrcpy --version
```

macOS installer:

```bash
brew install scrcpy
```

Packaged Windows builds can bundle scrcpy under `vendor/scrcpy`.

### uxplay

Used as the UxPlay/AirPlay iOS fallback receiver. This mode is view and record
only; it does not provide iOS control.

Lookup order:

1. `LOUPE_TOOLS_DIR`
2. `~/.loupe/tools/bin`
3. `~/.loupe/tools/uxplay/<platform-arch>/bin`
4. `~/.loupe/tools/uxplay/bin`
5. bundled app resources under `vendor/uxplay`
6. project-local `vendor/uxplay`
7. system paths such as `/opt/homebrew/bin`, `/usr/local/bin`, and `PATH`

Expected bundled layouts:

```text
vendor/uxplay/darwin-arm64/bin/uxplay
vendor/uxplay/darwin-x64/bin/uxplay
vendor/uxplay/win32-x64/bin/uxplay.exe
vendor/uxplay/linux-x64/bin/uxplay
```

macOS installer builds UxPlay from source into `~/.loupe/tools`:

1. Install build dependencies with Homebrew.
2. Clone `https://github.com/FDH2/UxPlay.git`.
3. Build with CMake.
4. Install into Loupe's managed tools directory.

Licensing note: UxPlay is GPL-3.0. If Loupe bundles UxPlay binaries, the release
must include the corresponding license and source offer/source link.

### go-ios

Used for iOS app launch and syslog capture.

Lookup order follows Loupe's normal tool path resolution:

1. `LOUPE_TOOLS_DIR`
2. `~/.loupe/tools/bin`
3. `~/.loupe/tools/go-ios/<platform-arch>/bin`
4. `~/.loupe/tools/go-ios/bin`
5. bundled app resources under `vendor/go-ios`
6. project-local `vendor/go-ios`
7. system paths such as `/opt/homebrew/bin`, `/usr/local/bin`, and `PATH`

Expected bundled layouts:

```text
vendor/go-ios/darwin-arm64/bin/ios
vendor/go-ios/darwin-x64/bin/ios
vendor/go-ios/win32-x64/bin/ios.exe
vendor/go-ios/linux-x64/bin/ios
```

Check:

```bash
ios --version
```

macOS installer:

```bash
npm install -g go-ios
```

Bundling go-ios removes the npm requirement for packaged builds. It does not
remove iOS 17+ tunnel/permission requirements such as `ios tunnel start`.
go-ios is MIT licensed.

### faster-whisper

Used for audio marker analysis when the selected speech-to-text engine is
`faster-whisper`.

This check is for the runtime only: a Python executable that can import the
`faster_whisper` package.

Python lookup order:

1. `LOUPE_PYTHON`
2. bundled runtime under `vendor/faster-whisper/<platform-arch>`
3. Loupe-managed venv at `~/.loupe/tools/faster-whisper-venv`
4. system `python` or `python3`

Expected bundled runtime layouts:

```text
vendor/faster-whisper/darwin-arm64/bin/python
vendor/faster-whisper/darwin-x64/bin/python
vendor/faster-whisper/win32-x64/Scripts/python.exe
vendor/faster-whisper/linux-x64/bin/python
```

macOS installer creates a managed venv:

```bash
python3 -m venv ~/.loupe/tools/faster-whisper-venv
~/.loupe/tools/faster-whisper-venv/bin/python -m pip install --upgrade pip
~/.loupe/tools/faster-whisper-venv/bin/python -m pip install --upgrade faster-whisper
```

This still needs a bootstrap Python unless Loupe ships a bundled runtime.

### faster-whisper-model

This check is separate from the runtime. It verifies that Loupe has a local
model directory, so audio analysis does not unexpectedly depend on a runtime
download.

Default model:

```text
small
```

Download source:

```text
Systran/faster-whisper-small
```

Model lookup order:

1. `vendor/faster-whisper/models/small`
2. `vendor/faster-whisper/<platform-arch>/models/small`
3. `~/.loupe/tools/faster-whisper/models/small`
4. fallback string `small`

The Tool Status check only reports OK when a local model directory exists. A
usable model directory should contain files such as:

```text
config.json
model.bin
tokenizer.json
```

Installer behavior:

1. Use the resolved faster-whisper Python runtime.
2. Install or upgrade `huggingface_hub`.
3. Download `Systran/faster-whisper-small` into
   `~/.loupe/tools/faster-whisper/models/small`.

## Managed Tools Directory

By default Loupe-managed tools live under:

```text
~/.loupe/tools
```

This can be overridden with:

```bash
LOUPE_MANAGED_TOOLS_DIR=/path/to/tools
```

For ad-hoc external tools, use:

```bash
LOUPE_TOOLS_DIR=/path/to/bin
```

## Bundled Resources

Packaged app builds include these vendor directories through `extraResources`:

```text
vendor/scrcpy
vendor/whisper
vendor/uxplay
vendor/go-ios
vendor/faster-whisper
```

The vendor folders may contain only README files in development. Offline
distribution builds should populate them with platform-specific binaries,
runtimes, and models.

## Preparing Vendor Binaries

Development launchers run vendor preparation in best-effort mode before starting
Electron:

```bash
./start-dev.sh
```

```bat
start-dev.bat
```

Windows launcher modes:

```bat
start-dev.bat vendor
start-dev.bat build
start-dev.bat dev uxplay
```

`vendor` prepares binaries only. `build` prepares binaries in strict mode before
packaging. `dev uxplay` keeps dev startup best-effort, but also tries the UxPlay
source build path.

For CI or release jobs, run the stricter scripts directly:

```bash
scripts/prepare-vendor-binaries.sh --ci
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-vendor-binaries.ps1 -Ci
```

Root package scripts are also available:

```bash
pnpm vendor:prepare:mac
pnpm vendor:prepare:win
```

`vendor:prepare:mac` installs the Homebrew build dependencies and builds UxPlay
from source. `vendor:prepare:win` uses MSYS2 UCRT64 to build UxPlay from source;
it requires Bonjour SDK v3.0 at `C:\Program Files\Bonjour SDK` or
`BONJOUR_SDK_HOME`. If you already have a local Bonjour SDK MSI installer, set
`LOUPE_BONJOUR_SDK_INSTALLER` and the PowerShell script will install it before
building. The existing Windows launcher also auto-detects `BonjourSDK.msi`
or `bonjoursdksetup.exe` from the repo root, `scripts/`, or
`apps/desktop/vendor/uxplay/`. Windows can also download the SDK automatically
when `LOUPE_BONJOUR_SDK_DOWNLOAD_URL` points to a direct `.msi` or `.exe` URL.
If not set, the script defaults to
`https://office.macaca.games/bonjoursdk/bonjoursdksetup.exe`. Optionally set
`LOUPE_BONJOUR_SDK_DOWNLOAD_SHA256` to verify the downloaded installer.
If `C:\msys64` is missing, the script also installs `MSYS2.MSYS2` via `winget`
and then continues with the UCRT64 package installation. Windows can
also skip source builds by setting
`LOUPE_UXPLAY_ARCHIVE` to a prebuilt archive containing `uxplay.exe` and its
runtime DLLs. Checked-in binaries under `apps/desktop/vendor/uxplay` are also
supported and are copied into packaged builds as-is.

Current behavior:

- `go-ios` is pulled from the npm `go-ios` package and copied into
  `vendor/go-ios/<platform-arch>/bin`.
- Windows scrcpy is expected under `vendor/scrcpy`; the script verifies
  `scrcpy.exe` and `adb.exe`.
- UxPlay can be supplied by archive with `LOUPE_UXPLAY_ARCHIVE=/path/to/archive`.
  On macOS, `--with-uxplay` or `LOUPE_BUILD_UXPLAY=1` builds from source.
  Add `--install-deps` or `LOUPE_UXPLAY_INSTALL_DEPS=1` to install Homebrew
  dependencies (`cmake`, `git`, `libplist`, `openssl@3`, `pkg-config`,
  `gstreamer`). On Windows, source builds use MSYS2 UCRT64 packages
  (`cmake`, `gcc`, `ninja`, `libplist`, `gstreamer`, and common GStreamer
  plugins) plus Bonjour SDK. `LOUPE_BONJOUR_SDK_INSTALLER` may point to a
  local Bonjour SDK `.msi` or `.exe` file for unattended installation before
  the build. `LOUPE_BONJOUR_SDK_DOWNLOAD_URL` may point to a direct installer
  URL, with optional `LOUPE_BONJOUR_SDK_DOWNLOAD_SHA256` verification. If MSYS2
  is absent, the script installs it through `winget` before running the MSYS2
  package steps.
- faster-whisper is still managed by the Tool Status installer/runtime logic;
  there is no standalone faster-whisper binary prepared by these scripts.

## Installation Console

Tool Status streams installer stdout/stderr into the UI. The console keeps the
latest output and auto-scrolls while install commands run. This is intentionally
shown in the tool page so users can see Homebrew, npm, pip, CMake, or model
download progress without opening a terminal.

## Failure Patterns

- `uxplay` missing: UxPlay/AirPlay iOS fallback cannot start.
- `faster-whisper` missing: audio analysis cannot import the runtime package.
- `faster-whisper-model` missing: audio analysis may fail offline or try to use
  a remote/cache model name.
- Homebrew missing: macOS installers for adb, scrcpy, and UxPlay cannot run.
- Python missing: managed faster-whisper venv cannot be created unless a bundled
  runtime is provided.

## Product Direction

For the smoothest user experience, bundled releases should eventually include:

- UxPlay helper binaries per platform.
- go-ios helper binaries per platform.
- A faster-whisper helper runtime or packaged executable.
- A small default faster-whisper model.

The current implementation supports these layouts, while still allowing managed
tool installation during development or power-user setups.
