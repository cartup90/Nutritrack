import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

/**
 * Identificador de este build.
 *
 * Se usa para dos cosas:
 *   · Sellar el service worker (los nombres de caché derivan de él).
 *   · Mostrarlo en el panel de diagnóstico, para poder comprobar de un vistazo
 *     qué versión está ejecutando realmente el dispositivo del usuario.
 */
const BUILD_ID = Date.now().toString(36);

/**
 * Sella el service worker con la versión del build.
 *
 * `public/sw.js` no pasa por el pipeline de Vite (se copia tal cual), así que
 * el marcador `__BUILD_VERSION__` se sustituye aquí, al terminar el build.
 *
 * Por qué importa: los nombres de las cachés derivan de esa versión. Si no
 * cambiara nunca, `activate` no borraría las cachés antiguas y los assets de
 * cada despliegue se irían acumulando en el dispositivo del usuario.
 */
const sellarServiceWorker = () => ({
  name: 'sellar-service-worker',
  apply: 'build',
  closeBundle() {
    const ruta = resolve(__dirname, 'dist', 'sw.js');
    if (!fs.existsSync(ruta)) return;

    const contenido = fs
      .readFileSync(ruta, 'utf8')
      .replace(/__BUILD_VERSION__/g, BUILD_ID);

    fs.writeFileSync(ruta, contenido);
    console.log(`  sw.js sellado con la versión ${BUILD_ID}`);
  },
});

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
  plugins: [react(), sellarServiceWorker()],

  // Visible desde el código como __BUILD_ID__ (lo muestra el diagnóstico)
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
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
