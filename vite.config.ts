import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], testTimeout: 20_000 },
})
