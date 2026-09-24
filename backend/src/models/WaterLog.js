/**
 * Modelo de agua.
 *
 * Se guardan vasos individuales y el total se suma al consultar: así se puede
 * deshacer uno mal anotado sin tocar el resto.
 *
 * El día al que pertenece cada vaso lo decide la zona del usuario (igual que
 * las comidas), no la del servidor. Por eso todas las consultas reutilizan
 * `filtroDiaLogico` y no comparan fechas a mano.
 */
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { DAY_START_HOUR, DEFAULT_TIMEZONE } from '../utils/timezone.js';
import { filtroDiaLogico } from '../utils/sqlFilters.js';

/** Registra un vaso de agua. `createdAt` solo se usa en los tests. */
export const createWaterLog = async (userId, amountMl, createdAt = null) => {
  const result = await query(
    `INSERT INTO water_logs (id, user_id, amount_ml, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), NOW())
     RETURNING *`,
    [uuidv4(), userId, amountMl, createdAt]
  );
  return result.rows[0];
};

/** Vasos de un día lógico, del más reciente al más antiguo. */
export const getWaterLogsByDay = async (
  userId,
  date,
  { timeZone = DEFAULT_TIMEZONE, dayStartHour = DAY_START_HOUR } = {}
) => {
  const params = [userId];
  const condicion = filtroDiaLogico(params, timeZone, dayStartHour, date);

  const result = await query(
    `SELECT * FROM water_logs
      WHERE user_id = $1 AND ${condicion}
      ORDER BY created_at DESC`,
    params
  );
  return result.rows;
};

/** Total de ml de un día lógico, sumado en la base. */
export const getWaterTotalByDay = async (
  userId,
  date,
  { timeZone = DEFAULT_TIMEZONE, dayStartHour = DAY_START_HOUR } = {}
) => {
  const params = [userId];
  const condicion = filtroDiaLogico(params, timeZone, dayStartHour, date);

  const result = await query(
    `SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml, COUNT(*)::int AS log_count
       FROM water_logs
      WHERE user_id = $1 AND ${condicion}`,
    params
  );
  return result.rows[0];
};

/**
 * Borra un vaso comprobando que sea del usuario.
 * Devuelve `undefined` si no existe o es de otro: así el controlador puede
 * responder 404 sin filtrar si el id pertenece a alguien distinto.
 */
export const deleteWaterLog = async (id, userId) => {
  const result = await query(
    `DELETE FROM water_logs WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return result.rows[0];
};
