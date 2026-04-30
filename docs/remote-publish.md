# Loupe Remote Publish 規劃

## 目前 Slack Publish 流程

Loupe 的 remote publish 目前只有 Slack，流程如下：

1. Renderer 在匯出對話框選擇 `local` 或 `slack`，Slack 可選 `single-thread` 或 `per-marker-thread`。
2. IPC 匯出影片、預覽圖、選配 logcat sidecar、PDF report、summary text。
3. `writeExportManifests()` 產出：
   - `export-manifest.json`
   - `export-manifest.csv`
   - `slack-publish-plan.json`，只有 Slack target 會寫入。
4. `publishManifestToRemote()` 依 `manifest.publish.target` 分派 publisher。
5. Slack adapter 讀取 manifest，透過 Slack API 發訊息與上傳每個 marker 的附件。

相關檔案：

- `apps/desktop/shared/types.ts`: `PublishTarget`, `ExportPublishOptions`, `SlackPublishSettings`
- `apps/desktop/electron/export-manifest.ts`: manifest schema、CSV、Slack plan payload
- `apps/desktop/electron/remote-publisher.ts`: remote publish router
- `apps/desktop/electron/slack-publisher.ts`: Slack API adapter
- `apps/desktop/electron/ipc.ts`: 匯出完成後呼叫 remote publisher
- `apps/desktop/src/components/BugList.tsx`: 匯出 UI、Slack thread mode
- `apps/desktop/src/routes/Home.tsx`: Slack token/channel/mention 設定

## 已完成的抽象化

本次先把 IPC 對 Slack 的直接依賴收斂到 `remote-publisher.ts`：

- 匯出流程現在只呼叫 `publishManifestToRemote()`。
- `local` publish 由 router 回傳 skipped result。
- `slack` publish 由 router 呼叫既有 `publishManifestToSlack()`。
- 新增 `remote-publisher.test.ts` 覆蓋 local skip 與 Slack dispatch。

這個切法讓 GitLab 可以作為新的 adapter 加入，而不需要再次修改單筆匯出與批次匯出的核心流程。

## Slack 現況分析

優點：

- 已經使用 manifest 作為 publish 邊界，匯出資料和 remote 目的地沒有完全耦合。
- marker 層級已有 `mentionUserIds`，Slack 目前用 `<@USERID>` render；同一概念可延伸到 GitLab username。
- Slack 單一 thread 與每 marker thread 兩種 layout 已能對應 GitLab 的「單 issue 多留言」與「每 marker 一個 issue」模式。
- 附件 upload 失敗時會收集錯誤並繼續其他檔案，這個容錯策略也適合 GitLab。

限制：

- `PublishTarget` 目前只有 `local | slack`。
- `ExportManifest.publish` 仍含 Slack 專屬欄位 `slackThreadMode`。
- `slack-publish-plan.json` 是 provider-specific artifact，未來 GitLab 需要自己的 `gitlab-publish-plan.json`，或改成 `remote-publish-plan.json` 加上 provider 欄位。
- 設定儲存仍是 `AppSettings.slack`，尚未有 `gitlab` 區塊。
- UI 的 mention picker 目前綁 Slack user metadata，GitLab 需要 username/user ID 的同步與顯示模型。

## GitLab Publish 可行性

GitLab publish 可行，建議第一版採「Issue + Markdown Uploads」。

官方 API 對應：

- Project uploads: `POST /projects/:id/uploads`，回傳可放進 issue/comment 的 Markdown link。
  <https://docs.gitlab.com/api/project_markdown_uploads/>
- Issues: 可在 project 下建立 issue。
  <https://docs.gitlab.com/api/issues/>
- Notes: 可對 issue 建立留言，`body` 最高 1,000,000 字元。
  <https://docs.gitlab.com/api/notes/>
- Personal access token / token scopes 可用於 API 驗證。
  <https://docs.gitlab.com/api/personal_access_tokens/>

建議模式：

1. `single-issue`
   - 建立一個 issue，例如 `[Loupe QA] Build 1.2.3 - Pixel 7 - 5 markers`。
   - issue description 放 session summary、manifest 摘要、marker index。
   - 每個 marker 建一則 note，note 中包含 severity、note、device/build/tester、mentions、附件 Markdown links。
   - 最接近 Slack `single-thread`。

