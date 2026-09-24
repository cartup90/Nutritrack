/* ==========================================================================
   NutriTrack — Service Worker
   Estrategias:
     · App shell        → precache en install (carga rápida)
     · /assets/*        → cache-first (nombres con hash, inmutables)
     · navegación SPA   → network-first con fallback a /index.html
     · GET /api/food*   → network-first con fallback a caché (historial offline)
     · resto de /api/*  → solo red (nunca se cachean datos de autenticación)

   ACTUALIZACIONES
   La versión se sustituye en tiempo de build (ver vite.config.js). Al cambiar,
   los nombres de caché cambian, así que `activate` borra los antiguos y el
   almacenamiento del usuario no crece sin control.

   El service worker nuevo SÍ toma el control de inmediato (skipWaiting). Es
   deliberado: la alternativa —dejarlo esperando a que la app avise— tiene un
   agujero grave, porque una app instalada ANTES de que existiera ese aviso no
   sabe avisar y el service worker se queda esperando para siempre. Eso dejaba
   al usuario anclado en una versión antigua sin ninguna forma de salir.

   Al activarse, la app recibe `controllerchange` y se recarga sola para
   ejecutar el código nuevo. Solo se evita la recarga si el usuario está en la
   pantalla de captura, para no perderle una foto a medio analizar.
   ========================================================================== */

const VERSION = '__BUILD_VERSION__';
const SHELL_CACHE = `nutritrack-shell-${VERSION}`;
const ASSETS_CACHE = `nutritrack-assets-${VERSION}`;
const API_CACHE = `nutritrack-api-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-48x48.png',
];

// Rutas de API cuyo GET sí se cachea para consulta offline
const CACHEABLE_API = [/^\/api\/food(\/|$)/, /^\/api\/profile$/];

const isCacheableApi = (pathname) =>
  CACHEABLE_API.some((re) => re.test(pathname));

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // addAll falla completo si un recurso falla; usamos allSettled
        Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSETS_CACHE, API_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo gestionamos nuestro propio origen
  if (url.origin !== self.location.origin) return;

  // Navegación (documentos) → network-first con fallback al shell
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // Assets con hash de Vite → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE));
    return;
  }

  // Datos de comidas → network-first con fallback a caché (modo offline)
  if (isCacheableApi(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Otras rutas de API (login, registro, análisis) → siempre red
  if (url.pathname.startsWith('/api/')) return;

  // Fotos de comidas y estáticos → cache-first
  event.respondWith(cacheFirst(request, ASSETS_CACHE));
});

// ---------------------------------------------------------------------------
// Estrategias
// ---------------------------------------------------------------------------
async function networkFirstNavigate(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match('/index.html')) ||
      (await cache.match('/')) ||
      offlineResponse()
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    // No cacheamos respuestas de error ni redirecciones de auth
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({
        error: 'Sin conexión',
        offline: true,
        detail: 'Este dato no está disponible sin conexión.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
      '<body style="font-family:system-ui;padding:2rem;text-align:center;color:#374151">' +
      '<h1 style="font-size:1.25rem">Sin conexión</h1>' +
      '<p style="color:#6b7280;font-size:.875rem">Vuelve a intentarlo cuando recuperes la conexión.</p>' +
      '</body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ---------------------------------------------------------------------------
// Mensajes desde la app
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();

  if (event.data === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE);
  }

  // El panel de diagnóstico pide la versión para poder compararla con la del
  // build: si no coinciden, el dispositivo está sirviendo código cacheado.
  if (event.data === 'VERSION' && event.ports?.[0]) {
    event.ports[0].postMessage(VERSION);
  }
});

// ---------------------------------------------------------------------------
// Notificaciones push — recordatorios de agua (opcionales)
//
// El servidor empuja estos mensajes. Una PWA no puede programarlos por su
// cuenta: el service worker no corre en segundo plano de forma fiable, así que
// sin este manejador no habría avisos con la app cerrada.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let datos = {};

  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    // Si el payload no es JSON, mostramos lo que haya en texto plano antes que
    // dejar al usuario sin notificación.
    try {
      datos = { body: event.data?.text?.() || '' };
    } catch {
      datos = {};
    }
  }

  event.waitUntil(
    self.registration.showNotification(datos.title || 'NutriTrack', {
      body: datos.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/favicon-48x48.png',
      // Con `tag` fijo, un recordatorio nuevo reemplaza al anterior en vez de
      // apilarse en la bandeja de notificaciones.
      tag: datos.tag || 'nutritrack',
      renotify: true,
      vibrate: [80, 40, 80],
      data: { url: datos.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destino = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si la app ya está abierta, se trae al frente en lugar de abrir otra
      // pestaña: así no se acumulan instancias de la PWA.
      for (const cliente of clientes) {
        if (new URL(cliente.url).origin === self.location.origin) {
          await cliente.focus();
          return;
        }
      }

      await self.clients.openWindow(destino);
    })()
  );
});
