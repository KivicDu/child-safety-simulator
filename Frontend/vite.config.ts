import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Loại bỏ `force: true` (Nguyên nhân chính gây ra "Forced re-optimization of dependencies" mỗi lần start)
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'framer-motion',
      'xlsx',
      'file-saver'
    ],
  },
  server: {
    watch: {
      // Bỏ qua việc watch các thư mục không cần thiết để giảm tải CPU/IO trên Windows (đặc biệt khi có phần mềm diệt virus)
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/dist/**',
        '**/build_log.txt',
        '**/lint_errors.log',
      ],
      // Nếu watch thỉnh thoảng bị kẹt trên Windows, có thể thử bật usePolling (nhưng sẽ tốn CPU hơn, nên để mặc định là false trước để test I/O event).
      usePolling: false,
    },
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
  build: {
    // Giảm thời gian build, giúp Vite tối ưu chunk mapping
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
          vendor: ['react', 'react-dom', 'framer-motion'],
        },
      },
    },
  },
})
