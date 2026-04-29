# Loupe Slack Publish Setup

Loupe can publish exported QA evidence to Slack after clips are exported. Slack publishing uses a Slack app bot token and a target channel ID.

## 1. Create a Slack App

1. Open <https://api.slack.com/apps>.
2. Click **Create New App**.
3. Choose **From scratch**.
4. Pick the workspace that should receive Loupe reports.

## 2. Add Bot Token Scopes

Open **OAuth & Permissions** and add these **Bot Token Scopes**:

- `chat:write`
- `files:write`

Optional:

- `chat:write.public` if you want the bot to post to public channels without inviting it first.

After changing scopes, click **Install to Workspace** or **Reinstall to Workspace**.

Copy the **Bot User OAuth Token**. It starts with:

```text
xoxb-
```

## 3. Add the Bot to the Slack Channel

For most channels, invite the bot before publishing:

```text
/invite @your-bot-name
```

If the bot is not in the channel, Slack returns:

```text
not_in_channel
```

Private channels always require inviting the bot.

## 4. Copy the Channel ID

1. Open the Slack channel.
2. Click the channel name.
3. Open **About** or **Channel details**.
4. Copy the channel ID.

Channel IDs usually look like:

```text
C1234567890
```

Private channel or group IDs may start with `G`.

## 5. Configure Loupe

1. Open Loupe.
2. Go to the Home screen.
3. Find the **Publish** section.
4. Paste the Slack bot token into **Slack bot token**.
5. Paste the channel ID into **Slack channel ID**.
6. Click **Save publish settings**.

## 6. Publish From Review

1. Record a session and stop it.
2. Select one or more markers in Review.
3. Click Export / Publish.
4. Set **Publish target** to **Slack**.
5. Choose one Slack thread layout:
   - **All markers in one thread**: posts one session message, then uploads every selected marker clip, preview image, and logcat file under that same thread.
   - **Every marker per thread**: posts one message per marker, then uploads that marker's clip, preview image, and logcat file under its own thread.
6. Click **Publish**.

## Troubleshooting

### `not_in_channel`

The bot is not a member of the target channel. Invite it:

```text
/invite @your-bot-name
```

If you are posting to a public channel without inviting the bot, add the `chat:write.public` scope and reinstall the Slack app.

### `missing_scope`

The app is missing a required permission. Add `chat:write` and `files:write`, then reinstall the Slack app.

### `invalid_auth`

The token is wrong, revoked, or from a different workspace. Copy the current **Bot User OAuth Token** from Slack app settings.

### `files.getUploadURLExternal failed: invalid_arguments`

Slack rejected one file upload request. Common causes:

- the file is empty
- the filename is too long or contains characters Slack rejects
- the workspace restricts uploads

Loupe shortens filenames for Slack uploads and continues publishing remaining files when one attachment fails.
