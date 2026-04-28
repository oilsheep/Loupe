import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['electron/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.{ts,tsx}'],
  },
})
