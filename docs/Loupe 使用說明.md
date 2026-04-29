# Loupe QA Recorder 使用說明

Loupe 是給 QA 測試使用的 Windows 錄影工具。它可以錄 Android 手機，也可以從 **0.0.2** 開始錄 PC 全螢幕。測試中可以快速打點，停止後再補 note、調整裁切範圍、錄語音註記，最後輸出 bug 影片與 3x3 預覽圖。

## 1. 安裝

1. 執行 `Loupe QA Recorder-0.0.2-Setup.exe`。
2. 如果 Windows SmartScreen 顯示未知發布者，點 **其他資訊**，再點 **仍要執行**。
3. 從桌面捷徑或開始選單開啟 **Loupe QA Recorder**。

安裝包已包含必要的 `adb`、`scrcpy` 與影片輸出工具，一般使用者不需要另外安裝 Android Platform Tools。

## 2. 0.0.2 重要更新

- 新增 **PC 全螢幕錄製**，可選擇要錄哪一個螢幕。
- 選擇 PC 螢幕時會顯示細綠框，開始錄影後會變成細紅框。
- PC 打點會自動產生縮圖。
- 橫向錄影輸出的 3x3 預覽圖會維持橫向排版，不再強制直式手機比例。
- 左側來源列表整合 PC screen、USB Android、Wi-Fi Android。

## 3. 選擇錄影來源

Loupe 支援兩種來源：

- **PC screen**：錄製指定螢幕的完整畫面，適合 PC 版、瀏覽器、後台工具或非手機測試。
- **Android device**：透過 USB 或 Wi-Fi debugging 錄製並操作 Android 手機。

### PC 螢幕錄製

1. 在左側找到 **PC recording**。
2. 選擇要錄製的螢幕。
3. 確認該螢幕上出現細綠框。
4. 在右側輸入 build 或測試版本。
5. 按 **Start session**。
6. 錄影中綠框會變成紅框。
7. 可用快捷鍵或彩色 **Add** 按鈕打點。
8. 測試結束後按 **Stop**。

目前 PC 錄製只支援完整螢幕，不開放單一應用程式視窗錄製。

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

1. 左側選擇 PC 螢幕、USB Android 或 Wi-Fi Android。
2. 右側輸入 build 或測試版本。
3. 也可以填入測試註記。
4. 按 **Start session**。

Android 模式會開啟可操作的手機鏡像；PC 模式會錄製選定螢幕。

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
Build / OS / Device 或 PC screen
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
