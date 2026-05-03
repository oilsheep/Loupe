# Loupe QA Recorder

Loupe QA Recorder is a Windows and macOS desktop app for QA teams that need fast, repeatable bug evidence.

Loupe QA Recorder 是為 QA、測試工程師與遊戲/應用開發團隊設計的桌面工具，用來把長時間測試錄影、即時打點、事後整理與證據輸出整合成同一個流程。

The product loop is simple:

```text
Record once -> mark instantly -> review later -> export clean evidence
```

核心流程也很直接：

```text
錄一次 -> 測試中即時打點 -> 事後 review -> 輸出乾淨可分享的證據
```

## Status / 專案現況

| Item | English | 中文 |
| --- | --- | --- |
| Current version | `0.5.0` | 目前版本為 `0.5.0` |
| Packaged targets | Windows installer/zip and macOS Apple Silicon DMG | 目前產出 Windows installer/zip 與 macOS Apple Silicon DMG |
| Release flow | Pushing a `v*` tag builds both desktop targets and creates a GitHub Release | push `v*` tag 會打包兩個平台並建立 GitHub Release |
| Versioning | The desktop package version is derived from the tag, for example `v0.5.1` -> `0.5.1` | tag 會同步成桌面 app 版本，例如 `v0.5.1` 會產生 `0.5.1` |
| macOS distribution | Tag/manual CI builds are signed and notarized when Apple secrets are configured | 設定 Apple secrets 後，tag/manual CI build 會進行簽章與 notarization |
| Windows distribution | Windows builds use Electron Builder NSIS and zip outputs | Windows 使用 Electron Builder 產出 NSIS installer 與 zip |
| CI checks | Typecheck is required; tests currently soft-fail in CI because they are sensitive to native tools and runtime timing | CI 保留必要 typecheck；test 目前先軟失敗，避免 native tool 或 timing 問題卡住發佈 |

Loupe is currently usable as a QA evidence workstation. The main rough edges are packaging, signing, and external tool availability across different machines.

Loupe 目前已可作為 QA evidence workstation 使用；較需要持續打磨的是跨平台打包、簽章，以及每台機器外部工具可用性的差異。

## What It Does / 功能總覽

| Area | English | 中文 |
| --- | --- | --- |
| Android testing | Records Android devices through bundled `adb` and `scrcpy`, with USB and Wireless debugging support | 透過內建 `adb` / `scrcpy` 錄製 Android，支援 USB 與 Wireless debugging |
| PC testing | Records a selected full monitor for desktop or web test cases | 錄製指定螢幕，適合 PC 或 web 測試 |
| iOS testing | Records an AirPlay mirrored iPhone/iPad window through the UxPlay source flow where available | 在可用環境下透過 UxPlay/AirPlay 鏡像錄製 iPhone/iPad |
| Imported videos | Opens existing recordings and moves directly into review/export | 匯入既有影片後直接進入 review 與輸出流程 |
| Fast markers | Adds markers with hotkeys or colored buttons while recording | 測試中用熱鍵或彩色按鈕即時打點 |
| Review | Replays marker ranges, zooms the timeline, edits ranges, and overlays frame annotations | 回放 marker 片段、縮放時間軸、調整輸出範圍並加上畫面標註 |
| Export | Creates annotated MP4 clips, six-frame evidence sheets, PDF/HTML reports, and a text summary | 輸出帶標註 MP4、六格證據圖、PDF/HTML 報告與文字摘要 |
| Publish | Sends exported evidence to Slack, GitLab, or Google Drive/Sheets when configured | 設定後可發佈到 Slack、GitLab、Google Drive/Sheets |
| Session files | Saves work as `.loupe` projects so it can be reopened later | 以 `.loupe` 專案保存 marker、note、錄影、metadata 與標註 |

## Highlights / 主要功能

- **Multi-source recording / 多來源錄製**: Android USB/Wi-Fi, PC monitor recording, iOS AirPlay mirroring where supported, and imported video workflows.
- **Fast QA markers / 快速 QA 打點**: default hotkeys are `F6` Note, `F7` Polish, `F8` Bug, and `F9` Critical.
- **Custom labels / 自訂標籤**: marker names and colors can be customized, and teams can add more labels for their own bug taxonomy.
- **Speech-assisted review / 語音輔助 review**: local STT can create audio auto-markers or convert tester audio into marker notes.
- **Video annotations / 影片標註**: draw rectangles, ellipses, arrows, freehand strokes, and text directly on reviewed frames.
- **Editor-style timeline / 剪輯式時間軸**: zoom with `Alt + wheel`, drag the viewport, scrub playback, and adjust marker export ranges with timeline handles.
- **Batch export / 批次輸出**: select multiple markers and export annotated clips, evidence sheets, reports, and `summery.txt`.
- **Remote publishing / 遠端分享**: publish local evidence to Slack, GitLab, or Google Drive/Sheets with mention identity support.
- **Tool status / 工具狀態**: bundled and managed tools cover Android recording, FFmpeg export, UxPlay/go-ios paths, and local STT runtime checks.
- **Localized UI / 在地化介面**: preferences and UI support Traditional/Simplified Chinese.

