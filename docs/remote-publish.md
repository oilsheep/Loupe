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
- marker 層級保留 `mentionUserIds` 欄位做相容儲存格式，但新語意是 Loupe mention identity id，不再直接等同 Slack user id。
- Slack 單一 thread 與每 marker thread 兩種 layout 已能對應 GitLab 的「單 issue 多留言」與「每 marker 一個 issue」模式。
- 附件 upload 失敗時會收集錯誤並繼續其他檔案，這個容錯策略也適合 GitLab。

仍待改善：

- `slack-publish-plan.json` 還是 Slack-specific artifact；GitLab 尚未寫 `gitlab-publish-plan.json`。
- mention 已抽成 provider-neutral identity table；Slack 與 GitLab user sync 會自動補/更新各自 identity。
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
- Project members: `GET /projects/:id/members/all` 可列出目前 token 對該 project 可見的直接、繼承與 invited members，Loupe 用它同步 GitLab mentions。
  <https://docs.gitlab.com/api/project_members/>

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

## Mention Identity Table

Slack 和 GitLab 的 mention 格式不同：

- Slack: `<@U123456>`
- GitLab: `@username`

因此 Loupe 不讓 marker 直接保存某個 provider 的 id。現在新增 `MentionIdentity`，用一個 user-friendly id 對應多個 remote identity：

```ts
export interface MentionIdentity {
  id: string
  displayName: string
  email?: string
  slackUserId?: string
  gitlabUsername?: string
}
```

marker 的 `mentionUserIds` 目前為了相容舊資料仍沿用舊欄位名稱，但內容應視為 `MentionIdentity.id`。Publish 時 provider adapter 會自行 resolve：

- Slack publish: `MentionIdentity.id -> slackUserId -> <@USERID>`。
- GitLab publish: `MentionIdentity.id -> gitlabUsername -> @username`。
- 找不到 GitLab username 時不會 fallback 成原始 id，避免把 Slack `U...` id 發成 GitLab mention。
- 舊 session 如果 marker 裡還是 Slack user id，Slack publish 仍可 fallback 發出 `<@USERID>`；GitLab 會忽略這類未映射 id。

Home 的 Publish 區塊提供 mention identity table UI，可維護：

- Display name
- Email
- Slack user ID
- GitLab username
- Import / Export JSON

和 Slack/GitLab user sync 的整合方式：

1. 按 Slack **Refresh users** 後，Loupe 會呼叫 Slack `users.list`。
2. 按 GitLab **Refresh users** 後，Loupe 會呼叫 GitLab `GET /projects/:id/members/all`，並處理 pagination；只有 `state === "active"` 的 member 會進入 cache 和 mention identity merge。
3. `settings.slack.mentionUsers` 與 `settings.gitlab.mentionUsers` 會保存原始 user list，供重新整理與顯示。
4. `settings.mentionIdentities` 會依 email、provider id 或 display name/name 自動建立或更新 identity；email 優先，避免 Slack display name 和 GitLab name 不一致時拆成兩個人。
5. 若既有 identity 已有相同 email、`slackUserId` 或 `gitlabUsername`，會合併成同一筆 identity，不覆蓋手動填寫的另一個 provider mapping。
6. 若早期因為缺 email 產生 Slack/GitLab 兩筆落單 identity，之後某次 refresh 取得 email 並 mapping 成功，Loupe 會把舊的落單 identity 併入完整 mapping，只保留一筆。
7. UI 也提供從 Slack/GitLab users 快速新增到 identity table 的操作。

因為 GitLab email lookup 需要特定權限，Slack/GitLab **Save publish settings** 不會自動 refresh users。只有使用者按 **Refresh users** 並確認後才會更新 user cache 與 mention identity table，避免沒有權限取得 email 的人意外覆蓋較完整的 mapping。

Mention identity table 可匯出成 JSON：

```json
{
  "version": 1,
  "exportedAt": "2026-04-30T00:00:00.000Z",
  "mentionIdentities": []
}
```

匯入時可接受上述格式，也接受直接以 `MentionIdentity[]` 作為 JSON root。建議由有 GitLab admin/email 權限的人先整理並匯出，再提供給其他測試人員匯入。

