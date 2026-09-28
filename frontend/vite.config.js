import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

/**
 * Identificador de este build.
 *
 * Se usa para sellar el service worker: los nombres de las cachés derivan de
 * él, así que al cambiar el build se descartan las cachés antiguas.
 */
const BUILD_ID = Date.now().toString(36);

/**
 * Versión del producto, leída de package.json para tener una única fuente.
 * Se inyecta en el bundle como __APP_VERSION__ y se muestra en el Perfil.
 */
const APP_VERSION = JSON.parse(
  fs.readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version;

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
    const ruta = resolve(__dirname, 'dist', 'app', 'sw.js');
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
  // La app vive en /app; la raíz del dominio la ocupa la landing.
  // Con `base`, Vite reescribe a /app/... todas las rutas de assets y del HTML.
  base: '/app/',

  plugins: [react(), sellarServiceWorker()],

  // Visibles desde el código: los inyecta Vite en tiempo de build
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
    // La app se compila dentro de dist/app, de modo que nginx la sirve tal cual
    // bajo /app (nginx y Caddy usan /usr/share/nginx/html como raíz).
    outDir: 'dist/app',
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
