# QA 雲端錄影平台 — MVP 產品規格

| | |
|---|---|
| **文件版本** | v0.2 (MVP — 加入 LAN Wi-Fi 連線) |
| **撰寫日期** | 2026-04-28 |
| **平台範圍** | Android 本地客戶端(Windows PC,USB / 同區網 Wi-Fi)+ 最簡雲端查閱介面 |
| **目標** | 用最小工程量驗證「QA 錄影 + bug 標記 → 開發者雲端看影片」核心價值 |
| **明確不做** | iOS、Windows 遊戲錄影、進階查閱功能、整合(Jira/Slack)、CI 串接 |

---

## 1. MVP 範圍與原則

### 1.1 MVP 目標

證明這條核心鏈路是可行且有效的:

> **QA 在 Windows PC 上鏡像 Android 手機 → 邊測邊標 bug → 結束後 commit 到雲端 → 開發者打開連結就能看到對應影片片段**

只要這條鏈路順,就值得擴展。其餘功能(iOS、Windows 錄影、跨 build 統計、團隊協作)都是後續 Phase。

### 1.2 MVP 範圍(In Scope)

**QA 客戶端(Windows)**:
- ✅ 連接 Android 實機,**支援兩種模式**:
  - **USB 直連**(adb)
  - **同區網 Wi-Fi 連線**(adb tcpip / 無線偵錯)— scrcpy 串流 + 鍵鼠操作
- ✅ scrcpy 鏡像 + 影片錄製
- ✅ 開始 / 結束 Session,影片落地本機
- ✅ F8 熱鍵標 bug,輕量註解輸入
- ✅ 自動截圖 + adb logcat 切片
- ✅ Draft 狀態本機 review(回看 / 改 / 刪)
- ✅ Commit 按鈕 → 上傳雲端

**雲端後端**:
- ✅ 影片儲存 + bug metadata API
- ✅ 簡單身份認證(Google OAuth,白名單 domain)

**Web 查閱介面**:
- ✅ Session 列表(時間排序)
- ✅ Session 詳情頁(影片 + bug 列表 + 時間軸 markers)
- ✅ 點 bug → 影片 seek 到該秒
- ✅ Bug 深連結 URL(可貼到 Slack 分享)

### 1.3 明確不做(Out of Scope)

| 不做的 | 原因 |
|---|---|
| iOS / Windows 遊戲錄影 | 留待 Phase 2,先驗證核心 |
| Build 管理系統 / CI 串接 | QA 手動填 build 版本字串即可 |
| Bug 狀態流轉(open/fixing/...)| MVP 只區分「未讀 / 已讀」 |
| 留言 / 討論串 | 先讓人能看,協作功能下一版 |
| Jira / Slack / Notion 整合 | 先用「複製連結貼到任何地方」 |
| 個人 Inbox / Build 視角 / Bug 群組 | 進階查閱功能下一版 |
| 通知系統 | QA 自己 commit 完手動分享連結 |
| 多角色權限 | MVP 全公司 Google 帳號都看全部 |
| HLS 轉檔 / 多 bitrate | MP4 progressive download 即可 seek |
| 跨 session 全文搜尋 | MVP 只有列表 + 篩選 build/QA |
| 影片預覽縮圖 sprite | 用單張截圖代替 |

### 1.4 設計原則

- **本地優先**:QA 工作完全可離線,只在 commit 時需要外網
- **Commit 不可逆**:雲端只接收 QA 確認過的 session,無編輯功能
- **連結可分享**:每個 session、每個 bug 都有 URL,直接貼 Slack 即可
- **不做漂亮先做能用**:MVP 先建管線,UI 先求清晰不求驚豔

---

## 2. 使用者與情境

### 2.1 角色

MVP 階段只區分兩種角色,不做細分權限:

| 角色 | 場景 |
|---|---|
| **QA** | 在 Windows PC 上用客戶端錄製測試 + 標 bug + commit |
| **Viewer**(工程師 / PM / 美術) | 開連結看影片找 bug 重現步驟 |

### 2.2 核心情境

#### Story 1 — QA 錄一次測試(Wi-Fi 模式)

