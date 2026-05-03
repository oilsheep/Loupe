# Loupe QA Recorder

Loupe QA Recorder is a Windows desktop app for QA teams that need fast, repeatable bug evidence. It records long Android or PC test sessions, lets testers drop timestamped markers during testing, and exports short annotated clips, evidence sheets, and QA reports for selected markers.

The app is built around a simple loop: **record once, mark instantly, review later, export clean evidence**.

## Latest Version

**Current version: 0.5.0**

Version 0.5.0 expands Loupe from a recorder into a complete QA evidence workstation: record Android, PC, and iOS sessions, import existing videos, auto-create markers from speech, annotate the exact video frame, and publish polished reports to the tools your team already uses.

## Major Features Added Since 0.1.0

- **Video annotations in review**: draw rectangles, ellipses, arrows, freehand strokes, and text directly on the reviewed frame; annotations are saved per marker and rendered into exported clips.
- **Editor-style timeline**: zoom the review timeline with `Alt + wheel`, drag the viewport, scrub playback, and adjust marker clip ranges with timeline handles.
- **Imported video workflow**: bring in an existing MP4, add session metadata, optionally attach a separate tester audio track, and review/export it like a recorded session.
- **Speech-assisted QA review**: run microphone or imported-video audio through local STT, create audio auto-markers, and convert marker audio into notes without keeping voice-note audio in exports.
- **iOS recording path**: added an iOS source flow using UxPlay/AirPlay mirroring, tool-status checks, and iOS syslog capture hooks for supported environments.
- **Remote publishing**: export locally and optionally publish reports/evidence to Slack, GitLab, and Google Drive/Sheets with mention identity support.
- **Common QA metadata**: platform, project, tester, build version, report title, and test notes are editable at session start, review, and export time, with reusable preference lists.
- **Unlimited custom labels**: marker labels now support user-defined names and colors beyond the original eight-label limit, while default hotkeys remain available for the first four labels.
- **Localized preferences and UI**: language, labels, STT settings, publish settings, common metadata, and tool status are consolidated into preferences, with Traditional/Simplified Chinese support and additional UI cleanup.
- **Safer evidence generation**: long-session loading, batch export progress, cancellation, missing-video recovery, no-marker export handling, and Android disconnect recovery are handled more gracefully.
- **Packaged tool management**: bundled/managed tools cover Android recording, FFmpeg export, UxPlay/go-ios paths, and local STT runtime checks so QA users see actionable setup status.

## At a Glance

| Area | What Loupe Does |
| --- | --- |
| Android testing | Records Android devices through bundled `adb` and `scrcpy`, with USB and Wireless debugging support. |
| PC testing | Records a selected full monitor for desktop or web test cases. |
| iOS testing | Records an AirPlay mirrored iPhone/iPad window through the UxPlay source flow where available. |
| Imported videos | Opens existing recordings and moves directly into review/export. |
| Fast markers | Adds markers with configurable hotkeys or colored buttons while recording. |
| Review | Replays marker ranges, zooms the timeline, edits ranges, and overlays frame annotations. |
| Export | Creates annotated MP4 clips, six-frame evidence sheets, PDF/HTML reports, and a short text summary. |
| Publish | Sends exported QA evidence to Slack, GitLab, or Google Drive/Sheets when configured. |
| Session files | Saves work as `.loupe` projects so markers, notes, recordings, metadata, and annotations can be reopened later. |

## Product Highlights

- **Android QA recording**: control and record Android devices through bundled `adb` and `scrcpy`.
- **PC screen recording**: record a selected full monitor for PC-based test cases.
- **iOS AirPlay recording**: use the UxPlay source flow to capture mirrored iOS sessions on supported setups.
- **Existing video analysis**: import a finished recording and start directly in review, with optional separate tester audio.
- **Instant markers**: add markers with hotkeys or the colored label buttons during recording.
- **Default marker labels**: `Note`, `Polish`, `Bug`, and `Critical`.
- **Custom labels**: add as many colored marker labels as your workflow needs.
- **Default recording hotkeys**:
  - `F6`: Note
  - `F7`: Polish
  - `F8`: Bug
  - `F9`: Critical
- **Speech-to-text marker notes**: transcribe tester audio into marker notes and generate audio auto-markers.
- **Review timeline**: click or drag through the timeline, zoom into dense areas, and replay the exact export window.
- **Editable export range**: adjust clip start and end offsets per marker from the list or timeline handles.
- **Video annotations**: draw shape, arrow, freehand, and text annotations that render into exported clips.
- **Batch export**: select multiple markers and export all selected clips.
- **Captioned clips**: exported videos include severity, note, build, OS, device/source, tester, timestamp, clip range, and sampled device status when available.
- **Evidence sheets**: every clip also exports a six-frame image sheet with matching metadata.
- **QA reports**: batch export generates HTML/PDF reports plus `summery.txt`.
- **Remote publish**: optionally publish exported evidence to Slack, GitLab, or Google Drive/Sheets.
- **Preferences**: configure language, default labels, common platforms/projects/testers, STT, and publish settings.
- **Session projects**: sessions are saved as `.loupe` files and can be reopened later.

