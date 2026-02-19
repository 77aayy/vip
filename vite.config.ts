import path from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version?: string }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg?.version ?? '0.0.1') },
  plugins: [
    react(),
    ...(process.env.ANALYZE ? [visualizer({ open: false, gzipSize: true })] : []),
  ],
  server: { port: 5174 },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: { VITE_ADMIN_CODE: process.env.VITE_ADMIN_CODE || 'test-admin-code' },
  },
})
