# Loupe Slack Publish Setup

Loupe can publish exported QA evidence to Slack after local clips, reports, and summaries are generated. Slack support has two explicit connection modes:

| Mode | Best for | What Loupe stores | Notes |
| --- | --- | --- | --- |
| Connect with OAuth | Most teams and user-friendly setup | Slack user OAuth token | Publishes as the authorized Slack user. Requires a Slack app with OAuth configured. |
| Use Bot Token | IT-managed or legacy setup | Bot User OAuth Token (`xoxb-...`) | Publishes as the Slack app bot. The bot must be invited to private channels. |

## Slack app permissions

Configure scopes in **Slack App > OAuth & Permissions**. After changing scopes, reinstall the Slack app to the workspace.

### OAuth mode: User Token Scopes

| Scope | Required | Why Loupe needs it |
| --- | --- | --- |
| `chat:write` | Required | Create session summary messages and marker thread messages. |
| `files:write` | Required | Upload exported videos, PDFs, and report files. |
| `channels:read` | Required | List public channels for export channel selection. |
| `groups:read` | Required for private channels | List private channels the authorized user can access. |
| `users:read` | Recommended | Load Slack users for mention lookup. |

### Bot Token mode: Bot Token Scopes

| Scope | Required | Why Loupe needs it |
| --- | --- | --- |
| `chat:write` | Required | Create session summary messages and marker thread messages as the Slack app bot. |
| `files:write` | Required | Upload exported videos, PDFs, and report files. |
| `channels:read` | Required | List public channels for export channel selection. |
| `groups:read` | Required for private channels | List private channels the bot can access. The bot must still be invited to private channels. |
| `users:read` | Recommended | Load Slack users for mention lookup. |
| `users:read.email` | Optional | Improve mention matching by email when your team uses identity mapping. |
| `chat:write.public` | Optional | Allow posting to public channels without inviting the bot first. Private channels still require inviting the bot. |

## Multi-company Slack app note

A Slack app that is not distributed can usually only be installed in the workspace that owns it. If multiple companies need to use Loupe, use one of these approaches:

1. Each company creates its own Slack app and fills OAuth credentials or a bot token in Loupe.
2. A future Loupe-hosted Slack app can use Slack distribution, but that requires a public HTTPS OAuth callback service.

Useful Slack docs:

- [Slack app distribution](https://docs.slack.dev/distribution)
- [Installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth)

## Option A: Connect with OAuth

Use this when users should connect Loupe through a browser and publish as their Slack account. This is the recommended path for most QA teams.

<details>
<summary><strong>Step 1: Create or choose a Slack app</strong></summary>

1. Open <https://api.slack.com/apps>.
2. Create a new app in the target workspace, or choose a company-managed Loupe app.
3. Open **OAuth & Permissions**.

</details>

<details>
<summary><strong>Step 2: Add the Loupe redirect URL</strong></summary>

In the Slack app dashboard:

1. Use the left sidebar to open **OAuth & Permissions**.
2. Scroll to **Redirect URLs**.
3. Click **Add New Redirect URL**.
4. Enter this URL:

```text
loupe://slack-oauth
```

5. Click **Add**.
6. Click **Save URLs**.
7. Wait for Slack to confirm the URL was saved, then return to Loupe.

For a distributed public Slack app, Slack generally expects HTTPS redirect infrastructure. This local custom scheme is best suited for company-owned/internal app setup.

</details>

<details>
<summary><strong>Step 3: Fill OAuth settings in Loupe</strong></summary>

1. Open **Preferences**.
2. Open **Publish > Slack**.
3. Select **Connect with OAuth**.
4. Copy **Client ID** and **Client Secret** from Slack **Basic Information**.
5. Paste them into Loupe.

</details>

<details>
<summary><strong>Step 4: Connect and refresh Slack data</strong></summary>

1. Click **Connect Slack**.
2. Finish authorization in the browser.
3. Return to Loupe.
4. Refresh Slack users if you want mention lookup.
5. During export, choose the Slack channel and thread layout.

</details>

## Option B: Use Bot Token

Use this when IT wants to manage a Slack app and hand Loupe a bot token. This is useful for managed enterprise setups or teams that do not want each QA user to run OAuth.

<details>
<summary><strong>Step 1: Create or choose a company Slack app</strong></summary>

1. Open <https://api.slack.com/apps>.
2. Create an app in the target workspace, or choose a company-managed app.
3. Open **OAuth & Permissions**.

</details>

<details>
<summary><strong>Step 2: Add bot token scopes</strong></summary>

Recommended bot scopes:

```text
chat:write
files:write
users:read
channels:read
groups:read
```

Optional:

```text
chat:write.public
users:read.email
```

Use `chat:write.public` only if the bot should post to public channels without being invited. Use `users:read.email` only if your team needs richer mention lookup.

</details>

<details>
<summary><strong>Step 3: Install or reinstall the Slack app</strong></summary>

1. Click **Install to Workspace** or **Reinstall to Workspace** after changing scopes.
2. Slack will generate a **Bot User OAuth Token**.
3. Copy the token that starts with `xoxb-`.

</details>

<details>
<summary><strong>Step 4: Paste the token into Loupe</strong></summary>

1. In Loupe, open **Preferences > Publish > Slack**.
2. Select **Use Bot Token**.
3. Paste the `xoxb-...` token.
4. Click **Save Slack settings**.

</details>

<details>
<summary><strong>Step 5: Invite bot to private channels</strong></summary>

For private channels, open the Slack channel and invite the Slack app/bot before publishing. Otherwise Slack may return `not_in_channel` or `channel_not_found`.

</details>

<details>
<summary><strong>Step 6: Refresh channels and users before export</strong></summary>

1. Refresh Slack users in Preferences if you want mention lookup.
2. Open export.
3. Refresh channels if the target channel is missing.
4. Choose the channel and publish.

</details>

## Publish from Review

1. Export selected markers.
2. In the export dialog, enable **Slack**.
3. Choose a Slack channel.
4. Pick thread layout:
   - **All markers in one thread**: one session message, then marker files in that thread.
   - **Every marker per thread**: one root message per marker.
5. Publish.

## Troubleshooting

### `invalid_team_for_non_distributed_app`

The Slack app is not distributed and is being installed outside the workspace that owns it. Create a Slack app in that workspace, or use a distributed Slack app with HTTPS OAuth callback infrastructure.

### Missing scopes

Add the required scopes, reinstall the Slack app, then reconnect Slack in Loupe.

### Channel not found or bot not in channel

For bot token mode, invite the Slack app/bot to the target channel. For private channels, the bot must be a member.

### Token revoked or wrong workspace

Reconnect OAuth or paste the current bot token from the correct Slack workspace.

### File upload failure

Loupe shortens filenames for Slack uploads and continues publishing remaining files when one attachment fails. Check the export result message for failed file details.