## Download and Install

The packaged Windows installer is generated as:

```text
Loupe QA Recorder-0.5.0.exe
```

For a portable handoff, use the zip package:

```text
Loupe QA Recorder-0.5.0.zip
```

Packaged builds include the required Windows builds of `adb`, `scrcpy`, FFmpeg, and export tooling. QA users do not need to install Android Platform Tools separately.

## Installation

1. Download `Loupe QA Recorder-0.5.0.exe` or the portable zip package.
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
6. Review markers, add notes or STT transcripts, adjust clip ranges, and add video annotations.
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

Each session is saved as a `.loupe` project file. Reopening a `.loupe` file restores markers, notes, clip ranges, annotations, metadata, and the linked recording.

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

## 中文介紹

Loupe QA Recorder 是為 QA、測試工程師與遊戲/應用開發團隊設計的桌面工具。它的核心目標是把「長時間測試錄影、即時打點、事後整理、輸出可分享證據」整合成同一個流程，減少手動剪片、截圖、整理報告與回報 bug 的時間。

### 適合的使用情境

- 長時間測試 Android、PC、iOS 鏡像畫面，測到問題時快速按熱鍵打點。
- 測試結束後回到 review 畫面，補上 note、調整要輸出的前後秒數，確認每個 bug 片段。
- 匯入既有影片，不重新錄製也能進入同一套 review、標記、輸出流程。
- 需要把測試證據輸出給企劃、工程、PM 或外部合作方，包含影片、圖片、PDF/HTML 報告與文字摘要。

### 0.5.0 主要功能

- **多來源錄製**：支援 Android USB/Wi-Fi、PC 螢幕錄製，以及可用環境下的 iOS UxPlay/AirPlay 鏡像錄製流程。
- **匯入既有影片**：選擇已錄好的影片後，填入平台、專案、版本、測試人員等資訊，就能直接進入 review。
- **快速打點**：預設 `F6` Note、`F7` Polish、`F8` Bug、`F9` Critical，也可以用畫面上的彩色標籤按鈕打點。
- **自訂標籤**：標籤名稱與顏色都能調整，也能新增更多自訂標籤，讓團隊依照自己的 bug 分類工作。
- **語音輔助 review**：可對麥克風或影片音軌做 STT，產生自動打點或把語音轉成 marker note。
- **影片標記工具**：在 review 階段可直接在影片畫面上加矩形、橢圓、箭頭、自由筆畫與文字標註，輸出影片時會一起疊加。
- **剪輯式時間軸**：時間軸可縮放、拖曳視窗、拖拉 marker 的輸出範圍，方便精準調整長影片中的短片段。
- **批次輸出**：可一次勾選多個 marker，輸出帶註記的 MP4、六張圖證據圖、PDF/HTML QA report 與 `summery.txt`。
- **遠端分享**：可設定 Slack、GitLab、Google Drive/Sheets，把輸出的 QA evidence 發佈到團隊使用的平台。
- **Session 存檔**：每次 session 會保存為 `.loupe`，之後可重新讀取 marker、note、標註、輸出範圍與原始影片。

### 基本流程

1. 選擇錄製來源，或選擇「匯入影片」。
2. 填入平台、專案、測試版本、測試人員與測試註記。
3. 開始錄製，測試中用熱鍵或彩色標籤打點。
4. 停止後進入 review，補 note、調整切片範圍、加入影片標記。
5. 勾選要輸出的 marker，確認輸出路徑與報告資訊。
6. 取得 `records/` 內的影片與圖片，以及 `report/` 內的 HTML/PDF 報告。

### 安裝與相依工具

Windows 打包版會盡量內含常用工具，例如 Android 錄製用的 `adb` / `scrcpy`、影片處理用的 FFmpeg，以及部分 iOS/STT 相關工具檢查。一般 QA 使用者不需要另外安裝 Android Platform Tools。若某些進階功能缺少外部工具，Loupe 會在「工具狀態」中提示目前缺少什麼，以及下一步該怎麼處理。

## License

Loupe QA Recorder source code is licensed under the [MIT License](LICENSE).

Packaged builds include third-party components such as scrcpy, Android Platform Tools, FFmpeg libraries, SDL2, libusb, Electron, and npm dependencies. These components keep their original licenses and are not relicensed under MIT. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
