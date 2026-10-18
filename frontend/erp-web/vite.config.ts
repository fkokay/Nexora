import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules[\\/]/, minSize: 30_000, maxSize: 240_000 }],
        },
      },
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5080', '/health': 'http://localhost:5080', '/studio': 'http://localhost:5081' } },
})
