import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Will Assistant',
        short_name: 'Will',
        description: 'Assistente vocale intelligente con design glassmorphism',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          {
            src: 'will.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'will.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
