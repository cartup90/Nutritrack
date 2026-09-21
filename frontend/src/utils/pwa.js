/**
 * Registro del service worker y gestión de actualizaciones.
 *
 * El service worker nuevo se queda en estado `waiting` en lugar de activarse
 * solo. Así la app puede avisar ("hay una versión nueva") en vez de dejar al
 * usuario con el código viejo sin saber por qué.
 */

let registro = null;
let alDetectar = null;

/** ¿Hay ya una versión esperando para activarse? */
const hayEsperando = () =>
  Boolean(registro?.waiting) && Boolean(navigator.serviceWorker.controller);

/**
 * Registra el service worker.
 * @param {{onUpdateAvailable?: Function}} opciones
 */
export const registrarServiceWorker = ({ onUpdateAvailable } = {}) => {
  if (!('serviceWorker' in navigator)) return;
  alDetectar = onUpdateAvailable || null;

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registro = reg;

      // Puede haber una versión esperando desde una visita anterior
      if (hayEsperando()) alDetectar?.();

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;

        nuevo.addEventListener('statechange', () => {
          // `controller` distingue una actualización de la primera instalación
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            alDetectar?.();
          }
        });
      });
    })
    .catch((error) => {
      console.warn('[pwa] No se pudo registrar el service worker:', error.message);
    });

  // Al volver a la app se comprueba si hay versión nueva
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') buscarActualizacion();
  });
};

/** Fuerza una comprobación de actualización. */
export const buscarActualizacion = () => {
  registro?.update?.().catch(() => {
    /* sin conexión: se reintentará en la próxima visita */
  });
};

export { hayEsperando };

/**
 * Aplica la actualización pendiente y recarga.
 *
 * Se espera a `controllerchange` antes de recargar: si se recarga antes, la
 * página vuelve a cargarse con el service worker viejo y el usuario no ve
 * ningún cambio.
 */
export const aplicarActualizacion = () => {
  const esperando = registro?.waiting;

  if (!esperando) {
    window.location.reload();
    return;
  }

  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  esperando.postMessage('SKIP_WAITING');
};
