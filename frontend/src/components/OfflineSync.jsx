import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
/**
 * Sincronización de la cola offline.
 *
 * No dibuja nada: se monta una vez en `App` y se encarga de mandar las comidas
 * guardadas en el teléfono cuando hay señal.
 *
 * Dispara un intento en los momentos en los que tiene sentido:
 *   · al abrir la app,
 *   · al recuperar la conexión (`online`),
 *   · al volver a la app (cambio de pestaña, desbloquear el teléfono),
 *   · cada minuto mientras haya algo pendiente,
 *   · cuando el service worker avisa que sincronizó algo por su cuenta.
 *
 * Además, al encolar una comida se registra un Background Sync, así que en los
 * navegadores que lo soportan la sincronización ocurre incluso con la app
 * cerrada (`public/sw.js`).
 */
const OfflineSync = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cargarPendientes = useOfflineStore((s) => s.cargarPendientes);
  const sincronizar = useOfflineStore((s) => s.sincronizar);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  // Con sesión iniciada, lo primero es intentar mandar lo que quedó guardado.
  useEffect(() => {
    if (isAuthenticated) sincronizar();
  }, [isAuthenticated, sincronizar]);

  useEffect(() => {
    const alRecuperarSenal = () => sincronizar();

    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') sincronizar();
    };

    const alMensajeDelServiceWorker = (event) => {
      if (event.data?.type !== 'OFFLINE_SYNCED') return;

      // El service worker mandó comidas por su cuenta: se refresca la cola y se
      // avisa a las pantallas para que recarguen (el servidor ya las tiene).
      cargarPendientes();
      useOfflineStore.setState({ lastSyncAt: new Date().toISOString() });
    };

    window.addEventListener('online', alRecuperarSenal);
    document.addEventListener('visibilitychange', alVolverALaApp);
    navigator.serviceWorker?.addEventListener('message', alMensajeDelServiceWorker);

    const timer = window.setInterval(() => {
      if (navigator.onLine) sincronizar();
    }, 60000);

    return () => {
      window.removeEventListener('online', alRecuperarSenal);
      document.removeEventListener('visibilitychange', alVolverALaApp);
      navigator.serviceWorker?.removeEventListener('message', alMensajeDelServiceWorker);
      window.clearInterval(timer);
    };
  }, [sincronizar, cargarPendientes]);

  return null;
};

export default OfflineSync;
