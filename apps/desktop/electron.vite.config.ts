import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readLoupeEnv(mode: string): Record<string, string> {
  const names = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const env: Record<string, string> = {}
  for (const name of names) {
    const path = resolve(__dirname, name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      // LOUPE_* are the project's own build-time defines; CI_* mirror the
      // GitLab CI predefined variables that this config reads so a developer
      // running `pnpm desktop:dev` locally can still aim the in-app update
      // check at the right GitLab project without exporting them in the shell.
      const match = line.match(/^\s*((?:LOUPE_|CI_)[A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.replace(/^(['"])(.*)\1$/, '$2')
      env[key] = value
    }
  }
  return env
}

export default defineConfig(({ mode }) => {
  const env = { ...readLoupeEnv(mode), ...process.env }

  // Update-channel selection: when LOUPE_INTERNAL_UPDATE_TOKEN is set (GitLab
  // CI), bake GitLab API endpoints into the binary so the in-app
  // "Check for Updates" custom checker queries Rayark's internal channel
  // instead of upstream GitHub Releases.
  const updateUser = env.LOUPE_INTERNAL_UPDATE_USER ?? ''
  const updateToken = env.LOUPE_INTERNAL_UPDATE_TOKEN ?? ''
  const gitlabHost = env.CI_SERVER_HOST || 'gitlab.rayark.com'
  const gitlabProjectId = env.CI_PROJECT_ID || ''
  const gitlabProjectPath = env.CI_PROJECT_PATH || 'engine/toolbox/loupe-qa-recorder'
  // All three of user/token/project-id are required to build a valid Generic
  // Package Registry URL. If any one is missing the in-app updater falls back
  // to upstream GitHub Releases instead of generating a malformed 404 URL.
  const isGitlabUpdate = Boolean(updateUser && updateToken && gitlabProjectId)
  const updateProvider = isGitlabUpdate ? 'gitlab' : 'github'
  const updateApiUrl = isGitlabUpdate
    ? `https://${updateUser}:${updateToken}@${gitlabHost}/api/v4/projects/${gitlabProjectId}/packages/generic/loupe/latest/latest-mac.yml`
    : 'https://api.github.com/repos/oilsheep/Loupe/releases/latest'
  const updatePageTemplate = isGitlabUpdate
    ? `https://${gitlabHost}/${gitlabProjectPath}/-/releases/v{version}`
    : 'https://github.com/oilsheep/Loupe/releases/latest'

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __LOUPE_SLACK_OAUTH_CLIENT_ID__: JSON.stringify(env.LOUPE_SLACK_OAUTH_CLIENT_ID ?? process.env.LOUPE_SLACK_OAUTH_CLIENT_ID ?? ''),
        __LOUPE_SLACK_OAUTH_CLIENT_SECRET__: JSON.stringify(env.LOUPE_SLACK_OAUTH_CLIENT_SECRET ?? process.env.LOUPE_SLACK_OAUTH_CLIENT_SECRET ?? ''),
        __LOUPE_GOOGLE_OAUTH_CLIENT_ID__: JSON.stringify(env.LOUPE_GOOGLE_OAUTH_CLIENT_ID ?? process.env.LOUPE_GOOGLE_OAUTH_CLIENT_ID ?? ''),
        __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__: JSON.stringify(env.LOUPE_GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.LOUPE_GOOGLE_OAUTH_CLIENT_SECRET ?? ''),
        __LOUPE_GITLAB_OAUTH_INSTANCES__: JSON.stringify(env.LOUPE_GITLAB_OAUTH_INSTANCES ?? process.env.LOUPE_GITLAB_OAUTH_INSTANCES ?? ''),
        __LOUPE_UPDATE_PROVIDER__: JSON.stringify(updateProvider),
        __LOUPE_UPDATE_API_URL__: JSON.stringify(updateApiUrl),
        __LOUPE_UPDATE_PAGE_URL_TEMPLATE__: JSON.stringify(updatePageTemplate),
      },
      build: {
        outDir: 'out/main',
        rollupOptions: {
          input: resolve(__dirname, 'electron/main.ts'),
          output: { entryFileNames: 'index.js' },
        },
      },
      resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        outDir: 'out/preload',
        rollupOptions: {
          input: resolve(__dirname, 'electron/preload.ts'),
          output: { entryFileNames: 'index.js' },
        },
      },
      resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
    },
    renderer: {
      plugins: [react()],
      root: '.',
      // Build-time channel label exposed to the renderer so a header badge
      // can mark a downstream/internal build distinctly from upstream — even
      // when the version string is identical. The label string itself is
      // supplied externally via the LOUPE_INTERNAL_BRAND env var (CI variable)
      // so this open-source config does not bake any one organization's name
      // into the codebase; if the var is unset the badge is hidden.
      define: {
        __LOUPE_BUILD_CHANNEL_LABEL__: JSON.stringify(env.LOUPE_INTERNAL_BRAND ?? ''),
      },
      build: { outDir: 'out/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
      resolve: { alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') } },
    },
  }
})
