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
      const match = line.match(/^\s*(LOUPE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/)
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
  const isGitlabUpdate = Boolean(updateUser && updateToken)
  const gitlabHost = env.CI_SERVER_HOST || 'gitlab.rayark.com'
  const gitlabProjectId = env.CI_PROJECT_ID || ''
  const gitlabProjectPath = env.CI_PROJECT_PATH || 'tech-center/toolbox/loupe-qa-recorder'
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
      build: { outDir: 'out/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
      resolve: { alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') } },
    },
  }
})
