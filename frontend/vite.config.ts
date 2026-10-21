import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon/logo.svg'],
      manifest: {
        name: 'Yama Print PDV',
        short_name: 'YamaPDV',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: '/icon/logo.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ]
      }
    }) as any
  ]
});