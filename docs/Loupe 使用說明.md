# Loupe QA Recorder 使用說明

Loupe 是給 QA 測試使用的 Windows 錄影工具。它可以錄 Android 手機，也可以錄 PC 全螢幕。測試中可以快速打點，停止後再補 note、調整裁切範圍、錄語音註記，最後輸出 bug 影片、六張圖證據圖、HTML/PDF 報告與 `summery.txt`。

## 1. 安裝

1. 執行 `Loupe QA Recorder-0.1.0.exe`，或解壓縮 portable zip 後開啟 `Loupe QA Recorder.exe`。
2. 如果 Windows SmartScreen 顯示未知發布者，點 **其他資訊**，再點 **仍要執行**。
3. 開啟 **Loupe QA Recorder**。

打包版本已包含 `adb`、`scrcpy`、FFmpeg 與輸出工具，一般 QA 使用者不需要另外安裝 Android Platform Tools。

## 2. 0.1.0 重要更新

- 可以錄 PC 全螢幕。
- 可以自訂標籤名稱與顏色，最多 8 種標籤。
- 預設標籤改為 Note / Polish / Bug / Critical。
- 錄製中可直接點彩色標籤打點。
- 打點會先立即建立，縮圖背景補上。
- 橫向錄影輸出的證據圖會維持橫向排版。
- 輸出會產生影片、六張圖證據圖、HTML/PDF 報告與 `summery.txt`。

## 3. 選擇錄影來源

Loupe 支援兩種來源：

- **PC screen**：錄製一個完整螢幕，適合 PC build、網頁、後台工具或非手機流程。
- **Android device**：透過 USB 或 Wi-Fi debugging 錄製並操作 Android 手機。

### PC 螢幕錄製

1. 在左側找到 **PC recording**。
2. 選擇要錄的螢幕。
3. 確認該螢幕出現綠色外框。
4. 輸入 build 或測試版本。
5. 按 **Start session**。
6. 錄製中會顯示紅色外框。
7. 使用熱鍵或彩色標籤按鈕打點。
8. 測試完成後按 **Stop**。

目前 PC 錄影只支援完整螢幕，不支援單一視窗錄影。

## 4. Android 手機準備

官方教學：

- [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- [Connect to your device using Wi-Fi](https://developer.android.com/studio/run/device#wireless)

### 開啟開發者選項

1. 打開 Android **設定**。
2. 進入 **關於手機**。
3. 找到 **版本號** 或 **Build number**。
4. 連續點七次，直到系統提示已成為開發者。
5. 若系統要求，輸入手機 PIN 或密碼。
6. 回到設定，找到 **系統 > 開發人員選項**。不同品牌位置可能略有不同。

### USB 連線

1. 在 **開發人員選項** 開啟 **USB 偵錯**。
2. 用 USB 資料線連接手機與電腦。
3. 在手機上允許 USB 偵錯授權。
4. 在 Loupe 左側選擇偵測到的 USB 裝置。

### Wi-Fi 連線

Wi-Fi 偵錯需要 Android 11 或以上。

1. 確認手機和電腦在同一個 Wi-Fi 網路。
2. 在 **開發人員選項** 開啟 **無線偵錯**。
3. 點進 **無線偵錯** 詳細頁。
4. 點 **使用配對碼配對裝置**。
5. 保持該手機畫面開啟，畫面會顯示 IP:port 與六位數配對碼。
6. 在 Loupe 按 **Scan Wi-Fi devices**。
7. 若出現 `needs pairing`，按 **Pair**，輸入手機上的六位數配對碼並送出。
8. 必要時再次按 **Scan Wi-Fi devices**。
9. 對 `ready` 的裝置按 **Connect**。
10. Loupe 左側會顯示裝置已連線。

如果自動搜尋不到手機，可將 Android 無線偵錯畫面上的 IP:port 輸入 Loupe 的 **Add Wi-Fi device** 欄位後連線。

## 5. 開始 Session

1. 選擇 PC 螢幕、USB Android 或 Wi-Fi Android。
2. 輸入 build 或測試版本。
3. 可選填測試註記。
4. 按 **Start session**。

Android 會開啟可操作的鏡像視窗；PC 會錄製選定的完整螢幕。

## 6. 錄製中打點

預設熱鍵：

- `F6`: Note
- `F7`: Polish
- `F8`: Bug
- `F9`: Critical

也可以直接點錄製面板上的彩色標籤按鈕打點。前四個標籤可以設定熱鍵，另外最多四個自訂標籤可用滑鼠點擊。

打點會立即出現在列表中，縮圖會在背景補上，不會阻塞測試。

## 7. Review 與編輯

停止 session 後會進入 review 畫面，可以：

- 修改 marker 類型
- 輸入多行 note
- 調整輸出裁切範圍
- 勾選或取消勾選 marker
- 錄製語音註記
- 刪除 marker
- 重播實際輸出的裁切區間

點擊 marker 卡片會從裁切開始點播放到裁切結束點並暫停。

## 8. 輸出格式

每個選取的 marker 會輸出：

- 一支 MP4 裁切影片
- 一張六張圖證據圖

批次輸出時也會產生：

- `records/`：影片與證據圖
- `report/`：HTML 與 PDF 報告
- `summery.txt`：方便快速貼到 Slack 或其他工具的文字摘要

影片與圖片下方會包含：

```text
重要程度 / note
Build / OS / Device 或 PC screen
Tester / 電腦時間
裁切起訖時間
裝置狀態，例如 RAM、電量、溫度
```

長 note 會自動換行。橫向錄影會輸出橫向證據圖，直向錄影會輸出直向證據圖。

## 9. Session 檔

Loupe 會將 session 存成 `.loupe` 檔。重新開啟後會恢復：

- marker
- marker 類型
- note
- 裁切範圍
- 語音註記
- 連結的錄影檔

如果原始錄影檔遺失，Loupe 會提示使用者手動找回影片路徑。
