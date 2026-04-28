import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
})
