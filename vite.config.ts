import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // data/ — профиль Chromium из десктопной сборки: следить за ним нельзя,
    // файлы заняты процессом, и наблюдатель сыплет EBUSY.
    watch: { ignored: ['**/data/**', '**/release/**', '**/dist/**'] },
  },
})
