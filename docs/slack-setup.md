# Loupe Slack Publish Setup

Loupe can publish exported QA evidence to Slack after clips are exported. The current Slack flow in Loupe primarily uses Slack user OAuth for channel browsing and publishing, and can still fall back to a bot token where needed.

## 1. Create a Slack App

1. Open <https://api.slack.com/apps>.
2. Click **Create New App**.
3. Choose **From scratch**.
4. Pick the workspace that should receive Loupe reports.

## 2. Configure OAuth For Connect Slack

If you want Loupe to use your own Slack app for **Connect Slack**, create an OAuth app configuration in Slack and copy the client credentials from there.

1. In the Slack app page, open **Basic Information**.
2. Under **App Credentials**, copy **Client ID**.
3. If your Slack app uses a client secret, also copy **Client Secret**.
4. Open **OAuth & Permissions**.
5. Add this redirect URL:

```text
loupe://slack-oauth
```

6. Save the redirect URL.

Loupe requests these user OAuth scopes when you click **Connect Slack**:

- `chat:write`
- `files:write`
- `users:read`
- `channels:read`
- `groups:read`

### How Loupe resolves the Slack client ID

Loupe reads the Slack OAuth client credentials in this order:

1. `slack.oauthClientId`, `slack.oauthClientSecret` in the saved Loupe settings.
2. Process environment variables:
   - `LOUPE_SLACK_OAUTH_CLIENT_ID`
   - `LOUPE_SLACK_OAUTH_CLIENT_SECRET`
3. Built-in defaults:
   - Client ID: `2178062560.11055652367536`

The redirect URI is hardcoded in Loupe:

```text
loupe://slack-oauth
```

At the moment, Loupe's Publish UI shows **Connect Slack**, but does not expose separate text fields for Slack OAuth client settings. If you need to override the built-in Slack app in local development, use one of these approaches before clicking **Connect Slack**:

- set `LOUPE_SLACK_OAUTH_CLIENT_ID` and `LOUPE_SLACK_OAUTH_CLIENT_SECRET` before launching Loupe
- or edit the saved settings JSON and fill `slack.oauthClientId` and `slack.oauthClientSecret`

## 3. Add Bot Token Scopes

Open **OAuth & Permissions** and add these **Bot Token Scopes**:

- `chat:write`
- `files:write`
- `users:read`

Optional:

- `chat:write.public` if you want the bot to post to public channels without inviting it first.

After changing scopes, click **Install to Workspace** or **Reinstall to Workspace**.

Copy the **Bot User OAuth Token**. It starts with:

```text
xoxb-
```

The bot token is mainly useful for the legacy bot-token publish path. For the current Loupe UI flow, **Connect Slack** uses user OAuth and stores a user access token after browser authorization.

## 4. Add the Bot to the Slack Channel

For most channels, invite the bot before publishing:

```text
/invite @your-bot-name
```

If the bot is not in the channel, Slack returns:

```text
not_in_channel
```

Private channels always require inviting the bot.

## 5. Copy the Channel ID

1. Open the Slack channel.
2. Click the channel name.
3. Open **About** or **Channel details**.
4. Copy the channel ID.

Channel IDs usually look like:

```text
C1234567890
```

Private channel or group IDs may start with `G`.

## 6. Configure Loupe

1. Open Loupe.
2. Go to the Home screen.
3. Find the **Publish** section.
4. Click **Connect Slack**.
5. Finish authorization in the browser.
6. Click **Refresh** in the Slack publish section so Loupe can fetch channels.
7. Select the target channel.
8. Refresh users if needed to fetch the workspace user list and seed the shared mention identity table.
9. Optional: add fallback users manually with a readable alias format such as `Miki=U1234567890` or `QA Lead=<@U2345678901>`.

If your build still uses the legacy bot-token path, configure these values in saved settings before publishing:

- `slack.botToken`
- `slack.channelId`

Slack mentions must use user IDs under the hood, not display names, because display names are not guaranteed to be unique. Loupe fetches display names for the UI, stores the matching IDs, and sends Slack's mention format, for example `<@U1234567890>`.

## 7. Publish From Review

1. Record a session and stop it.
2. For each marker that needs attention, open the **Mention people** picker and select one or more mention identities.
3. Select one or more markers in Review.
4. Click Export / Publish.
5. Set **Publish target** to **Slack**.
6. Choose one Slack thread layout:
   - **All markers in one thread**: posts one session message, then uploads every selected marker clip, preview image, and logcat file under that same thread.
   - **Every marker per thread**: posts one message per marker, then uploads that marker's clip, preview image, and logcat file under its own thread.
7. Click **Publish**.

When marker mentions are configured, Loupe adds the relevant mentions to the session thread and the marker attachment/comment in **All markers in one thread** mode, or to each marker root message in **Every marker per thread** mode. If a marker has no selected users, Loupe falls back to the optional fallback users from Publish settings.

The mention model is provider-neutral: marker picks store Loupe mention identity ids. Loupe prefers email when matching Slack and GitLab users, then falls back to provider IDs and names. Slack resolves identities to `<@USERID>`, while GitLab resolves the same people to `@username` when a GitLab username is configured.

## Troubleshooting

### `Slack OAuth client ID is missing`

Loupe could not find a client ID from saved settings, environment variables, or the built-in default path.

Check these values:

- `slack.oauthClientId` in saved settings
- `LOUPE_SLACK_OAUTH_CLIENT_ID` in the launch environment
- the Slack app **Client ID** copied from **Basic Information**

If you use your own Slack app, also make sure the redirect URI in Slack exactly matches:

```text
loupe://slack-oauth
```

### `not_in_channel`

The bot is not a member of the target channel. Invite it:

```text
/invite @your-bot-name
```

If you are posting to a public channel without inviting the bot, add the `chat:write.public` scope and reinstall the Slack app.

### `missing_scope`

The app is missing a required permission. Add `chat:write`, `files:write`, and `users:read`, then reinstall the Slack app.

### `invalid_auth`

The token is wrong, revoked, or from a different workspace. Copy the current **Bot User OAuth Token** from Slack app settings.

### `files.getUploadURLExternal failed: invalid_arguments`

Slack rejected one file upload request. Common causes:

- the file is empty
- the filename is too long or contains characters Slack rejects
- the workspace restricts uploads

Loupe shortens filenames for Slack uploads and continues publishing remaining files when one attachment fails.
