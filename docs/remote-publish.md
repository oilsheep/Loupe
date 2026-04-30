# Loupe Remote Publish

## 目前 Slack Publish 流程

Loupe 的 remote publish 目前支援 Slack 與 GitLab，流程如下：

1. Renderer 在匯出對話框選擇 `local`、`slack` 或 `gitlab`。
2. IPC 匯出影片、預覽圖、選配 logcat sidecar、PDF report、summary text。
3. `writeExportManifests()` 產出：
   - `export-manifest.json`
   - `export-manifest.csv`
   - `slack-publish-plan.json`，只有 Slack target 會寫入。
4. `publishManifestToRemote()` 依 `manifest.publish.target` 分派 publisher。
5. Provider adapter 讀取 manifest，透過 Slack 或 GitLab API 發佈 QA evidence。

相關檔案：

- `apps/desktop/shared/types.ts`: `PublishTarget`, `ExportPublishOptions`, `SlackPublishSettings`
- `apps/desktop/electron/export-manifest.ts`: manifest schema、CSV、Slack plan payload
- `apps/desktop/electron/remote-publisher.ts`: remote publish router
- `apps/desktop/electron/slack-publisher.ts`: Slack API adapter
- `apps/desktop/electron/gitlab-publisher.ts`: GitLab API adapter
- `apps/desktop/electron/ipc.ts`: 匯出完成後呼叫 remote publisher
- `apps/desktop/src/components/BugList.tsx`: 匯出 UI、provider layout
- `apps/desktop/src/routes/Home.tsx`: Slack/GitLab publish 設定

## 已完成的抽象化與 GitLab 第一版

IPC 對 provider 的直接依賴已收斂到 `remote-publisher.ts`：

- 匯出流程現在只呼叫 `publishManifestToRemote()`。
- `local` publish 由 router 回傳 skipped result。
- `slack` publish 由 router 呼叫既有 `publishManifestToSlack()`。
- `gitlab` publish 由 router 呼叫 `publishManifestToGitLab()`。
- `remote-publisher.test.ts` 覆蓋 local、Slack、GitLab dispatch。

GitLab 第一版採「Issue + Project uploads」：

- `single-issue`: 建一個 issue，PDF/summary 放 description，每個 marker 建一則 note。
- `per-marker-issue`: 每個 marker 建一個 issue。
- 影片與 PDF 先透過 `POST /projects/:id/uploads` 上傳，再把回傳 Markdown link 放到 issue/note。
- 單檔 upload 失敗會被收集成錯誤摘要，不會中止整批 publish。

## Slack 現況分析

優點：

- 已經使用 manifest 作為 publish 邊界，匯出資料和 remote 目的地沒有完全耦合。
- marker 層級已有 `mentionUserIds`，Slack 目前用 `<@USERID>` render；同一概念可延伸到 GitLab username。
- Slack 單一 thread 與每 marker thread 兩種 layout 已能對應 GitLab 的「單 issue 多留言」與「每 marker 一個 issue」模式。
- 附件 upload 失敗時會收集錯誤並繼續其他檔案，這個容錯策略也適合 GitLab。

仍待改善：

- `slack-publish-plan.json` 還是 Slack-specific artifact；GitLab 尚未寫 `gitlab-publish-plan.json`。
- GitLab mention 第一版用手填 username，尚未同步 GitLab users。
- GitLab 沒有 connection test，後續可補 `/api/v4/personal_access_tokens/self` 或讀 project metadata。

## GitLab Publish 實作

GitLab publish 已採「Issue + Markdown Uploads」。

官方 API 對應：

- Project uploads: `POST /projects/:id/uploads`，回傳可放進 issue/comment 的 Markdown link。
  <https://docs.gitlab.com/api/project_markdown_uploads/>
- Issues: 可在 project 下建立 issue。
  <https://docs.gitlab.com/api/issues/>
- Notes: 可對 issue 建立留言，`body` 最高 1,000,000 字元。
  <https://docs.gitlab.com/api/notes/>
- Personal access token / token scopes 可用於 API 驗證。
  <https://docs.gitlab.com/api/personal_access_tokens/>

已實作模式：

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

## GitLab 設定

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
}
```

欄位說明：

- `baseUrl`: 預設 `https://gitlab.com`，self-managed GitLab 可填公司網域。
- `token`: Personal Access Token，第一版建議使用 `api` scope。
- `projectId`: GitLab project ID 或 URL-encoded path。
- `mode`: 預設匯出模式；匯出 dialog 可覆蓋。
- `labels`: 預設可放 `loupe`, `qa-evidence`。
- `confidential`: 讓 issue/note 用內部或 confidential 模式，視 GitLab API 支援欄位而定。
- `mentionUsernames`: 用 `@username` render。

設定 UI 放在 Home 的 Publish settings 區塊，和 Slack 並列：

- GitLab base URL、project ID、token。
- Labels input。
- Username mention input。
- Confidential/internal issue toggle。

## 後續

- 加 GitLab connection test。
- 加 `gitlab-publish-plan.json` 或 provider-neutral `remote-publish-plan.json`。
- 補 GitLab user sync / username picker。
- 視團隊需求改用 package registry 或 object storage 保存大型 evidence。
