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

Check:

```bash
ios --version
```

macOS installer:

```bash
npm install -g go-ios
```

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
vendor/faster-whisper
```

The vendor folders may contain only README files in development. Offline
distribution builds should populate them with platform-specific binaries,
runtimes, and models.

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
- A faster-whisper helper runtime or packaged executable.
- A small default faster-whisper model.

The current implementation supports these layouts, while still allowing managed
tool installation during development or power-user setups.
