import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.NEXORA_API_PROXY_TARGET || 'http://localhost:5080'
  const studioTarget = env.NEXORA_STUDIO_PROXY_TARGET || 'http://localhost:5081'

  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // Keep SheetJS behind the existing dynamic imports in the grid and
              // import dialog. Matching it first prevents the generic vendor
              // group from pulling the 490 KB parser into the initial app chunk.
              { name: 'spreadsheet', test: /node_modules[\\/]xlsx[\\/]/ },
              { name: 'vendor', test: /node_modules[\\/]/, minSize: 30_000, maxSize: 240_000 },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
        '/studio': { target: studioTarget, changeOrigin: true },
      },
    },
  }
})
