# Loupe Google Drive Publish Setup

Loupe can publish exported QA evidence to Google Drive and optionally append marker rows to a Google Sheet.

Google publishing uses OAuth. The OAuth client ID / secret are bundled at build time, so testers do not need to type them in Loupe.

## 1. Create A Google Cloud Project

1. Open <https://console.cloud.google.com/>.
2. Create or choose a project for Loupe.
3. Open **APIs & Services** > **Library**.
4. Enable:
   - **Google Drive API**
   - **Google Sheets API**

## 2. Configure OAuth Consent

Open **APIs & Services** > **OAuth consent screen**.

For internal team usage:

1. Choose **Internal** if your Google Workspace allows it.
2. Fill app name, support email, and developer contact email.
3. Add required scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/spreadsheets`

If you must use **External** while the app is not verified, add tester Google accounts under **Test users**.

## 3. Create OAuth Client

Open **APIs & Services** > **Credentials**.

1. Click **Create credentials**.
2. Choose **OAuth client ID**.
3. Choose **Desktop app**.
4. Create the client.
5. Copy **Client ID** and **Client secret**.

Loupe uses this redirect URI:

```text
http://127.0.0.1:38988/oauth/google/callback
```

Keep Loupe's configured redirect URI unchanged unless the app code is also changed.
Unlike Slack and GitLab, Google Desktop OAuth should use the loopback redirect. Do not set this to `loupe://google-oauth`; Google rejects arbitrary custom schemes for this client flow.

## 4. Configure Build-Time Secrets

Do not commit the Google OAuth secret to git.

For local builds, create:

```text
apps/desktop/.env.local
```

Use this format:

```text
LOUPE_GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
LOUPE_GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

`apps/desktop/.env.local` is ignored by git. `apps/desktop/.env.example` is the committed template.

For CI/release builds, configure these as secret variables:

```text
LOUPE_GOOGLE_OAUTH_CLIENT_ID
LOUPE_GOOGLE_OAUTH_CLIENT_SECRET
```

Then build normally:

```bash
pnpm --dir apps/desktop build
```

`electron.vite.config.ts` injects those values into the Electron main bundle at build time. The source repo stays secret-free, but the packaged app still contains the OAuth client secret. This is suitable for internal distribution, not public distribution of a confidential OAuth client.

## 5. Configure Loupe

1. Open Loupe.
2. Go to the Home screen.
3. Find **Publish** > **Google Drive**.
4. Click **Connect Google**.
5. Finish authorization in the browser.
6. Click **Refresh folders**.
7. Choose a Drive folder, paste a Google Drive folder URL, paste a folder ID, or create a new folder from Loupe.
8. Optional: enable **Append every marker to Google Sheet**.
9. Click **Refresh spreadsheets** and choose a spreadsheet. You can also paste a Google Sheets URL or spreadsheet ID.
10. Click **Refresh tabs** and choose a sheet tab.
11. Save settings.

When publishing, Loupe creates a child folder under the selected Drive folder and uploads the full local export.

Loupe accepts either raw IDs or full Google URLs:

```text
https://drive.google.com/drive/folders/<folder-id>
https://docs.google.com/spreadsheets/d/<spreadsheet-id>/edit
```

The UI normalizes pasted URLs to IDs before saving or calling Google APIs.

If the Drive folder field already contains a folder URL/ID, **Refresh folders** lists child folders inside that selected folder. If the field is empty, it lists visible folders across My Drive and Shared Drives.

## 6. Google Sheet Output

If Sheet update is enabled, Loupe writes one marker per row.

The first row must be Loupe's header row. If the selected sheet tab is empty, Loupe writes the header. If the tab already has data but no Loupe header, Loupe inserts a new first row and writes the header there.

Rows are written with `spreadsheets.batchUpdate.updateCells` from column A. Loupe does not use `values.append`, because Sheets table detection can offset rows when there are empty columns.

The **Mention Emails** column is written as Google Sheets people smart chips. Loupe uses the mention identity `googleEmail` first, then `email`. If no email mapping exists, Loupe publishes the row and records a warning.

## 7. Mention Identity Mapping

Google Sheets people chips require email addresses.

In **Publish** > **Mention identities**, maintain:

- **Display name**
- **Email**
- **Google email**
- optional Slack / GitLab ids

For Google Sheet chips, Loupe resolves each selected marker mention in this order:

1. `googleEmail`
2. `email`

Use `googleEmail` when the person's Google account email differs from their Slack/GitLab/team email.

## Troubleshooting

### `client_secret is missing`

The packaged app was built without `LOUPE_GOOGLE_OAUTH_CLIENT_SECRET`.

Check:

- local build has `apps/desktop/.env.local`
- CI has `LOUPE_GOOGLE_OAUTH_CLIENT_SECRET` configured as a secret
- the app was rebuilt after setting the env variable

### OAuth browser says access blocked

Common causes:

- OAuth consent screen is still in testing and the account is not listed as a test user.
- The Google Cloud project belongs to another Workspace and the app is **Internal**.
- Required Drive/Sheets APIs are not enabled.

### `Refresh folders` or `Refresh spreadsheets` returns permission errors

Reconnect Google after changing scopes. Old refresh tokens may not include new scopes.

Loupe needs:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/spreadsheets
```

### Sheet rows appear shifted

Restart Loupe after rebuilding. Older builds used `values.append`, which could let Google Sheets offset the second insert.

Current builds use `updateCells` with explicit `rowIndex` and `columnIndex: 0`.

### Mention chips appear as plain `@`

Check that the mention identity has `googleEmail` or `email`.

Also make sure the target spreadsheet supports smart chips and the account has permission to write to the sheet.
