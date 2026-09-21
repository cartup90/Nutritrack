import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useUIStore } from './store/uiStore';
import './index.css';

// ---------------------------------------------------------------------------
// PWA: capturar beforeinstallprompt para mostrar nuestro propio botón "Instalar"
// ---------------------------------------------------------------------------
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  useUIStore.getState().setDeferredPrompt(event);
});

window.addEventListener('appinstalled', () => {
  useUIStore.getState().setInstalled(true);
  useUIStore.getState().dismissInstallBanner();
});

// Detección de modo standalone (app ya instalada)
if (
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
) {
  useUIStore.getState().setInstalled(true);
}

// Estado de red online/offline
window.addEventListener('online', () => useUIStore.getState().setOnline(true));
window.addEventListener('offline', () => useUIStore.getState().setOnline(false));

// ---------------------------------------------------------------------------
// PWA: registrar service worker (solo en producción o si existe /sw.js)
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registrado:', registration.scope);
      })
      .catch((error) => {
        console.warn('⚠️ Error registrando Service Worker:', error.message);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
