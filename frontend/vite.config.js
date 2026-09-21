import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Hosts permitidos por Vite.
 *
 * Vite bloquea peticiones cuyo cabecera Host no reconoce. Al exponer el
 * servidor por un túnel (cloudflared, ngrok…) hay que autorizar ese dominio,
 * o la respuesta es "Blocked request. This host is not allowed."
 */
const allowedHosts = ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt', 'localhost'];

const apiProxy = {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
  // Las fotos de las comidas las sirve el backend
  '/uploads': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts,
    proxy: apiProxy,
  },
  // `npm run preview` sirve el build de producción: es lo que se usa para
  // probar la PWA de verdad (service worker, manifest, instalación).
  preview: {
    port: 4173,
    host: true,
    allowedHosts,
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['axios', 'date-fns'],
          charts: ['recharts'],
        },
      },
    },
  },
});
