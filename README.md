# Loupe QA Recorder

Loupe QA Recorder is a Windows desktop tool for QA recording. It supports Android device recording and, starting in **0.0.2**, PC full-screen recording with selectable displays.

Loupe is designed for sessions where testers keep recording, drop bug markers quickly, review the timeline afterward, and export short evidence clips without manually searching through a long recording.

## What's New in 0.0.2

- **PC full-screen recording**: choose which monitor to record from the left panel.
- **Screen selection frame**: selected PC screens show a green frame before recording and a red frame while recording.
- **PC marker thumbnails**: PC markers get thumbnails immediately from the selected screen source.
- **Landscape-aware review sheets**: exported 3x3 preview images now preserve landscape recordings instead of forcing a phone portrait layout.
- **PC and Android source picker**: PC screen and Android devices are selected from the same left-side source list.

## Product Highlights

- **Android QA recording**: control and record Android devices through bundled `adb` and `scrcpy`.
- **PC screen recording**: record a selected full monitor for PC-based test cases.
- **Instant markers**: add markers with hotkeys or the colored Add buttons during recording.
- **Marker types**: `note`, `major`, `normal`, `minor`, and `improvement`.
- **Default recording hotkeys**:
  - `F6`: improvement
  - `F7`: minor
  - `F8`: normal
  - `F9`: major
- **Review timeline**: click a marker to replay the exact export window.
- **Editable export range**: adjust clip start and end offsets per marker.
- **Batch export**: select multiple markers and export all selected clips.
- **Captioned clips**: exported videos include severity, note, build, OS, device/source, tester, and timestamp.
- **Voice notes**: record audio notes per marker and embed them into exported clips.
- **Preview sheet export**: every clip also exports a 3x3 contact sheet with matching metadata.
- **Session projects**: sessions are saved as `.loupe` files and can be reopened later.
- **One-click Windows installer**: packaged builds include the required Android and export tooling.

## Installation

### For QA Users

1. Download `Loupe QA Recorder-0.0.2-Setup.exe` from the release package.
2. Run the installer.
3. If Windows SmartScreen warns about an unknown publisher, choose **More info** and then **Run anyway**.
4. Launch **Loupe QA Recorder** from the desktop shortcut or Start menu.

The installer includes the required Windows builds of `adb`, `scrcpy`, and export tooling. No extra Android Platform Tools installation is required.

## Recording Sources

### PC Screen Recording

1. Open Loupe.
2. In the left panel, find **PC recording**.
3. Select the monitor you want to record.
4. Confirm the green frame appears on the selected screen.
5. Enter the build or test version.
6. Press **Start session**.
7. While recording, the selected screen shows a thin red frame.
8. Add markers with `F6` / `F7` / `F8` / `F9` or the colored Add buttons.

PC recording currently supports full-screen monitor capture only. Application/window capture is intentionally hidden until it is reliable enough for QA use.

### Android Device Setup

Official Android references:

- [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- [Connect to your device using Wi-Fi](https://developer.android.com/studio/run/device#wireless)

To enable Developer options:

1. Open Android **Settings**.
2. Go to **About phone**.
3. Tap **Build number** seven times.
4. Enter the device PIN/password if Android asks for confirmation.
5. Return to Settings. Developer options should now appear, often under **System > Developer options**.

For USB testing:

1. In **Developer options**, turn on **USB debugging**.
2. Connect the device to the PC with a USB data cable.
3. Accept the Android debugging authorization prompt on the device.
4. In Loupe, select the detected USB device on the left.

For Wi-Fi testing:

1. Make sure the PC and phone are on the same Wi-Fi network.
2. In **Developer options**, turn on **Wireless debugging**.
3. Tap **Wireless debugging**.
4. Tap **Pair device with pairing code**. Android shows an IP:port and a six-digit pairing code.
5. In Loupe, press **Scan Wi-Fi devices**.
6. If Loupe shows a pairing entry, press **Pair**, enter the six-digit code, and submit.
7. Scan again if needed, then press **Connect** on the ready Wi-Fi entry.
8. After pairing, the device appears as connected in the left panel.

If discovery does not find the phone, use the manual **Add Wi-Fi device** field with the IP:port shown by Android Wireless debugging.

## Basic Workflow

1. Select a PC screen or Android device.
2. Enter the build or test version.
3. Start a recording session.
4. During testing, add markers with hotkeys or the colored Add buttons.
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
Severity / Marker note
Build / OS / Device or PC screen
Tester / Computer timestamp
```

Long notes wrap automatically. Landscape recordings export landscape preview sheets; portrait recordings export portrait preview sheets.

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