> Tester 在 Windows PC 開客戶端 → 從裝置下拉選單點「Pixel-7-測試機-04(Wi-Fi)」(IT 已預先配對好的裝置池其中一台)→ 客戶端連線成功,延遲指示燈顯示綠色 65ms → 在「Build 版本」欄位手動填 `1.4.2-RC3` → 點「開始 Session」。
>
> scrcpy 視窗跳出,QA 從座位用滑鼠鍵盤操作那台架上的測試機進遊戲。發現第三關卡牆,按 **F8** → 跳出輕量輸入框:嚴重度=Major、註解「左下角石雕怪卡牆」、確定。系統自動存當下截圖+影片時間+最近 30 秒 logcat。
>
> 繼續測 15 分鐘,標 2 個 bug。按結束 Session → 進入 Draft 列表。
>
> QA 自己回看一遍,把第二個誤標 bug 刪除,然後按 **Commit**。客戶端在背景上傳,完成後跳通知:「已 commit,連結已複製」。
>
> QA 把連結貼到 Slack #qa-daily 頻道。
>
> ※ 若是測動作 / 音遊類對延遲敏感的場景,QA 可改插 USB 線連同一台手機,延遲降到 < 50ms。

#### Story 2 — 工程師看 Bug

> Engineer 在 Slack 看到 `https://qa.example.com/s/abc123#bug=2`,點開。
>
> Web 自動用 Google 帳號登入(已加入公司 workspace) → 直接定位到該 bug,影片從第 125 秒開始播,旁邊顯示 QA 的註解、截圖、logcat 切片。
>
> 工程師看了 30 秒就理解 bug,複製 logcat 切片到 Jira,自己手動建 ticket 並把 Web 連結貼上。

---

## 3. 功能規格

### 3.1 QA 桌面客戶端(Windows)

#### 3.1.1 Session 狀態

MVP 只有 4 個狀態:

| 狀態 | 說明 | 雲端可見 |
|---|---|---|
| `recording` | 錄影中 | ❌ |
| `draft` | 結束後在本機,可改可刪 | ❌ |
| `committing` | 上傳中 | ❌ |
| `ready` | 上傳完成,雲端可看 | ✅ |

#### 3.1.2 裝置連線(USB / 同區網 Wi-Fi)

MVP 支援兩種連線方式,QA 在客戶端可自由切換:

| 模式 | 設定難度 | 適用情境 | 預估延遲 |
|---|---|---|---|
| **USB 直連** | 低(插上即用) | 開發機固定接一支測試機 | < 50ms |
| **同區網 Wi-Fi** | 中(需一次性設定) | 共用裝置池、跨座位測試、不想拉線 | 50–150ms |

**Wi-Fi 模式設定流程**:

首次配對(僅一次):
1. QA 用 USB 連手機到 Windows PC
2. 客戶端按「啟用 Wi-Fi 模式」→ 自動執行 `adb tcpip 5555`
3. 客戶端讀取裝置 IP 並記憶
4. QA 拔掉 USB,客戶端自動 `adb connect <ip>:5555`

之後使用:
- 客戶端記憶過的裝置直接列在下拉選單,點選即連
- Android 11+ 可用「無線偵錯」+ 配對碼,完全跳過 USB 步驟(MVP 提供操作說明,UI 不另做配對流程)

**裝置探索**:

| 模式 | MVP 做法 |
|---|---|
| USB | `adb devices` 自動列出 |
| Wi-Fi(已配對過) | 從本機快取讀取,點選自動連線 |
| Wi-Fi(新裝置) | **手動輸入 IP**(IT 提供裝置池對照表) |

> mDNS / Bonjour 自動掃描網段裝置 → Phase 2 加入,MVP 不做。

**網段需求**(IT 須確認):
- Windows PC 與 Android 裝置在**同一個 subnet**
- 該 Wi-Fi SSID 未啟用 **client isolation / AP isolation**(部分企業 Wi-Fi 預設開啟,會擋住裝置間通訊)
- 5 GHz 頻段優先(2.4 GHz 延遲較不穩定)
- 開放 TCP port 5555(adb)+ scrcpy 動態 port

