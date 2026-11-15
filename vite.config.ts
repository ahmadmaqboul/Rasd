import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// الواجهة تُخدَّم من Vite في التطوير، وطلبات /api و /media تُحوَّل إلى خادم Fastify المحلي.
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
