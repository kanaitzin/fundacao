import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Offline-first (§17): a casca do app é servida do cache; dados de API
      // terão fila local criptografada (IndexedDB) nas próximas fases.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Rede Acolher',
        short_name: 'Rede Acolher',
        description: 'Gestão do acolhimento institucional — Fundação O Pão dos Pobres',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        background_color: '#F4F6F9',
        theme_color: '#003262',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