**裝置池建議擺設**(供 QA 團隊參考,非規格要求):
- 測試機集中放在裝置架,接電源 + Wi-Fi
- 每台貼 IP 標籤
- IT 在 router 設定 DHCP 靜態綁定,確保 IP 不變

#### 3.1.3 新建 Session

開始錄影前需填:
- **Build 版本**(自由輸入字串,例:`1.4.2-RC3`)— 之後記憶最近 5 筆
- **連線方式**(USB / Wi-Fi)
- **目標裝置**(下拉選擇,顯示連線方式 icon + 裝置型號)
- **測試備註**(可選,例:「驗證 BUG-1234 修復」)

#### 3.1.4 錄影 + 標記

- 啟動後彈出 scrcpy 視窗 + 一個「Bug 面板」小視窗
- **熱鍵 F8**(全域,可改):觸發 bug 標記輸入框
- 標記輸入框欄位:
  - **嚴重度**:Major / Normal(MVP 簡化成兩級)
  - **註解**:單行文字(必填,< 200 字)
  - 按 Enter 送出 → 1 秒內關閉,不打斷遊戲
- 系統背景同步抓取:
  - 當下截圖(對應影片 frame)
  - 影片 offset(毫秒)
  - `adb logcat -t 30s` 切片

> ⚠️ Wi-Fi 模式的延遲提示:對節奏敏感的遊戲(動作 / 音遊),建議用 USB 模式;對節奏不敏感(放置 / 卡牌 / RPG),Wi-Fi 即可。客戶端在連線後會顯示**即時延遲指示燈**(綠 < 80ms / 黃 80–150ms / 紅 > 150ms)。

#### 3.1.5 結束與 Draft 審核

點「結束 Session」→ 進入 Draft 視圖:
- 縮圖列表顯示所有 bug,點任一個可預覽影片片段(前 5 秒到後 10 秒)
- 對任一 bug:可改註解、改嚴重度、刪除
- 對整個 Session:可刪除(永遠不上雲)
- 若不想上雲,直接關閉客戶端,Draft 留本機(可下次再處理)

#### 3.1.6 Commit

點 Commit 按鈕 → 客戶端依序:
1. 影片 PUT 到 R2(用 tus.io 續傳,進度條顯示)
2. 截圖批次上傳
3. Bug bundle JSON POST 到 API
4. 後端回傳成功 → session 改 `ready`
5. 跳通知,複製連結到剪貼簿

**離線處理**:斷線時 commit 排隊,網路恢復自動續傳。客戶端 crash 重啟後可恢復進度。

#### 3.1.7 本機儲存

- 路徑:`%APPDATA%/qa-tool/sessions/<sessionId>/`
- 結構:`video.mp4` + `meta.sqlite` + `screenshots/*.png` + `logcat/*.txt`
- 已 commit 的 session 預設保留 7 天備援後自動清理

### 3.2 雲端後端 API

MVP 只需要這幾個 endpoint:

| 方法 | 路徑 | 說明 |
|---|---|---|
| `POST` | `/api/auth/google` | Google OAuth 登入 |
| `POST` | `/api/sessions` | 建立 session(回傳影片 upload URL) |
| `PUT` | `/upload/...` | tus.io 上傳影片 |
| `POST` | `/api/sessions/{id}/bugs` | 批次新增 bug 標記 + 截圖 |
| `PATCH` | `/api/sessions/{id}/finalize` | 標 session 為 ready |
| `GET` | `/api/sessions` | Web 端列表(支援篩選 build / QA) |
| `GET` | `/api/sessions/{id}` | Session 詳情(含 bug 列表)|

### 3.3 Web 查閱介面

#### 3.3.1 登入

- Google OAuth → 檢查 email domain 在白名單(設定檔列出公司 domain)
- 通過即可看全部資料,不分角色

#### 3.3.2 Session 列表頁(首頁)

簡單表格:

| 欄位 | 說明 |
|---|---|
| 縮圖 | Session 第一個 bug 的截圖,沒 bug 則用第一秒 frame |
| Build | QA 填入的版本字串 |
| QA | 提交者 |
| 裝置 | Android 機型 |
| 長度 | 錄影時間 |
| Bug 數 | Major / Normal 分別計數 |
| Commit 時間 | 上傳時間 |

