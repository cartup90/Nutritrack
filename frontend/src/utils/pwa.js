/**
 * Registro del service worker y gestión de actualizaciones.
 *
 * Estrategia: el service worker nuevo toma el control en cuanto está listo
 * (`skipWaiting`), lo que dispara `controllerchange`. Aquí se recarga la
 * página para ejecutar el código nuevo.
 *
 * Se descartó la alternativa de dejar el service worker esperando a que el
 * usuario acepte: una app instalada antes de que existiera ese aviso no sabe
 * avisar, y el service worker se quedaba esperando indefinidamente. El usuario
 * quedaba anclado en una versión antigua sin forma de salir.
 */

let registro = null;
let alAvisar = null;
let recargando = false;

/**
 * ¿Está el usuario en mitad de algo que no conviene interrumpir?
 * Registrar una comida conlleva una foto y un análisis de la IA que se
 * perderían con una recarga.
 */
const enMedioDeUnaCaptura = () =>
  window.location.pathname.startsWith('/food');

/**
 * Registra el service worker.
 * @param {{onUpdateAvailable?: Function}} opciones
 */
export const registrarServiceWorker = ({ onUpdateAvailable } = {}) => {
  if (!('serviceWorker' in navigator)) return;
  alAvisar = onUpdateAvailable || null;

  // La recarga se dispara cuando el service worker nuevo ya controla la página.
  // Recargar antes volvería a cargar con el service worker antiguo.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;

    if (enMedioDeUnaCaptura()) {
      // No le tiramos la foto: se le avisa y decide cuándo
      alAvisar?.();
      return;
    }

    recargando = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registro = reg;

      // Comprobación inmediata por si hay una versión más reciente
      reg.update?.().catch(() => {});

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;

        nuevo.addEventListener('statechange', () => {
          // `controller` distingue una actualización de la primera instalación
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            alAvisar?.();
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

/**
 * Aplica la actualización pendiente.
 *
 * Se usa desde el aviso, cuando el usuario está en la pantalla de captura y
 * prefiere no perder lo que estaba haciendo. Fuera de ese caso la recarga ya
 * es automática.
 */
export const aplicarActualizacion = () => {
  recargando = true;
  window.location.reload();
};
