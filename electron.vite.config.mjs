import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'production', process.cwd(), '')

  return {
    main: {
      define: {
        'process.env.EBAY_CLIENT_ID': JSON.stringify(env.EBAY_CLIENT_ID || ''),
        'process.env.EBAY_CLIENT_SECRET': JSON.stringify(env.EBAY_CLIENT_SECRET || ''),
        'process.env.EBAY_ENV': JSON.stringify(env.EBAY_ENV || 'sandbox'),
      }
    },
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@': resolve('src/renderer/src')
        }
      },
      plugins: [vue()]
    }
  }
})
