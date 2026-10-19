import { query } from '../config/database.js';
import { toYmd } from '../utils/dbValues.js';
import { isOverridableDayType } from '../utils/dayTypes.js';

/**
 * Tipos de día por fecha (excepciones al patrón semanal).
 *
 * El patrón vive en `users.training_pattern`; aquí solo se guardan las fechas
 * que se salen de él. Sin fila, el día se resuelve con el patrón.
 */

/** Marca (o cambia) el tipo de un día. Es un upsert: repetirlo actualiza. */
export const setDayType = async (userId, date, type) => {
  if (!isOverridableDayType(type)) throw new Error('Tipo de día inválido');

  const result = await query(
    `INSERT INTO day_types (user_id, day_date, type, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, day_date)
     DO UPDATE SET type = EXCLUDED.type, created_at = NOW()
     RETURNING type`,
    [userId, date, type]
  );

  return { date, type: result.rows[0]?.type || type };
};

/** Quita la marca de una fecha: vuelve a regir el patrón semanal. */
export const clearDayType = async (userId, date) => {
  const result = await query(
    `DELETE FROM day_types WHERE user_id = $1 AND day_date = $2 RETURNING day_date`,
    [userId, date]
  );

  return { date, removed: result.rows.length > 0 };
};

/**
 * Tipos marcados dentro de un rango de fechas, como mapa { 'YYYY-MM-DD': tipo }.
 *
 * Se devuelve un mapa (y no una lista) porque el cálculo semanal necesita
 * preguntar "¿este día?" siete veces y así no hay búsquedas lineales.
 */
export const getDayTypesInRange = async (userId, startDate, endDate) => {
  const result = await query(
    `SELECT day_date, type
       FROM day_types
      WHERE user_id = $1 AND day_date BETWEEN $2 AND $3`,
    [userId, startDate, endDate]
  );

  const mapa = {};
  for (const row of result.rows) {
    const fecha = toYmd(row.day_date);
    if (fecha && isOverridableDayType(row.type)) mapa[fecha] = row.type;
  }

  return mapa;
};
