import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    entry: 'src/main/index.js'
  },
  preload: {
    entry: 'src/preload/index.js'
  },
  renderer: {
    root: 'src/renderer',
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: 'src/renderer/index.html'
      }
    }
  }
})