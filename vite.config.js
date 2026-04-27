// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // The root is the "src" folder for Vite (our frontend dir)
  root: resolve(__dirname, 'frontend'),

  // Build config
  build: {
    // Output to dist/ at the project root
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,

    rollupOptions: {
      input: resolve(__dirname, 'frontend/index.html'),
    },

    // Target modern browsers for ES2020 features
    target: 'es2020',

    // Asset size warnings threshold
    chunkSizeWarningLimit: 1000,
  },

  // Dev server config
  server: {
    port: 5173,
    // Proxy API and WebSocket calls to the Express backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // Public dir — for assets served as-is (e.g., screenshots)
  publicDir: resolve(__dirname, 'frontend/assets'),
});
