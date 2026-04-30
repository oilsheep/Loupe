# Loupe GitLab Publish Setup

Loupe can publish exported QA evidence to GitLab issues. GitLab publishing supports either a Personal Access Token or GitLab OAuth.

## 1. Choose Authentication

### Option A: Personal Access Token

1. Open GitLab.
2. Go to **Preferences** or **User Settings**.
3. Open **Access Tokens**.
4. Create a token with `api` scope.
5. Copy the token. It usually starts with:

```text
glpat-
```

In Loupe:

1. Open **Publish** > **GitLab**.
2. Set **GitLab auth** to **Personal access token**.
3. Paste the token into **GitLab token**.

### Option B: OAuth

OAuth requires a GitLab OAuth application. Loupe uses authorization code with PKCE. For non-confidential applications, Loupe only needs the Application ID. For confidential applications, also copy the Secret.

1. Open GitLab.
2. Go to **Preferences** or **User Settings**.
3. Open **Applications**.
4. Create a new application.
5. Set **Redirect URI** to:

```text
http://127.0.0.1:38987/oauth/gitlab/callback
```

6. Select scope:

```text
api
```

7. Save the application.
8. Copy **Application ID**.
9. If the application is confidential, also copy **Secret**.

In Loupe:

1. Open **Publish** > **GitLab**.
2. Set **GitLab auth** to **OAuth**.
3. Paste **Application ID** into **OAuth client ID**.
4. If the application is confidential, paste **Secret** into **OAuth client secret**. Leave it empty for non-confidential applications.
5. Keep **Redirect URI** matching the value registered in GitLab.
6. Click **Connect OAuth**.
7. Finish authorization in the browser.

After OAuth succeeds, Loupe stores the OAuth access token in **GitLab token** and sends GitLab API requests with `Authorization: Bearer ...`.

## 2. Configure Project Publishing

Fill these fields in **Publish** > **GitLab**:

- **GitLab base URL**: `https://gitlab.com` or your self-managed GitLab URL.
- **Project**: click **Refresh projects** after setting a PAT or connecting OAuth, then choose the project from the dropdown. You can still type a project path such as `group/project` before refreshing.
- **Labels**: comma-separated labels, for example `loupe, qa-evidence`.
- **GitLab fallback usernames**: optional fallback mentions, for example `@qa, @lead`.
- **Default GitLab mode**:
  - **Single issue**: one GitLab issue with marker comments.
  - **Issue per marker**: one GitLab issue per selected marker.
- **Create confidential/internal GitLab issues and notes**: enable if reports should be private/internal.

Click **Save GitLab settings** after editing these fields.

## 2.1. Project Dropdown

**Refresh projects** calls:

```text
GET /api/v4/projects?membership=true&simple=true&archived=false
```

This works with either auth mode:

- PAT: use a token that can read projects, usually `read_api` or `api`.
- OAuth: connect OAuth first; Loupe then uses the OAuth access token.

Loupe stores the selected project path, for example `group/project`, so publishing and user refresh keep using the same project.

## 3. GitLab User Refresh And Email Lookup

Click **Refresh users** to fetch active project members from:

```text
GET /api/v4/projects/:id/members/all
```

Loupe only keeps users with:

```text
state === "active"
```

Refresh requires confirmation because it can update the shared mention identity table.

### GitLab email lookup

The **GitLab email lookup** setting controls whether Loupe tries to enrich GitLab users with email:

- **Off**: only use email returned by the project members API.
- **Admin users API**: after fetching project members, Loupe calls `GET /api/v4/users/:id` for users missing email.

For self-managed GitLab, reading user email through `/users/:id` usually requires an admin token. If the token cannot read email:

- `403` shows: `需要 self-managed admin token 才能讀取 GitLab email。`
- `200` without email shows: `GitLab users API 沒有回傳 email；請確認 token 是 self-managed admin token 且有 api scope。`

The refresh still continues; it just cannot fill missing emails.

## 4. Mention Identity Table

Slack and GitLab mention formats are different:

- Slack: `<@U123456>`
- GitLab: `@username`

Loupe uses a shared mention identity table:

```ts
{
  displayName: string
  email?: string
  slackUserId?: string
  gitlabUsername?: string
}
```

Loupe prefers email when matching Slack and GitLab users. If a later refresh gets email and discovers that two older unmapped rows are the same person, Loupe merges them into one row.

Because not everyone has permission to read GitLab email, **Save GitLab settings** does not automatically refresh users. Only **Refresh users** updates user caches and mention identities.

## 5. Import And Export Mention Identities

Use **Publish** > **Mention identities**:

- **Export** writes a JSON file such as `loupe-mention-identities.json`.
- **Import** replaces the local mention identity table with the selected JSON file.

Recommended team flow:

1. Someone with Slack/GitLab email visibility refreshes users.
2. They review and fix the mention identity table.
3. They export `loupe-mention-identities.json`.
4. Other testers import that file instead of refreshing with lower-permission tokens.

## 6. Publish From Review

1. Record a session and stop it.
2. For each marker, select people from **Mention people**.
3. Select markers in Review.
4. Click Export / Publish.
5. Set **Publish target** to **GitLab**.
6. Choose GitLab mode if the export dialog allows overriding the default.
7. Click **Publish**.

Loupe uploads the report and marker clips to GitLab project uploads, then links them in issue descriptions or notes.

## Troubleshooting

### OAuth asks for Application ID

This is GitLab's OAuth `client_id`. Create a GitLab OAuth application and copy **Application ID**. If your GitLab application is confidential, also fill **OAuth client secret**.

### OAuth callback fails

Make sure the GitLab OAuth application Redirect URI exactly matches:

```text
http://127.0.0.1:38987/oauth/gitlab/callback
```

Also make sure another app is not already using port `38987`.

### OAuth token exchange says client authentication failed

Check these settings:

- **OAuth client ID** must be the GitLab **Application ID**, not the application name.
- **Redirect URI** in Loupe must exactly match the GitLab application.
- If the GitLab application is confidential, fill **OAuth client secret** with the application **Secret**.
- If you do not want to store a secret in Loupe, create a non-confidential GitLab application and use PKCE with only the Application ID.

### `401 Unauthorized`

The token is invalid, expired, revoked, or sent with the wrong auth type. For OAuth, set **GitLab auth** to **OAuth**. For PAT, set it to **Personal access token**.

### GitLab users refresh succeeds but no email appears

Project members API often does not expose email. Use **GitLab email lookup** > **Admin users API** with a self-managed admin token, or import a mention identity table prepared by someone with the right permissions.
