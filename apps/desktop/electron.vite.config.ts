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

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __LOUPE_SLACK_OAUTH_CLIENT_ID__: JSON.stringify(env.LOUPE_SLACK_OAUTH_CLIENT_ID ?? process.env.LOUPE_SLACK_OAUTH_CLIENT_ID ?? ''),
        __LOUPE_SLACK_OAUTH_CLIENT_SECRET__: JSON.stringify(env.LOUPE_SLACK_OAUTH_CLIENT_SECRET ?? process.env.LOUPE_SLACK_OAUTH_CLIENT_SECRET ?? ''),
        __LOUPE_GOOGLE_OAUTH_CLIENT_ID__: JSON.stringify(env.LOUPE_GOOGLE_OAUTH_CLIENT_ID ?? process.env.LOUPE_GOOGLE_OAUTH_CLIENT_ID ?? ''),
        __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__: JSON.stringify(env.LOUPE_GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.LOUPE_GOOGLE_OAUTH_CLIENT_SECRET ?? ''),
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
