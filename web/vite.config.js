import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.OLHA_API || 'http://localhost:4000';

export default defineConfig({
  root: dir,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(dir, 'src') } },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT_WEB || 5173),
    allowedHosts: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/ws': { target: API, ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
