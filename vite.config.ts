import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// The UI is served by Vite in development, and /api and /media requests are proxied to the local Fastify server.
const API = `http://127.0.0.1:${process.env.RASD_PORT ?? 4310}`;

export default defineConfig({
  plugins: [react()],
  build: {outDir: 'dist/web', emptyOutDir: true},
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {target: API, changeOrigin: false},
      '/media': {target: API, changeOrigin: false},
    },
  },
});
