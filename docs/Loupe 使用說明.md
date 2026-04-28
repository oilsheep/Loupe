# Loupe QA Recorder 使用說明

Loupe 是給 QA 使用的 Android 錄影與 bug 打點工具。錄製時可以用快捷鍵快速建立點位，結束後在 Review 畫面補註記、調整裁切範圍，並批次輸出影片與截圖拼圖。

## 安裝

1. 執行 `Loupe QA Recorder-0.0.0-Setup.exe`。
2. 如果 Windows SmartScreen 顯示警告，請選擇更多資訊後繼續執行。
3. 安裝完成後，從桌面或開始選單開啟 `Loupe QA Recorder`。

安裝版已內建 `adb`、`scrcpy` 和輸出需要的工具，不需要另外安裝。

## 開始錄製

1. 用 USB 連接 Android 手機，或使用 Wi-Fi pairing。
2. 確認裝置已連接，畫面會顯示已連接狀態與裝置名稱。
3. 填入測試版本資訊，例如 build 或版本號。
4. 按下 Start 開始錄製。

錄製期間會有紅色錄影提示。畫面左側顯示手機控制畫面，右側顯示 bug marker list。

## 快捷鍵打點

錄製時可以直接按快捷鍵建立 marker，不會跳出輸入框：

- `F6`: improvement
- `F7`: minor
- `F8`: normal
- `F9`: major

建立 marker 後會先出現在列表中，縮圖會稍後補上。打字輸入時快捷鍵不會搶走文字欄位操作。

## Review 與編輯

Stop session 後會進入 Review 畫面，可以編輯：

- marker 類型：note、major、normal、minor、improvement
- note 文字，支援多行
- 裁切開始與結束範圍
- 單筆或多筆勾選
- 錄音註記

點擊列表中的任一 marker 卡片，左側影片會從裁切起點開始播放，播放到裁切終點後自動暫停，方便確認輸出的片段是否正確。

## 匯出影片

1. 勾選要輸出的 marker。
2. 按 Export。
3. 在彈窗中確認或選擇輸出資料夾，並可填寫 Tester 與 Test note。
4. 按 Export 後開始輸出。

每個 marker 會輸出：

- 一支裁切後的 MP4 影片
- 一張 3x3 平均截圖拼圖

影片下方會加入淺灰底黑字註記，格式為：

```text
note 內容
Build / OS / Device
tester / time
```

如果有錄音註記，會合併進輸出影片的音訊。若音訊比影片長，影片會停在最後一格直到音訊結束。

## Session 存檔

每次新 session 會自動建立 `.loupe` 存檔。之後可以用 Open saved session 重新開啟，保留 marker、note、裁切範圍、錄音與影片關聯。

如果影片檔遺失，Loupe 會提醒使用者並允許重新選擇影片位置。

## 常見問題

### 裝置沒有出現

- 確認 USB debugging 已開啟。
- 確認手機上已允許這台電腦偵錯。
- 換一條資料線或 USB port。
- Wi-Fi pairing 需要手機與電腦在同一網路，並開啟 Android 的 Wireless debugging。

### 快捷鍵沒有反應

- 確認目前正在錄製。
- 如果游標正在文字欄位中，快捷鍵會讓位給輸入行為。
- 某些系統或其他軟體可能會攔截功能鍵，可以到設定中調整 marker key。

### 匯出的影片時間不對

- 檢查 marker 的裁切範圍。
- Loupe 會自動處理錄影開頭與結尾的邊界，避免輸出超出影片長度。

### Windows 顯示未知發行者

目前 installer 未簽章，所以 Windows 可能會提示未知發行者。這不影響功能，但正式對外發佈前建議加入 code signing。
