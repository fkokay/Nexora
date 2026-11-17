import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Whole-screen tests (stock card, list screens) render large pages; under parallel load they exceed 5s.
    testTimeout: 15000,
  },
})