2. `per-marker-issue`
   - 每個 marker 建立一個 issue。
   - session summary 放在 issue description，附件放 description 或第一則 note。
   - 最接近 Slack `per-marker-thread`。

不建議第一版使用 Repository Files API 直接 commit 大型影片，因為它比較適合文字/小檔案；官方文件也列出較大 request 的限制與 rate limit。若團隊需要長期保存大型 evidence，後續可改用 GitLab package registry、object storage，或只把 Loupe 匯出資料夾路徑/外部連結寫入 issue。

## GitLab 設定建議

新增 `GitLabPublishSettings`：

```ts
export interface GitLabPublishSettings {
  baseUrl: string
  token: string
  projectId: string
  mode: 'single-issue' | 'per-marker-issue'
  labels?: string[]
  confidential?: boolean
  mentionUsernames?: string[]
  mentionAliases?: Record<string, string>
}
```

欄位說明：

- `baseUrl`: 預設 `https://gitlab.com`，self-managed GitLab 可填公司網域。
- `token`: Personal Access Token，第一版建議使用 `api` scope。
- `projectId`: GitLab project ID 或 URL-encoded path。
- `mode`: 對應 Slack thread layout。
- `labels`: 預設可放 `loupe`, `qa-evidence`。
- `confidential`: 讓 issue/note 用內部或 confidential 模式，視 GitLab API 支援欄位而定。
- `mentionUsernames`: 用 `@username` render。

設定 UI 可放在 Home 的 Publish settings 區塊，和 Slack 並列：

- Provider segmented control: Slack / GitLab。
- GitLab base URL、project ID、token。
- Publish layout: Single issue / Issue per marker。
- Labels input。
- Username mention input。
- Test connection：呼叫 `/api/v4/personal_access_tokens/self` 或讀取 project metadata。

## 實作步驟

1. 型別與設定
   - `PublishTarget` 加上 `gitlab`。
   - `AppSettings` 加上 `gitlab: GitLabPublishSettings`。
   - `settings.ts` 新增 normalize GitLab settings。
   - `main.ts` 補預設值。

2. Manifest schema
   - `ExportManifest.publish.target` 支援 `gitlab`。
   - 新增 provider-neutral `layout?: 'single-thread' | 'per-marker-thread' | 'single-issue' | 'per-marker-issue'`，或保留 Slack/GitLab 各自欄位但集中在 provider options。
   - 產出 `gitlab-publish-plan.json`，內容先放預計 issue title、description、marker notes、files。

3. GitLab adapter
   - 新增 `apps/desktop/electron/gitlab-publisher.ts`。
   - 實作 `gitlabApi()`、`uploadProjectFile()`、`createIssue()`、`createIssueNote()`。
   - 檔案先走 Project uploads，再把回傳 Markdown 放入 description/note。
   - 單檔 upload 失敗應收集錯誤，完成後在 issue/note 補錯誤摘要。

4. Router
   - 在 `remote-publisher.ts` 對 `gitlab` 分派 `publishManifestToGitLab()`。

5. UI
   - 匯出 modal 加上 GitLab target。
   - Home settings 加 GitLab 設定與連線測試。
   - marker mention picker 第二階段再做 GitLab user sync；第一版可先接受 `@username` 文字輸入。

6. 測試
   - GitLab adapter mock fetch：upload、create issue、create note、upload failure。
   - manifest test：GitLab target 與 plan file。
   - IPC/export test：GitLab target 會走 remote router。

## 第一版建議驗收標準

- 使用者可設定 GitLab base URL、token、project ID、mode、labels。
- 匯出單筆或批次 marker 時可選 GitLab。
- `single-issue` 會建立一個 issue，並把每個 marker 的影片、預覽圖、logcat 以 Markdown link 掛上。
- `per-marker-issue` 會為每個 marker 建 issue。
- 任一附件失敗不會中止整批 publish，最後會留下錯誤摘要。
- 匯出資料夾仍保留 `export-manifest.json`、`export-manifest.csv`，GitLab publish 另寫 `gitlab-publish-plan.json` 方便除錯。