## Download and Install / 下載與安裝

GitHub Releases publish packaged desktop builds:

GitHub Release 會提供桌面版安裝檔：

```text
Loupe QA Recorder-0.5.0-arm64.dmg
Loupe QA Recorder-0.5.0.exe
Loupe QA Recorder-0.5.0.zip
```

Use the macOS `.dmg` release asset for installation. Avoid launching an unpacked `.app` copied directly out of a CI artifact because Gatekeeper quarantine and packaging context can differ from the notarized DMG install path.

macOS 請使用 GitHub Release 裡的 `.dmg` 安裝。不建議直接打開 CI artifact 裡拆出來的 `.app`，因為 Gatekeeper quarantine 與 notarized DMG 的安裝情境不同。

Use the Windows `.exe` installer for normal installation. Use the `.zip` package only when you need a portable handoff.

Windows 一般使用者建議下載 `.exe` installer；需要攜帶或內部交付時再使用 `.zip`。

Packaged builds include required platform tools where practical, including Android recording tools, FFmpeg/export tooling, and managed checks for iOS/STT helper tools. QA users do not need to install Android Platform Tools separately for the normal Android workflow.

打包版會盡量內含常用平台工具，例如 Android 錄製工具、FFmpeg/export tooling，以及 iOS/STT helper tool 的狀態檢查。一般 Android QA 流程不需要另外安裝 Android Platform Tools。

## Basic Workflow / 基本流程

1. Select a recording source or import an existing video.
2. Fill in platform, project, build version, tester, report title, and test notes.
3. Start recording.
4. During testing, add markers with hotkeys or colored label buttons.
5. Stop the session and enter review.
6. Add notes or STT transcripts, adjust clip ranges, and draw video annotations.
7. Select markers and export clips.
8. Share the generated MP4 clips, evidence sheets, reports, and summary file.

中文流程：

1. 選擇錄製來源，或匯入既有影片。
2. 填入平台、專案、測試版本、測試人員、報告標題與測試註記。
3. 開始錄製。
4. 測試中用熱鍵或彩色標籤按鈕打點。
5. 停止後進入 review。
6. 補 note 或 STT 文字、調整切片範圍、加入影片標註。
7. 勾選要輸出的 marker 並 export。
8. 分享產生的 MP4、證據圖、報告與摘要文字。

## Recording Sources / 錄製來源

### PC Screen / PC 螢幕

1. Open Loupe.
2. Find **PC recording** in the left panel.
3. Select the monitor you want to record.
4. Confirm the green frame appears on the selected screen.
5. Enter the build or test version.
6. Press **Start session**.
7. While recording, the selected screen shows a thin red frame.
8. Add markers with `F6` / `F7` / `F8` / `F9` or the colored label buttons.

PC recording currently supports full-screen monitor capture only. Application/window capture is hidden until it is reliable enough for QA use.

PC 錄製目前支援完整螢幕錄製；單一 application/window capture 會等到可靠度足夠後再開放。

### Android / Android 裝置

Official Android references:

