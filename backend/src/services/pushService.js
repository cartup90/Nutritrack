/**
 * Notificaciones Web Push.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HACE FALTA UN SERVIDOR
 * ---------------------------------------------------------------------------
 * Una PWA no puede programar avisos por sí sola: el service worker no corre en
 * segundo plano de forma fiable. Para avisar con la app cerrada, el servidor
 * tiene que empujar el mensaje. Eso es Web Push, y necesita claves VAPID.
 *
 * Si no hay claves configuradas, todo esto se desactiva en silencio: la app
 * sigue funcionando y los recordatorios simplemente no se ofrecen. Así el
 * desarrollo local no depende de tenerlas.
 */
import webpush from 'web-push';
import {
  getSubscriptionsByUser,
  deleteSubscription,
  markUsed,
} from '../models/PushSubscription.js';

let listo = false;

/** Configura las claves VAPID una sola vez. Devuelve si el push está operativo. */
const configurar = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) return false;

  if (!listo) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:noreply@nutritrack.local',
      publicKey,
      privateKey
    );
    listo = true;
  }

  return true;
};

/** ¿Está el push configurado en este servidor? */
export const pushDisponible = () => configurar();

/** Clave pública que el navegador necesita para suscribirse. */
export const getPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

/**
 * Envía una notificación a todos los dispositivos de un usuario.
 *
 * Los envíos son independientes: si a un dispositivo le va mal, los demás
 * reciben igual. Es importante porque un endpoint caducado (app desinstalada,
 * datos borrados) no debe impedir que le llegue al resto.
 *
 * @returns {Promise<{sent: number, removed: number, failed: number}>}
 */
export const sendToUser = async (userId, payload) => {
  if (!configurar()) return { sent: 0, removed: 0, failed: 0 };

  const suscripciones = await getSubscriptionsByUser(userId);
  const cuerpo = JSON.stringify(payload);

  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    suscripciones.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(subscription, cuerpo);
        sent += 1;
        await markUsed(s.id);
      } catch (error) {
        const status = error?.statusCode;

        // 404 y 410 significan "esta suscripción ya no existe". Se borra para
        // no volver a intentarlo en cada recordatorio durante meses.
        if (status === 404 || status === 410) {
          await deleteSubscription(s.endpoint, userId);
          removed += 1;
        } else {
          failed += 1;
          console.error(
            `[push] fallo al enviar (${status || 'sin código'}):`,
            error?.body || error?.message
          );
        }
      }
    })
  );

  return { sent, removed, failed };
};

/**
 * Comprueba que una suscripción sea de un dispositivo real enviando un mensaje
 * de prueba silencioso.
 *
 * Se usa desde el endpoint de prueba para dar feedback honesto: si el usuario
 * activó los avisos pero su navegador ya no tiene la suscripción viva, es mejor
 * decírselo que dejarlo esperando recordatorios que nunca llegarán.
 */
export const enviarPrueba = async (userId) =>
  sendToUser(userId, {
    title: 'Notificaciones activadas',
    body: 'Así te avisaremos cuando toque beber agua.',
    tag: 'nutritrack-prueba',
    url: '/',
  });