頂部篩選:Build(下拉)、QA(下拉)、時間範圍。預設按 commit 時間倒序。

#### 3.3.3 Session 詳情頁

URL:`/s/<sessionId>`

**Layout(左大右小)**:
- **左 70%**:HTML5 `<video>` 播放器播放 MP4
  - 進度條上**用色點標記每個 bug**(紅 = Major、橘 = Normal)
  - Hover bug marker 浮出小縮圖 + 註解前 30 字
  - 鍵盤快捷:`Space` 暫停、`←/→` 後退/前進 5 秒
- **右 30%**:Bug 列表
  - 按時間順序,每項顯示:時間戳、嚴重度色標、註解前 50 字、縮圖
  - 點任一項目 → 影片 seek 到該秒 + 高亮該項
  - URL 變成 `/s/<sessionId>#bug=<bugId>`(可分享)

頂部資訊條:Build / QA / 裝置 / 影片長度 / Bug 數

#### 3.3.4 Bug 深連結

`/s/<sessionId>#bug=<bugId>` 開啟時:
- Session 詳情頁載入完成自動 seek 到該 bug 時間
- 對應 bug 在右側列表自動高亮並滾入視野
- 自動展開該 bug 的詳細面板:完整註解、截圖大圖、logcat 切片(可摺疊)

---

## 4. 技術架構

### 4.1 系統總覽

```
   ╔════════════════ 同一個區網 / Wi-Fi ════════════════╗
   ║                                                    ║
   ║   [Windows PC + QA 客戶端 (Electron)]              ║
   ║              │                                      ║
   ║              ├── USB (adb) ──────────┐             ║
   ║              │                       │             ║
   ║              └── TCP/IP (adb:5555) ──┤             ║
   ║                                       ▼             ║
   ║                          [Android 測試機 / 裝置池]  ║
   ║                              (scrcpy 鏡像 + 鍵鼠)   ║
   ║              │                                      ║
   ║              ▼                                      ║
   ║         本機 SQLite + 檔案                          ║
   ║              │                                      ║
   ╚══════════════│══════════════════════════════════════╝
                  │
                  │ Commit (tus.io / HTTPS,需外網)
                  ▼
   ┌───────────────────────────┐
   │  雲端後端                  │
   │  ├── FastAPI (auth + API) │
   │  ├── PostgreSQL (metadata)│
   │  └── R2 (影片 + 截圖)      │
   └───────────────────────────┘
        ▲
        │ HTTPS (Google OAuth)
        │
   [Web 查閱介面 (Next.js)]
        │
        ▼
   [Engineer / PM 瀏覽器]
```

**網路拓撲說明**:
- 上半部「同區網」的所有元件:Windows PC、Android 測試機。彼此用 USB 或 Wi-Fi (TCP) 連通,**不需外網**
- 中段 Commit:本機 → 雲端,**需要外網**
- 下半部 Web 查閱:雲端 → 任何瀏覽器,**需要外網**
   │  ├── PostgreSQL (metadata)│
   │  └── R2 (影片 + 截圖)      │
   └───────────────────────────┘
        ▲
        │ HTTPS (Google OAuth)
        │
   [Web 查閱介面 (Next.js)]
        │
        ▼
   [Engineer / PM 瀏覽器]
