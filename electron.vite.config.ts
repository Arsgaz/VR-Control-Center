import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    resolve: {
      alias: sharedAlias
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
