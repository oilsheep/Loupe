# Environment Variables & Secrets — Developer Reference

Loupe injects credentials and configuration at **build time** via environment
variables. The values land inside the binary as compile-time constants
(see [`apps/desktop/electron.vite.config.ts`](../apps/desktop/electron.vite.config.ts)
`define` block). End users never see these — they're only consumed by
developers building Loupe and by the CI pipelines that produce releases.

## Where to set them

| Surface | Purpose | How to edit |
|---|---|---|
| `apps/desktop/.env.local` | Local `pnpm desktop:dev` builds | Plain text, gitignored. Copy `apps/desktop/.env.example` and fill in values. |
| GitLab CI/CD variables (`tech-center/toolbox/loupe-qa-recorder` → Settings → CI/CD → Variables) | Rayark internal release builds via `.gitlab-ci.yml` (test tags + protected refs) | `glab api ... -X POST projects/<id>/variables` or the GitLab web UI. Set `protected=true`; `masked` only when the value matches GitLab's masking regex (no `{}`, `[]`, `:` etc.). |
| GitHub Actions secrets (`oilsheep/Loupe` → Settings → Secrets) | Public OSS release builds via `.github/workflows/desktop-build.yml` (tag-triggered packaging on macOS + Windows runners) | Repo admin only. Web UI. |

The CI pipelines and the local dev env keep separate credential sets in sync;
when you add or rotate a value, **update all three places**. Otherwise some
builds will ship with stale or missing credentials and silently fall back to
the "user must paste their own clientId" path.

## Variables by purpose

### OAuth credentials (baked into the binary)

These are the public OAuth client identifiers (and where required, secrets) for
Loupe's pre-registered third-party apps. The user gets a one-click
"Connect" experience instead of having to register their own apps.

| Variable | Used by | Notes |
|---|---|---|
| `LOUPE_SLACK_OAUTH_CLIENT_ID` | Slack publish OAuth | From Rayark's Slack app config. Public identifier. |
| `LOUPE_SLACK_OAUTH_CLIENT_SECRET` | Slack publish OAuth | From Rayark's Slack app config. Slack requires the secret on the token-exchange endpoint even with PKCE. |
| `LOUPE_GOOGLE_OAUTH_CLIENT_ID` | Google Drive + Sheets publish | From Google Cloud Console. **Must be a Desktop OAuth client** (Web client is rejected). |
| `LOUPE_GOOGLE_OAUTH_CLIENT_SECRET` | Google Drive + Sheets publish | From Google Cloud Console. Google's loopback Desktop OAuth requires the secret in the token exchange body even with PKCE — Google's docs explicitly allow embedding it in the binary. |
| `LOUPE_GITLAB_OAUTH_INSTANCES` | GitLab publish OAuth (per-instance) | JSON array: `[{"url":"https://gitlab.example.com","clientId":"<application-id>"}]`. Each entry is an OAuth Application registered on that GitLab instance with `Confidential` UNCHECKED (PKCE-only public client; no secret bundled). See [`docs/gitlab-setup.md`](gitlab-setup.md) for the registration form. |

If any of these are unset:
- **Slack / Google missing**: Connect button on the Preferences UI fails because the renderer needs a clientId to start the OAuth dance. The "verify" CI step in `desktop-build.yml` errors loudly when the Google secrets are missing.
- **GitLab missing**: the Preferences UI falls back to the manual `oauthClientId` + `oauthClientSecret` text inputs (current upstream OSS behavior). The "verify" CI step is **lenient** here — warns and continues — because the user does not currently have GitHub-secrets admin access for OSS builds.

### Update-channel credentials (Rayark internal)

When set, packaged builds check Rayark's GitLab Generic Package Registry for
updates instead of GitHub Releases. See [`docs/gitlab-setup.md`](gitlab-setup.md)
and the `update-` keys in `electron.vite.config.ts`.

| Variable | Used by | Notes |
|---|---|---|
| `LOUPE_INTERNAL_UPDATE_USER` | electron-updater HTTP Basic auth username | Typically the GitLab deploy-token username for the Loupe project's Generic Package Registry. |
| `LOUPE_INTERNAL_UPDATE_TOKEN` | electron-updater HTTP Basic auth token | The deploy-token's secret value. The presence of this var is the signal that this build uses the GitLab update channel — when both `LOUPE_INTERNAL_UPDATE_*` are empty, the build defaults to the GitHub Release update channel. |

If unset on a GitHub OSS build: behavior is correct — the build talks to GitHub
Releases for updates.

### macOS code signing & notarization

Required for shipping a Mac dmg that opens without Gatekeeper warnings. Used
only by `desktop-build.yml` on macOS runners; not needed for local dev or
Linux/Windows CI.

