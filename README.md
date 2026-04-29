# Loupe QA Recorder

Loupe QA Recorder is a Windows desktop app for QA teams that need fast, repeatable bug evidence. It records long Android or PC test sessions, lets testers drop timestamped bug markers during testing, and exports short annotated clips plus contact-sheet images for each selected marker.

The app is built around a simple loop: **record once, mark instantly, review later, export clean evidence**. Testers do not need to scrub through a full session manually after every bug.

## At a Glance

| Area | What Loupe Does |
| --- | --- |
| Android testing | Records Android devices through bundled `adb` and `scrcpy`, with USB and Wireless debugging support. |
| PC testing | Records a selected full monitor for desktop or web test cases. |
| Fast markers | Adds bug markers with configurable hotkeys or colored buttons while recording. |
| Review | Replays each marker's export range directly from the review list. |
| Export | Creates MP4 clips and 3x3 preview sheets with severity, note, build, OS, device/source, tester, and timestamp. |
| Session files | Saves work as `.loupe` projects so markers, notes, recordings, and voice notes can be reopened later. |

## Latest Version

**Current version: 0.0.2**

This release adds PC full-screen recording as a major feature while keeping the Android QA workflow intact.

## What's New in 0.0.2

- **PC full-screen recording**: choose a monitor from the left panel and record the full display.
- **Selection and recording frames**: selected PC screens show a thin green frame before recording and a thin red frame while recording.
- **PC marker thumbnails**: PC markers receive source thumbnails immediately, then fall back to video extraction if needed.
- **Landscape-aware exports**: 3x3 preview sheets preserve landscape recordings instead of forcing a phone portrait layout.
- **Unified source picker**: Android devices and PC screens are selected from the same start screen.
- **Updated documentation**: installation, Android pairing, PC recording, marker workflow, export behavior, and `.loupe` project files are documented in English and Chinese.

## Product Highlights

- **Android QA recording**: control and record Android devices through bundled `adb` and `scrcpy`.
- **PC screen recording**: record a selected full monitor for PC-based test cases.
- **Instant markers**: add markers with hotkeys or the colored label buttons during recording.
- **Default marker labels**: `Note`, `Polish`, `Bug`, and `Critical`, with up to four custom labels.
- **Default recording hotkeys**:
  - `F6`: Note
  - `F7`: Polish
  - `F8`: Bug
  - `F9`: Critical
- **Review timeline**: click a marker to replay the exact export window.
- **Editable export range**: adjust clip start and end offsets per marker.
- **Batch export**: select multiple markers and export all selected clips.
- **Captioned clips**: exported videos include severity, note, build, OS, device/source, tester, and timestamp.
- **Voice notes**: record audio notes per marker and embed them into exported clips.
- **Preview sheet export**: every clip also exports a 3x3 contact sheet with matching metadata.
- **Session projects**: sessions are saved as `.loupe` files and can be reopened later.
- **One-click Windows installer**: packaged builds include the required Android and export tooling.

## Download and Install

The packaged Windows installer is generated as:

```text
Loupe QA Recorder-0.0.2.exe
```

For a portable handoff, use the zip package:

```text
Loupe QA Recorder-0.0.2.zip
```

The installer includes the required Windows builds of `adb`, `scrcpy`, and export tooling. QA users do not need to install Android Platform Tools separately.

## Installation

### For QA Users

1. Download `Loupe QA Recorder-0.0.2.exe` from the release package.
2. Run the installer.
3. If Windows SmartScreen warns about an unknown publisher, choose **More info** and then **Run anyway**.
4. Launch **Loupe QA Recorder** from the desktop shortcut or Start menu.

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

### macOS prerequisites for Android recording

The bundled tool binaries are only shipped in packaged Windows builds. When you run the app in development mode on macOS, install the Android tools with Homebrew first:

```bash
brew install android-platform-tools scrcpy
```

Verify both tools are on your shell PATH before launching Loupe:

```bash
command -v adb
command -v scrcpy
```

If you keep custom binaries outside your PATH, point Loupe at them with `LOUPE_TOOLS_DIR`.

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

## 中文快速說明

Loupe QA Recorder 是給 QA 團隊使用的 Windows 桌面錄影工具。它可以錄製 Android 手機或 PC 螢幕，測試過程中用熱鍵快速打點，session 結束後再依照點位裁切影片、加入註記、輸出九宮格截圖，讓 bug 回報不用再手動翻找整段錄影。

### 主要特色

- **Android 錄製**：內建 `adb` 與 `scrcpy`，支援 USB 偵錯與 Wi-Fi 無線偵錯。
- **PC 螢幕錄製**：0.0.2 起可選擇要錄製的螢幕，錄製前顯示綠框，錄製中顯示紅框。
- **快速打點**：預設 `F6` Note、`F7` Polish、`F8` Bug、`F9` Critical，也可在 APP 內修改，並可增加自訂標籤。
- **Review 後製**：點選右側 bug list 會播放該點位裁切範圍，可調整前後秒數。
- **批次輸出**：勾選多個點位後一次輸出 MP4 與 3x3 預覽圖。
- **輸出註記**：影片與圖片會包含重要程度、note、Build、OS、Device / PC screen、Tester、電腦時間。
- **語系支援**：APP 預設跟隨作業系統語系，也可在設定中切換繁體中文、简体中文、English、日本語、한국어、Español。
- **Session 存檔**：每次 session 會存成 `.loupe`，可重新開啟並保留點位、註記、語音與影片連結。

### 安裝方式

1. 下載 `Loupe QA Recorder-0.0.2.exe`。
2. 執行安裝檔。
3. 若 Windows SmartScreen 顯示未知發行者，選擇 **More info**，再按 **Run anyway**。
4. 從桌面捷徑或開始選單開啟 **Loupe QA Recorder**。

安裝包已包含錄製與輸出需要的工具，QA 使用者不需要另外安裝 Android Platform Tools。

### Android 配對流程

官方教學：

- [開啟 Android 開發人員選項](https://developer.android.com/studio/debug/dev-options)
- [使用 Wi-Fi 連接 Android 裝置](https://developer.android.com/studio/run/device#wireless)

USB 測試：

1. 在手機開啟 **Developer options / 開發人員選項**。
2. 開啟 **USB debugging / USB 偵錯**。
3. 用資料線連接手機與 PC。
4. 在手機上允許 USB debugging 授權。
5. 回到 Loupe 左側選擇該 Android 裝置。

Wi-Fi 測試：

1. PC 與手機連到同一個 Wi-Fi。
2. 手機開啟 **Wireless debugging / 無線偵錯**。
3. 選擇 **Pair device with pairing code / 使用配對碼配對裝置**。
4. 在 Loupe 按 **Scan Wi-Fi devices**。
5. 若出現 pairing 項目，按 **Pair** 並輸入六位數配對碼。
6. 配對完成後重新掃描，按 **Connect** 連線。

### 基本使用流程

1. 在左側選擇 PC 螢幕或 Android 裝置。
2. 填入 Build / 測試版本，可選填測試註記與測試人員。
3. 開始 session。
4. 測試時用 F6 / F7 / F8 / F9 或右側彩色按鈕打點。
5. 停止 session 後進入 review。
6. 補 note、調整裁切秒數、可選擇錄語音註記。
7. 勾選要輸出的點位，確認路徑、Tester、Test note 後批次輸出。

## License

Loupe QA Recorder source code is licensed under the [MIT License](LICENSE).

Packaged builds include third-party components such as scrcpy, Android Platform Tools, FFmpeg libraries, SDL2, libusb, Electron, and npm dependencies. These components keep their original licenses and are not relicensed under MIT. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
