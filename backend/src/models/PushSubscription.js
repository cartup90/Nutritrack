/**
 * Suscripciones Web Push.
 *
 * Un usuario puede tener varias (móvil, escritorio). `endpoint` es UNIQUE: al
 * reinstalar la PWA el navegador entrega uno nuevo y, si el viejo se reutiliza,
 * se actualiza en vez de duplicarse.
 *
 * Si el mismo navegador inicia sesión con otra cuenta, la suscripción se
 * reasigna a esa cuenta. Es lo correcto: el dispositivo ahora pertenece a ese
 * usuario, y el anterior deja de recibir avisos ahí.
 */
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/** Guarda (o actualiza) la suscripción de un dispositivo. */
export const saveSubscription = async (userId, subscription, userAgent = null) => {
  const { endpoint, keys } = subscription || {};

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return null;
  }

  const result = await query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id    = EXCLUDED.user_id,
           p256dh     = EXCLUDED.p256dh,
           auth       = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent
     RETURNING *`,
    [
      uuidv4(),
      userId,
      endpoint,
      keys.p256dh,
      keys.auth,
      userAgent ? String(userAgent).slice(0, 255) : null,
    ]
  );

  return result.rows[0];
};

/** Todas las suscripciones de un usuario. */
export const getSubscriptionsByUser = async (userId) => {
  const result = await query(
    `SELECT * FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
};

/**
 * Borra una suscripción por su endpoint.
 *
 * Se filtra también por usuario para que nadie pueda dar de baja el
 * dispositivo de otra persona enviando su endpoint.
 */
export const deleteSubscription = async (endpoint, userId) => {
  const result = await query(
    `DELETE FROM push_subscriptions
      WHERE endpoint = $1 AND user_id = $2
      RETURNING id`,
    [endpoint, userId]
  );
  return result.rows[0];
};

/** Marca que la suscripción acaba de usarse para enviar algo. */
export const markUsed = async (id) => {
  await query(`UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1`, [id]);
};