- [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- [Connect to your device using Wi-Fi](https://developer.android.com/studio/run/device#wireless)

Enable Developer options:

1. Open Android **Settings**.
2. Go to **About phone**.
3. Tap **Build number** seven times.
4. Enter the device PIN/password if Android asks for confirmation.
5. Return to Settings. Developer options should now appear, often under **System > Developer options**.

開啟開發人員選項：

1. 開啟 Android **Settings**。
2. 進入 **About phone**。
3. 連點 **Build number** 七次。
4. 若系統要求確認，輸入裝置密碼。
5. 回到 Settings，Developer options 通常會出現在 **System > Developer options**。

USB testing:

1. Turn on **USB debugging** in **Developer options**.
2. Connect the device with a USB data cable.
3. Accept the Android debugging authorization prompt on the device.
4. Select the detected USB device in Loupe.

USB 測試：

1. 在 **Developer options** 開啟 **USB debugging**。
2. 用 USB data cable 連接裝置。
3. 在手機上接受 Android debugging authorization。
4. 在 Loupe 左側選擇偵測到的 USB 裝置。

Wi-Fi testing:

1. Make sure the PC and phone are on the same Wi-Fi network.
2. Turn on **Wireless debugging** in **Developer options**.
3. Tap **Wireless debugging**.
4. Tap **Pair device with pairing code**. Android shows an IP:port and a six-digit pairing code.
5. In Loupe, press **Scan Wi-Fi devices**.
6. If Loupe shows a pairing entry, press **Pair**, enter the six-digit code, and submit.
7. Scan again if needed, then press **Connect** on the ready Wi-Fi entry.

Wi-Fi 測試：

1. 確認電腦與手機在同一個 Wi-Fi network。
2. 在 **Developer options** 開啟 **Wireless debugging**。
3. 進入 **Wireless debugging**。
4. 點 **Pair device with pairing code**，Android 會顯示 IP:port 與六位數 pairing code。
5. 在 Loupe 按 **Scan Wi-Fi devices**。
6. 如果 Loupe 顯示 pairing entry，按 **Pair** 並輸入六位數 code。
7. 必要時重新 scan，再對 ready Wi-Fi entry 按 **Connect**。

If discovery does not find the phone, use the manual **Add Wi-Fi device** field with the IP:port shown by Android Wireless debugging.

如果 discovery 找不到手機，可以用 **Add Wi-Fi device** 手動輸入 Android Wireless debugging 顯示的 IP:port。

## Export Output / 輸出內容

Each selected marker exports:

- one trimmed MP4 clip
- one six-frame preview image sheet

每個勾選的 marker 會輸出：

- 一段裁切後的 MP4
- 一張六格 preview evidence sheet

Batch export also creates:

- `records/`: exported MP4 clips and image sheets
- `report/`: HTML and PDF QA report
- `summery.txt`: compact text summary for quick sharing

批次輸出也會產生：

- `records/`：輸出的 MP4 與 evidence sheet
- `report/`：HTML 與 PDF QA report
- `summery.txt`：方便快速分享的文字摘要

The caption area includes:

```text
Severity / Marker note
Build / OS / Device or PC screen
Tester / Computer timestamp
Clip range
Sampled device status, when available
```

Long notes wrap automatically. Landscape recordings export landscape evidence sheets; portrait recordings export portrait evidence sheets.

長 note 會自動換行。橫向錄影會輸出橫向 evidence sheet，直向錄影會輸出直向 evidence sheet。

## Session Files / Session 存檔

Each session is saved as a `.loupe` project file. Reopening a `.loupe` file restores markers, notes, clip ranges, annotations, metadata, and the linked recording.

每次 session 都會保存為 `.loupe` project。重新開啟 `.loupe` 後，會恢復 marker、note、clip range、annotation、metadata 與連結的原始影片。

If the original recording is missing, Loupe prompts the user to locate the video manually.

如果原始影片遺失，Loupe 會提示使用者手動重新指定影片位置。

## Development / 開發

Install dependencies:

安裝相依套件：

```bash
pnpm install
```

Run the desktop app on macOS/Linux:

macOS/Linux 開發模式：

```bash
./start-dev.sh dev
```

Run the desktop app on Windows:

Windows 開發模式：

```bat
start-dev.bat dev
```

Run type checks:

執行 typecheck：

```bash
pnpm --filter desktop typecheck
```

If `better-sqlite3` reports a `NODE_MODULE_VERSION` mismatch, rebuild it for the runtime you are using:

如果 `better-sqlite3` 出現 `NODE_MODULE_VERSION` mismatch，請針對目前 runtime rebuild：

```bash
pnpm rebuild:electron
pnpm rebuild:node
```

## Build and Release / 打包與發佈

Build on macOS/Linux:

macOS/Linux 打包：

```bash
pnpm install
./start-dev.sh build
```

Build on Windows:

Windows 打包：

```bat
start-dev.bat build
```

Build artifacts are generated under:

打包結果會產生在：

```text
apps/desktop/dist/
```

`dist/` is ignored by git because it contains local build artifacts.

`dist/` 是本機 build artifact，已被 git ignore。

Publish a release by pushing a version tag:

發佈 release 時 push version tag：

```bash
git tag v0.5.1
git push origin v0.5.1
```

The GitHub Actions release workflow sets the desktop package version from the tag and uploads the packaged DMG/EXE/ZIP assets to the GitHub Release.

GitHub Actions release workflow 會從 tag 設定 desktop package version，並把 DMG/EXE/ZIP 上傳到 GitHub Release。

Signing setup:

簽章設定：

- macOS: [macOS Signing and Notarization](docs/macos-signing.md)
- Windows: [Windows Signing](docs/windows-signing.md)

## Documentation / 文件

- [User Guide](docs/user-guide.md)
- [Chinese User Guide](docs/Loupe%20%E4%BD%BF%E7%94%A8%E8%AA%AA%E6%98%8E.md)
- [Slack Setup](docs/slack-setup.md)
- [GitLab Setup](docs/gitlab-setup.md)
- [Google Setup](docs/google-setup.md)
- [Remote Publish](docs/remote-publish.md)
- [Tool Status](docs/tool-status.md)
- [macOS Signing and Notarization](docs/macos-signing.md)
- [Windows Signing](docs/windows-signing.md)
- [Changelog](CHANGELOG.md)

## License / 授權

Loupe QA Recorder source code is licensed under the [MIT License](LICENSE).

Loupe QA Recorder source code 使用 [MIT License](LICENSE)。

Packaged builds include third-party components such as scrcpy, Android Platform Tools, FFmpeg libraries, SDL2, libusb, Electron, and npm dependencies. These components keep their original licenses and are not relicensed under MIT. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).

打包版包含 scrcpy、Android Platform Tools、FFmpeg libraries、SDL2、libusb、Electron 與 npm dependencies 等第三方元件。這些元件保留原本授權，不會重新授權為 MIT。請參考 [Third-Party Notices](THIRD_PARTY_NOTICES.md)。
