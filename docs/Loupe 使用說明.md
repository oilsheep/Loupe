# Loupe QA Recorder 使用說明

Loupe 是給 QA 測試使用的錄影工具。它可以錄 Android 手機，也可以從 **0.0.2** 開始錄 PC/Mac 畫面。測試中可以快速打點，停止後再補 note、調整裁切範圍、錄語音註記，最後輸出 bug 影片與 3x3 預覽圖。

## 1. 安裝

1. 執行 `Loupe QA Recorder-0.0.2-Setup.exe`。
2. 如果 Windows SmartScreen 顯示未知發布者，點 **其他資訊**，再點 **仍要執行**。
3. 從桌面捷徑或開始選單開啟 **Loupe QA Recorder**。

安裝包已包含必要的 `adb`、`scrcpy` 與影片輸出工具，一般使用者不需要另外安裝 Android Platform Tools。

## 2. 0.0.2 重要更新

- 新增 **PC/Mac 錄製**，可選擇要錄整個螢幕或單一視窗。
- PC recording 來源選擇介面改成類似 Chrome 分享螢幕的卡片式選擇器。
- 選擇整個螢幕時會顯示細綠框，開始錄影後會變成細紅框。
- PC 打點會自動產生縮圖。
- 橫向錄影輸出的 3x3 預覽圖會維持橫向排版，不再強制直式手機比例。
- 左側來源列表整合 PC/Mac screen、window、USB Android、Wi-Fi Android。

## 3. 選擇錄影來源

Loupe 支援兩種來源：

- **PC/Mac screen 或 window**：錄製指定螢幕的完整畫面，或只錄單一應用程式視窗，適合 PC 版、瀏覽器、後台工具或非手機測試。
- **Android device**：透過 USB 或 Wi-Fi debugging 錄製並操作 Android 手機。

### PC/Mac 畫面錄製

1. 在左側找到 **PC recording**。
2. 選擇 **Entire Screen** 或 **Window** 分頁。
3. 點選要錄製的螢幕或視窗卡片。
4. 如果選的是整個螢幕，確認該螢幕上出現細綠框。
5. 在右側輸入 build 或測試版本。
6. 按 **Start session**。
7. 錄影中，整個螢幕來源的綠框會變成紅框；單一視窗來源不會顯示外框。
8. 可用快捷鍵或彩色 **Add** 按鈕打點。
9. 測試結束後按 **Stop**。

單一視窗錄製只會錄選到的視窗內容，適合只想錄瀏覽器、桌面 App 或特定後台工具的情境。若視窗最小化、被系統隱藏，或應用程式使用受保護內容，錄影結果可能會變黑或停止更新。

### macOS 權限

macOS 第一次錄製螢幕或視窗時，系統可能會要求開啟螢幕錄製權限：

1. 打開 **System Settings**。
2. 進入 **Privacy & Security > Screen Recording**。
3. 允許執行 Loupe 的 App，或允許啟動 Loupe 的 Terminal / 開發工具。
4. 重新啟動 Loupe。

如果按 **Start session** 後錄不到畫面，先檢查這個權限。

### Windows 注意事項

Windows 可以錄製整個螢幕，也可以錄製單一視窗。選擇整個螢幕時會顯示錄影外框；選擇單一視窗時不顯示外框。

如果視窗錄製失敗，請確認目標視窗沒有最小化，並避免選擇系統權限較高的管理員視窗。

## 4. Android 手機準備

官方圖文參考：

- [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- [Connect to your device using Wi-Fi](https://developer.android.com/studio/run/device#wireless)

### 開啟開發者模式

1. 打開手機 **設定**。
2. 進入 **關於手機**。
3. 找到 **版本號碼** 或 **Build number**。
4. 連續點擊 **版本號碼** 七次，直到手機顯示已成為開發人員。
5. 如果手機要求驗證，輸入 PIN 或密碼。
6. 回到設定，通常可在 **系統 > 開發人員選項** 找到開發者設定。不同品牌位置可能略有不同。

### USB 連線

1. 在 **開發人員選項** 開啟 **USB 偵錯**。
2. 用可傳輸資料的 USB 線連接手機和電腦。
3. 手機跳出 **允許 USB 偵錯嗎？** 時，選擇允許。
4. 在 Loupe 左側選擇偵測到的 USB 裝置。

### Wi-Fi 連線

Wi-Fi 偵錯需要 Android 11 或更新版本。

1. 確認手機和電腦在同一個 Wi-Fi 網路。
2. 在 **開發人員選項** 開啟 **無線偵錯** 或 **Wireless debugging**。
3. 點進 **無線偵錯** 詳細頁。
4. 點 **使用配對碼配對裝置**。
5. 保持手機畫面開著，畫面會顯示 IP:port 和六位數配對碼。
6. 在 Loupe 點 **Scan Wi-Fi devices**。
7. 如果看到 `needs pairing`，點 **Pair**，輸入手機上的六位數配對碼並送出。
8. 視情況再按一次 **Scan Wi-Fi devices**。
9. 當項目變成 `ready`，點 **Connect**。
10. Loupe 左側會顯示已連接的裝置。

如果自動掃描找不到手機，可以把手機無線偵錯頁面上的 IP:port 輸入 Loupe 的 **Add Wi-Fi device**，再按 **connect**。

## 5. 開始 Session

1. 左側選擇 PC/Mac 螢幕、PC/Mac 視窗、USB Android 或 Wi-Fi Android。
2. 右側輸入 build 或測試版本。
3. 也可以填入測試註記。
4. 按 **Start session**。

Android 模式會開啟可操作的手機鏡像；PC/Mac 模式會錄製選定螢幕或視窗。

## 6. 錄製中打點

預設快捷鍵：

- `F6`: improvement
- `F7`: minor
- `F8`: normal
- `F9`: major

錄製頁也有四個彩色 **Add** 按鈕，可直接新增對應類型的點位。

打點會先立刻建立項目，縮圖和附加資料會在背景補上，不會卡住測試流程。

## 7. Review 與輸出

停止 session 後會進入 review 畫面，可以：

- 修改 marker 類型
- 輸入多行 note
- 調整裁切前後秒數
- 勾選多個 marker 批次輸出
- 錄製語音註記
- 刪除 marker
- 播放裁切範圍預覽

輸出前會跳出確認視窗，可調整輸出資料夾、tester 和 test note。

## 8. 輸出格式

每個 marker 會輸出：

- 一個 MP4 裁切影片
- 一張 3x3 預覽圖

影片與圖片下方會包含：

```text
重要程度 / note 內容
Build / OS / Device、PC screen 或 window
tester / 電腦時間
```

長 note 會自動換行，避免超出影片寬度。橫向錄影會輸出橫向預覽圖，直向錄影會輸出直向預覽圖。

## 9. Session 檔案

Loupe 會把 session 存成 `.loupe` 檔。重新打開後會保留：

- marker
- marker 類型
- note
- 裁切範圍
- 語音註記
- 對應錄影路徑

如果原始影片遺失，Loupe 會提醒並讓使用者手動找回影片路徑。
