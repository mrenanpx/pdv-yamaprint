import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Yama Print PDV',
        short_name: 'YamaPDV',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
  {
    src: '/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any maskable'
  },
  {
    src: '/icon-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any maskable'
  }
]
      }
    }) as any
  ]
});