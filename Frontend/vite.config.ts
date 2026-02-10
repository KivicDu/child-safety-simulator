import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['xlsx', 'file-saver'],
  },
  server: {
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/simulation': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