```

### 4.2 客戶端技術棧

| 元件 | 選擇 | 備註 |
|---|---|---|
| Shell | Electron + React + Tailwind | |
| 鏡像引擎 | scrcpy(child process) | 透過 `--tcpip` 旗標支援 Wi-Fi 模式 |
| 裝置管理 | adb (Android Platform Tools) | `adb devices`、`adb tcpip 5555`、`adb connect <ip>` |
| 全域熱鍵 | Electron `globalShortcut` | |
| 延遲量測 | adb 內建 ping + scrcpy stat | 即時顯示連線品質 |
| 本機資料 | SQLite(meta)+ 檔案系統(影片/截圖) | |
| 上傳 | tus.io 客戶端 | 支援續傳 |

**裝置 Profile 本機快取**:每個配對過的裝置存在 `%APPDATA%/qa-tool/devices.sqlite`,欄位含 IP / 序號 / 暱稱 / 連線方式 / 最後連線時間,讓 QA 不必每次重新輸入 IP。

### 4.3 後端技術棧

| 元件 | 選擇 | MVP 簡化 |
|---|---|---|
| API Server | Python + FastAPI | 單一 process,無 worker queue |
| 資料庫 | PostgreSQL 16 | 單一 instance,無 read replica |
| 影片儲存 | Cloudflare R2 | egress 免費 |
| 認證 | Google OAuth 2.0 | 不做 RBAC,只判斷 domain |

### 4.4 影片播放策略

MVP **不做 HLS 轉檔**,直接服務 MP4:
- 客戶端錄製為 H.264 MP4(scrcpy 預設輸出格式)
- R2 支援 HTTP Range Request,瀏覽器 `<video>` 可隨機 seek
- 對 30 分鐘內的 session 體驗夠用

> 為什麼不做 HLS:省掉 Stream / ffmpeg 整段 pipeline,後端複雜度大幅下降。日後若 session 變長或 QA 數量增加再加。

### 4.5 前端技術棧

| 元件 | 選擇 |
|---|---|
| Framework | Next.js 15 (App Router) |
| 樣式 | Tailwind + shadcn/ui |
| 影片播放 | HTML5 `<video>`,輔以小型自製 timeline overlay |
| 狀態 | React Query |

---

## 5. 資料模型

MVP 只需要 3 張表:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  qa_user_id UUID REFERENCES users(id),
  build_version TEXT,             -- QA 自由輸入
  device_model TEXT,              -- 從 adb 抓
  android_version TEXT,
  connection_mode TEXT,           -- 'usb' | 'wifi'(供日後分析用)
  avg_latency_ms INT,             -- 連線平均延遲(Wi-Fi 模式才有意義)
  test_note TEXT,                 -- 開始時填的測試備註
  duration_ms BIGINT,
  video_url TEXT,                 -- R2 public URL(簽名)
  status TEXT,                    -- 'committing' | 'ready'
  committed_at TIMESTAMPTZ
);

CREATE TABLE bugs (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  offset_ms BIGINT,               -- 相對 session 起點
  severity TEXT,                  -- 'major' | 'normal'
  note TEXT,
  screenshot_url TEXT,
  logcat_excerpt TEXT,            -- 直接存 30 秒切片
  created_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_committed ON sessions(committed_at DESC);
CREATE INDEX idx_bugs_session ON bugs(session_id, offset_ms);
```

無 builds 表(用字串)、無 comments 表、無 tags 表、無 projects 表(MVP 假設單一遊戲)。

---

## 6. 安全與權限

### 6.1 認證

- **Web 端**:Google OAuth 2.0
- 登入時檢查 email domain 是否在白名單(`config.allowed_domains = ["yourcompany.com"]`)
- 通過 → 建立 session cookie(JWT,7 天有效)

### 6.2 授權

- MVP **不做角色細分**:所有登入使用者 = `viewer`,可看全部 session
- QA 客戶端用 **個人 API token** 上傳(從 Web 端登入後生成,複製進客戶端設定)

### 6.3 資料存取

- 影片 R2 URL 用**簽名 URL**(15 分鐘有效),不直接公開 bucket
- 截圖同上
- API 需 JWT(瀏覽器)或 API token(客戶端)

### 6.4 資料保留

- MVP 階段:**全部資料無自動刪除**(預期初期資料量小)
- Admin 可手動刪除 session(走 SQL 即可,UI 不做)

---

**MVP 完成定義(Done Criteria)**

達成以下情境即 MVP 完成:

1. 一名 QA 在 Windows 上用客戶端,錄一段 30 分鐘 Android 測試,標 5 個 bug,commit 成功
2. 上述連結貼到 Slack,工程師點開可看到影片
3. 點任一 bug 列表項目,影片正確 seek 到對應秒數
4. 連結附帶 `#bug=xxx` 的深連結直接定位到該 bug

**文件結束**