Slack email 需要 bot token 有可讀 email 的 scope；GitLab member email 視 GitLab 權限與 instance 設定而定。API 沒回 email 時仍會 fallback 到 provider id/name matching。

GitLab 的 `GitLab email lookup` 設定可選：

- `off`: 只使用 project members API 回傳的欄位。
- `admin-users-api`: `Refresh users` 仍先抓 project members，再對沒有 email 的 member 額外呼叫 `GET /users/:id`。self-managed GitLab 的 admin token 可透過此 API 讀到 `email`，成功時會填進 `MentionIdentity.email`。

若 `/users/:id` 回 403，Loupe 會顯示「需要 self-managed admin token 才能讀取 GitLab email。」但不會中斷 refresh；GitLab users 與 mention identity 仍會用可取得的欄位更新。

若 `/users/:id` 回 200 但沒有 `email` / `public_email`，Loupe 會顯示「GitLab users API 沒有回傳 email；請確認 token 是 self-managed admin token 且有 api scope。」這通常代表目前 token 可以讀 public user profile，但不是可讀完整 email 的 self-managed admin token。按 **Refresh users** 時會先保存目前 GitLab 表單設定，所以切換 `GitLab email lookup` 後不需要另外按 Save 才會生效。

## GitLab 設定

新增 `GitLabPublishSettings`：

```ts
export interface GitLabPublishSettings {
  baseUrl: string
  token: string
  authType?: 'pat' | 'oauth'
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRedirectUri?: string
  projectId: string
  mode: 'single-issue' | 'per-marker-issue'
  emailLookup?: 'off' | 'admin-users-api'
  labels?: string[]
  confidential?: boolean
  mentionUsernames?: string[]
  mentionUsers?: GitLabMentionUser[]
  usersFetchedAt?: string | null
  lastUserSyncWarning?: string | null
}
```

欄位說明：

- `baseUrl`: 預設 `https://gitlab.com`，self-managed GitLab 可填公司網域。
- `token`: Personal Access Token 或 OAuth access token；PAT 建議使用 `api` scope。
- `authType`: `pat` 時用 `PRIVATE-TOKEN` header；`oauth` 時用 `Authorization: Bearer ...`。
- `oauthClientId`: GitLab OAuth Application ID。
- `oauthClientSecret`: confidential OAuth application 才需要；non-confidential + PKCE 可留空。
- `oauthRedirectUri`: 預設 `http://127.0.0.1:38987/oauth/gitlab/callback`，必須登錄在 GitLab OAuth application。
- `projectId`: GitLab project ID 或 URL-encoded path。
- `mode`: 預設匯出模式；匯出 dialog 可覆蓋。
- `emailLookup`: 預設 `off`；選 `admin-users-api` 時會用 self-managed admin token 嘗試從 `/users/:id` 補 email。
- `labels`: 預設可放 `loupe`, `qa-evidence`。
- `confidential`: 讓 issue/note 用內部或 confidential 模式，視 GitLab API 支援欄位而定。
- `mentionUsernames`: GitLab fallback mentions，用 `@username` render；marker 層級 mentions 優先使用 mention identity table。
- `mentionUsers`: `Refresh users` 從 project members API 抓回的 active GitLab users cache。
- `usersFetchedAt`: GitLab users cache 的更新時間。
- `lastUserSyncWarning`: user sync 的非阻斷提示，例如 token 不是 self-managed admin 時 email lookup 會收到 403。

設定 UI 放在 Home 的 Publish settings 區塊，和 Slack 並列：

- GitLab base URL、project ID、token。
- GitLab auth：Personal access token / OAuth。OAuth 使用 authorization code + PKCE；GitLab OAuth application scope 建議 `api`，Redirect URI 填 Loupe UI 顯示的 localhost URI。
- Labels input。
- GitLab fallback username input。
- GitLab email lookup：`off` / `admin-users-api`。
- GitLab users refresh。
- Confidential/internal issue toggle。
- Mention identity table：維護 display name、Slack user id、GitLab username。

## 後續

- 加 GitLab connection test。
- 加 `gitlab-publish-plan.json` 或 provider-neutral `remote-publish-plan.json`。
- 補 GitLab username search picker，讓大型 project 不必整批瀏覽 members。
- 視團隊需求改用 package registry 或 object storage 保存大型 evidence。
