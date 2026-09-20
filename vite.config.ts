import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages のプロジェクトサイトに置く場合のみ BASE_PATH=/<repo>/ を指定する。
// Cloudflare Pages / 独自ドメイン / ルート配信ならそのままで良い。
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'テスト対策 一問一答',
        short_name: '一問一答',
        description: '画像から4択問題を自動作成して即時採点する学習アプリ',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // OCR のコア(wasm)と言語データは巨大なので precache せず、
        // 初回利用時にダウンロードして永続キャッシュする。
        globIgnores: ['**/tesseract/**', '**/tessdata/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // BASE_PATH 配下に置かれることがあるので先頭は固定しない
        navigateFallbackDenylist: [/\/tessdata\//, /\/tesseract\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/tessdata/') || url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
