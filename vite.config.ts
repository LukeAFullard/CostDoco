import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/costs/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      scope: base,
      workbox: {
        navigateFallback: `${base}index.html`,
      },
      manifest: {
        name: 'CostDoco',
        short_name: 'CostDoco',
        description: 'Privacy-first, 100% client-side receipt and expense tracking.',
        start_url: base,
        scope: base,
        background_color: '#EEF0EC',
        theme_color: '#EEF0EC',
        icons: [
          { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
