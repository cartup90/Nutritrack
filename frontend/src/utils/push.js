/**
 * Suscripción a notificaciones push desde el navegador.
 *
 * Todo esto es OPCIONAL: solo se llama si el usuario decide activar los
 * recordatorios. El permiso se pide en ese momento, nunca al abrir la app.
 */

/**
 * Convierte la clave VAPID (base64url) al formato que espera el navegador.
 *
 * `applicationServerKey` no acepta el string tal cual: hay que pasarlo a
 * bytes. Es el paso que más se olvida y el que produce el error
 * "InvalidCharacterError" al suscribirse.
 */
const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);

  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

/** ¿Este navegador puede recibir notificaciones push? */
export const pushSoportado = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** Suscripción activa de este dispositivo, si la hay. */
export const suscripcionActual = async () => {
  if (!pushSoportado()) return null;

  try {
    const registro = await navigator.serviceWorker.ready;
    return await registro.pushManager.getSubscription();
  } catch {
    return null;
  }
};

/**
 * Pide permiso y suscribe este dispositivo.
 *
 * Devuelve siempre un objeto con `ok` y, si falla, un `mensaje` ya redactado
 * para mostrar al usuario. Ninguna excepción sale de aquí: quien llama no tiene
 * que envolverlo en try/catch para algo tan previsible como un permiso denegado.
 */
export const suscribirAPush = async (publicKey) => {
  if (!pushSoportado()) {
    return {
      ok: false,
      motivo: 'no-soportado',
      mensaje:
        'Este navegador no admite notificaciones. En iPhone necesitas iOS 16.4 o superior y añadir la app a la pantalla de inicio.',
    };
  }

  if (!publicKey) {
    return {
      ok: false,
      motivo: 'sin-clave',
      mensaje: 'El servidor no tiene configuradas las notificaciones.',
    };
  }

  try {
    const permiso = await Notification.requestPermission();

    if (permiso !== 'granted') {
      return {
        ok: false,
        motivo: 'permiso-denegado',
        mensaje:
          'No se concedió el permiso. Puedes activarlo desde los ajustes del navegador.',
      };
    }

    const registro = await navigator.serviceWorker.ready;

    // Si ya estaba suscrito se reutiliza: volver a suscribirse lanzaría
    // "A subscription already exists" en algunos navegadores.
    const existente = await registro.pushManager.getSubscription();
    if (existente) return { ok: true, subscription: existente };

    const subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    return { ok: true, subscription };
  } catch (error) {
    return {
      ok: false,
      motivo: 'error',
      mensaje: `No se pudo activar: ${error?.message || 'error desconocido'}`,
    };
  }
};

/**
 * Cancela la suscripción de este dispositivo.
 * Devuelve el endpoint que tenía, para avisar al servidor de que lo borre.
 */
export const desuscribirDePush = async () => {
  if (!pushSoportado()) return null;

  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) return null;

    const { endpoint } = suscripcion;
    await suscripcion.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
};
