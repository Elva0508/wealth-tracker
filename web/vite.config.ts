import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const corePath = fileURLToPath(new URL('../supabase/functions/_shared/core/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    // 前端與 Edge Function 共用同一份計算模組
    alias: { '@core': corePath },
  },
  server: {
    // 允許讀取 web/ 以外的共用模組
    fs: { allow: ['..'] },
    // 讓手機透過 cloudflared 臨時通道連到本機測試
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '資產總覽',
        short_name: '資產總覽',
        description: '個人資產負債與淨資產追蹤',
        lang: 'zh-Hant',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F2EA',
        theme_color: '#F5F2EA',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 只快取 App 本身；資料一律即時向 Supabase 讀取
      },
    }),
  ],
});
