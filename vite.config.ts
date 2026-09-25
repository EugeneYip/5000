import { defineConfig } from 'vite';
import path from 'node:path';

// Base path must match the GitHub Pages project sub-path (github.io/5000/).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/5000/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, host: '127.0.0.1' },
}));
