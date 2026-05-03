# Loupe QA Recorder

Loupe QA Recorder is a Windows desktop app for QA teams that need fast, repeatable bug evidence. It records long Android or PC test sessions, lets testers drop timestamped markers during testing, and exports short annotated clips, evidence sheets, and QA reports for selected markers.

The app is built around a simple loop: **record once, mark instantly, review later, export clean evidence**.

## Latest Version

**Current version: 0.1.0**

Version 0.1.0 turns Loupe into a broader QA evidence workflow: Android recording, PC full-screen recording, customizable marker labels, batch exports, and shareable reports are packaged together.

## What's New in 0.1.0

- **Custom marker labels**: rename labels, edit colors, keep four hotkey labels, and add up to four mouse-only labels.
- **Cleaner recording panel**: collapsed colored label buttons can create markers directly, reducing screen obstruction during testing.
- **Faster marker flow**: markers appear immediately while thumbnails are filled in asynchronously.
- **PC full-screen recording**: select a monitor and record desktop or web test cases with visible selection/recording frames.
- **Richer exports**: selected markers export MP4 clips, six-frame evidence sheets, PDF/HTML reports, and a compact `summery.txt`.
- **Report workflow**: exports are organized into `records/` and `report/` folders, with a configurable report title.
- **Safer long sessions**: large session loading and batch export progress provide clearer feedback and cancellation behavior.

## At a Glance

| Area | What Loupe Does |
| --- | --- |
| Android testing | Records Android devices through bundled `adb` and `scrcpy`, with USB and Wireless debugging support. |
| PC testing | Records a selected full monitor for desktop or web test cases. |
| Fast markers | Adds markers with configurable hotkeys or colored buttons while recording. |
| Review | Replays each marker's export range directly from the review list. |
| Export | Creates MP4 clips, six-frame evidence sheets, PDF/HTML reports, and a short text summary. |
| Session files | Saves work as `.loupe` projects so markers, notes, recordings, and voice notes can be reopened later. |

## Product Highlights

- **Android QA recording**: control and record Android devices through bundled `adb` and `scrcpy`.
- **PC screen recording**: record a selected full monitor for PC-based test cases.
- **Instant markers**: add markers with hotkeys or the colored label buttons during recording.
- **Default marker labels**: `Note`, `Polish`, `Bug`, and `Critical`.
- **Custom labels**: add up to four extra mouse-only labels, for a total of eight labels.
- **Default recording hotkeys**:
  - `F6`: Note
  - `F7`: Polish
  - `F8`: Bug
  - `F9`: Critical
- **Review timeline**: click a marker to replay the exact export window.
- **Editable export range**: adjust clip start and end offsets per marker.
- **Batch export**: select multiple markers and export all selected clips.
- **Captioned clips**: exported videos include severity, note, build, OS, device/source, tester, timestamp, clip range, and sampled device status when available.
- **Voice notes**: record audio notes per marker and embed them into exported clips.
- **Evidence sheets**: every clip also exports a six-frame image sheet with matching metadata.
- **QA reports**: batch export generates HTML/PDF reports plus `summery.txt`.
- **Session projects**: sessions are saved as `.loupe` files and can be reopened later.

## Download and Install

The packaged Windows installer is generated as:

```text
Loupe QA Recorder-0.1.0.exe
```

For a portable handoff, use the zip package:

```text
Loupe QA Recorder-0.1.0.zip
```

Packaged builds include the required Windows builds of `adb`, `scrcpy`, FFmpeg, and export tooling. QA users do not need to install Android Platform Tools separately.

## Installation

1. Download `Loupe QA Recorder-0.1.0.exe` or the portable zip package.
2. Run the installer, or unzip the portable build and launch `Loupe QA Recorder.exe`.
3. If Windows SmartScreen warns about an unknown publisher, choose **More info** and then **Run anyway**.

## Recording Sources

### PC Screen Recording

1. Open Loupe.
2. In the left panel, find **PC recording**.
3. Select the monitor you want to record.
4. Confirm the green frame appears on the selected screen.
5. Enter the build or test version.
6. Press **Start session**.
7. While recording, the selected screen shows a thin red frame.
8. Add markers with `F6` / `F7` / `F8` / `F9` or the colored label buttons.

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
4. During testing, add markers with hotkeys or the colored label buttons.
5. Stop the session.
6. Review markers, add notes, adjust clip ranges, and optionally record voice notes.
7. Select markers and export clips.
8. Share the generated MP4 clips, six-frame evidence sheets, reports, and summary file.

## Export Format

Each selected marker exports:

- one trimmed MP4 clip
- one six-frame preview image sheet

Batch export also creates:

- `records/`: exported MP4 clips and image sheets
- `report/`: HTML and PDF QA report
- `summery.txt`: compact text summary for quick sharing

The caption area uses a light gray background with black text and includes:

```text
Severity / Marker note
Build / OS / Device or PC screen
Tester / Computer timestamp
Clip range
Sampled device status, when available
```

Long notes wrap automatically. Landscape recordings export landscape evidence sheets; portrait recordings export portrait evidence sheets.

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

## Build the Windows Package

From the repository root:

```bash
pnpm install
pnpm rebuild:electron
pnpm --filter desktop dist:win
```

The installer and portable zip are generated under:

```text
apps/desktop/dist/
```

`dist/` is ignored by git because it contains local build artifacts.

## Documentation

- [User Guide](docs/user-guide.md)
- [Chinese User Guide](docs/Loupe%20%E4%BD%BF%E7%94%A8%E8%AA%AA%E6%98%8E.md)
- [Slack Setup](docs/slack-setup.md)
- [macOS Signing and Notarization](docs/macos-signing.md)
- [Changelog](CHANGELOG.md)

## 中文簡介

Loupe QA Recorder 是給 QA 測試使用的 Windows 錄影工具。它可以錄 Android 手機，也可以錄 PC 全螢幕；測試中用熱鍵或彩色標籤快速打點，停止後再補 note、調整裁切範圍、錄語音註記，最後輸出 bug 影片、六張圖證據圖、HTML/PDF 報告與 `summery.txt`。

0.1.0 重點包含自訂標籤名稱與顏色、最多 8 種標籤、錄製中直接點標籤打點、批次輸出進度、報告輸出，以及更完整的 Android / PC 測試流程。

## License

Loupe QA Recorder source code is licensed under the [MIT License](LICENSE).

Packaged builds include third-party components such as scrcpy, Android Platform Tools, FFmpeg libraries, SDL2, libusb, Electron, and npm dependencies. These components keep their original licenses and are not relicensed under MIT. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
