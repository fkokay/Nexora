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
              {
                name: 'monaco-editor',
                test: /node_modules[\\/]monaco-editor[\\/]/,
                minSize: 10_000,
                maxSize: 350_000,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5175,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
        '/studio': { target: studioTarget, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0', port: 4174 },
  }
})
