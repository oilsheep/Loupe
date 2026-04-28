# Loupe QA Recorder

Loupe QA Recorder is a Windows desktop tool for Android QA sessions. It lets testers control an Android device from the PC, continuously record the session, mark bugs with hotkeys, review every marker, and export clean bug clips with captions, notes, optional voice notes, and preview sheets.

It is designed for QA workflows where the tester needs to keep recording, drop timestamps quickly, and turn the session into shareable evidence without manually hunting through a long video afterward.

## Product Highlights

- **PC-controlled Android testing**: control and view an Android device through bundled `adb` and `scrcpy`.
- **Continuous session recording**: record the full QA session while testing.
- **Instant bug markers**: press a hotkey to create a marker without interrupting the test flow.
- **Marker types**: `note`, `major`, `normal`, `minor`, and `improvement`.
- **Default recording hotkeys**:
  - `F6`: improvement
  - `F7`: minor
  - `F8`: normal
  - `F9`: major
- **Review timeline**: click a marker to replay the exact export window from start to end.
- **Editable export range**: adjust clip start and end offsets per marker.
- **Batch export**: select multiple markers and export all selected clips.
- **Captioned clips**: exported videos include note text, build, OS, device, tester, and timestamp.
- **Voice notes**: record audio notes per marker and embed them into exported clips.
- **Preview sheet export**: every clip also exports a 3x3 contact sheet with the same note metadata.
- **Session projects**: sessions are saved as `.loupe` files and can be reopened later.
- **One-click Windows installer**: packaged builds include the required Android tooling, so users do not need to install adb or scrcpy separately.

## Installation

### For QA Users

1. Download `Loupe QA Recorder-0.0.0-Setup.exe` from the provided release package.
2. Run the installer.
3. If Windows SmartScreen warns about an unknown publisher, choose **More info** and then **Run anyway**.
4. Launch **Loupe QA Recorder** from the desktop shortcut or Start menu.

The installer includes the required Windows builds of `adb`, `scrcpy`, and export tooling. No extra Android Platform Tools installation is required.

### Android Device Setup

For USB testing:

1. Enable **Developer options** on the Android device.
2. Enable **USB debugging**.
3. Connect the device to the PC with a USB data cable.
4. Accept the Android debugging authorization prompt on the device.
5. In Loupe, connect to the detected device.

For Wi-Fi testing:

1. Enable **Wireless debugging** in Android Developer options.
2. Keep the PC and phone on the same network.
3. Use the Wi-Fi pairing flow in Loupe.
4. After pairing, the device name appears in the connected state.

## Basic Workflow

1. Connect an Android device.
2. Enter the build or test version.
3. Start a recording session.
4. During testing, press `F6` / `F7` / `F8` / `F9` to add markers.
5. Stop the session.
6. Review markers, add notes, adjust clip ranges, and optionally record voice notes.
7. Select markers and export clips.
8. Share the generated MP4 clips and 3x3 preview sheets.

## Export Format

Each selected marker exports:

- one trimmed MP4 clip
- one 3x3 preview image sheet

The caption area uses a light gray background with black text and includes:

```text
Marker note
Build / Android OS / Device
Tester / Computer timestamp
```

Long notes wrap automatically to stay inside the video width.

## Session Files

Each session is saved as a `.loupe` project file. Reopening a `.loupe` file restores markers, notes, clip ranges, voice notes, and the linked recording.

If the original recording is missing, Loupe prompts the user to locate the video manually.

## Developer Setup

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development mode:

```bash
pnpm rebuild:electron
pnpm desktop:dev
```

Run type checks:

```bash
pnpm --filter desktop typecheck
```

If `better-sqlite3` reports a `NODE_MODULE_VERSION` mismatch, rebuild it for the runtime you are using:

```bash
pnpm rebuild:electron
pnpm rebuild:node
```

## Build the Windows Installer

From the repository root:

```bash
pnpm install
pnpm rebuild:electron
pnpm --filter desktop dist:win
```

The installer is generated under:

```text
apps/desktop/dist/
```

`dist/` is ignored by git because it contains local build artifacts.

## Documentation

- [User Guide](docs/user-guide.md)
- [Chinese User Guide](docs/Loupe%20%E4%BD%BF%E7%94%A8%E8%AA%AA%E6%98%8E.md)

## License

Loupe QA Recorder source code is licensed under the [MIT License](LICENSE).

Packaged builds include third-party components such as scrcpy, Android Platform Tools, FFmpeg libraries, SDL2, libusb, Electron, and npm dependencies. These components keep their original licenses and are not relicensed under MIT. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