| Variable | Used by | Notes |
|---|---|---|
| `CSC_LINK` | `electron-builder` | Path to (or base64 of) a `.p12` Developer ID Application certificate. On GitHub Actions: stored as a base64-encoded `.p12` in a secret. |
| `CSC_KEY_PASSWORD` | `electron-builder` | Password protecting the `.p12`. |
| `APPLE_API_KEY_BASE64` | `notarytool` (GitHub) | Base64 of the App Store Connect API key (`.p8` file). The workflow decodes this into `${RUNNER_TEMP}/AuthKey_<id>.p8` and exports the path as `APPLE_API_KEY` for `notarytool` to read. (GitLab CI uses `APPLE_API_KEY` directly as the key path; the storage detail differs but the resolved env var name is the same at notarize time.) |
| `APPLE_API_KEY_ID` | `notarytool` | The 10-character Key ID from App Store Connect. |
| `APPLE_API_ISSUER` | `notarytool` | The Issuer ID UUID from App Store Connect. |
| `APPLE_TEAM_ID` | `notarytool` + signing identity selection | Rayark's Apple Developer Team ID. |
| `APPLE_ID` | `notarytool` (alternative auth path) | Apple Developer account email. Used together with an app-specific password if API-key auth is unavailable. |
| `APPLE_APP_SPECIFIC_PASSWORD` | `notarytool` | App-specific password for `APPLE_ID`. Generated at appleid.apple.com under Sign-In and Security → App-Specific Passwords. |

The workflow uses **two boolean signals** that are not user-set secrets but
computed from the trigger context:

| Signal | How computed | Effect |
|---|---|---|
| `LOUPE_SIGN_MAC` | `1` on tag pushes and `workflow_dispatch`, `0` on PR builds | Tells `electron-builder` whether to attempt code signing. PR runs from forks lack secrets, so signing is skipped. |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `'true'` on tag pushes / dispatch, `'false'` on PRs | Lets `electron-builder` look up the right signing identity from the imported keychain. Disabled on PRs so the build doesn't fail when no identity is present. |

These don't need to be set anywhere — they're hard-coded in
`.github/workflows/desktop-build.yml` based on `${{ github.event_name }}` and
`${{ github.ref }}`.

## How the variables flow

```
.env.local  / GitLab CI vars  / GitHub secrets
     │
     ▼
electron-vite (electron.vite.config.ts `define` block)
     │
     ▼
__LOUPE_SLACK_OAUTH_CLIENT_ID__ etc. (compile-time constants in the bundle)
     │
     ▼
Runtime modules read the constant via build-env.d.ts declarations:
  - apps/desktop/electron/slack-oauth-config.ts
  - apps/desktop/electron/google-oauth-config.ts
  - apps/desktop/electron/gitlab-oauth-config.ts
```

Code signing + notarization is different — those vars are read by
`electron-builder` and `notarytool` directly at packaging time, not baked into
the bundle.

## Adding a new build-time variable

1. Add the variable to `apps/desktop/.env.example` with a brief comment showing
   the format / where to obtain the value.
2. Add the `define` entry in `apps/desktop/electron.vite.config.ts`:
   ```ts
   __LOUPE_NEW_VAR__: JSON.stringify(env.LOUPE_NEW_VAR ?? process.env.LOUPE_NEW_VAR ?? ''),
   ```
3. Add the type declaration in `apps/desktop/electron/build-env.d.ts`:
   ```ts
   declare const __LOUPE_NEW_VAR__: string
   ```
4. In `.github/workflows/desktop-build.yml`, add the env passthrough at job
   level: `LOUPE_NEW_VAR: ${{ secrets.LOUPE_NEW_VAR }}`.
5. Set the value on GitLab CI (web UI or `glab api`) — typically
   `protected=true, masked=false` (JSON-shaped values can't satisfy GitLab's
   masking regex).
6. Set the value on GitHub Actions secrets (web UI; admin permission required).
7. Update **this doc** with what the new variable is for and where to get its
   value.

## Adding a new third-party app integration

When integrating a new external service that needs build-time OAuth credentials,
follow the same pattern Slack / Google / GitLab use:

- **PKCE-only public client** if the service supports it (GitLab does — see
  `LOUPE_GITLAB_OAUTH_INSTANCES` for the JSON-array shape and
  [`docs/gitlab-setup.md`](gitlab-setup.md) for OAuth Application registration).
  No secret to bundle.
- **PKCE + secret** if the service requires it (Slack and Google both do, even
  though both technically support PKCE — they don't accept PKCE alone). The
  secret IS bundled into the binary; per Slack and Google docs, this is allowed
  for desktop apps.

The key invariant: **never include a secret that grants more than the OAuth
flow's scopes**. A bundled OAuth client_secret is fine because the worst an
attacker who extracts it can do is spin up their own OAuth flow with the same
clientId — the user must still authorize on the service's domain.
