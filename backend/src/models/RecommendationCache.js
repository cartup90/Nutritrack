import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Caché de recomendaciones.
 *
 * Las recomendaciones solo dependen del día, del objetivo y de lo consumido,
 * así que se guardan en base de datos y se reutilizan. Registrar una comida
 * cambia la clave, con lo que la caché se invalida sola.
 */

/** Vigencia máxima de una entrada. Pasado ese tiempo se regenera. */
const TTL_HOURS = Number(process.env.RECOMMENDATIONS_TTL_HOURS || 12);

/**
 * Recupera una recomendación cacheada.
 * @returns {Promise<object|null>} el payload, o null si no hay o caducó.
 */
export const getCachedRecommendation = async (userId, cacheKey) => {
  const result = await query(
    `SELECT payload, created_at
       FROM recommendation_cache
      WHERE user_id = $1
        AND cache_key = $2
        AND created_at > NOW() - ($3 || ' hours')::interval
      LIMIT 1`,
    [userId, cacheKey, String(TTL_HOURS)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload),
    createdAt: row.created_at,
  };
};

/**
 * Guarda (o reemplaza) una recomendación en caché.
 */
export const saveCachedRecommendation = async (userId, cacheKey, payload) => {
  await query(
    `INSERT INTO recommendation_cache (id, user_id, cache_key, payload, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (user_id, cache_key)
     DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
    [uuidv4(), userId, cacheKey, JSON.stringify(payload)]
  );
};

/**
 * Borra las recomendaciones cacheadas de un usuario.
 * Se usa al cambiar el perfil, porque los objetivos pasan a ser otros.
 */
export const clearRecommendationCache = async (userId) => {
  const result = await query(
    `DELETE FROM recommendation_cache WHERE user_id = $1`,
    [userId]
  );
  return result.rowCount;
};
