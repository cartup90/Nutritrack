import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import {
  DAY_START_HOUR,
  DEFAULT_TIMEZONE,
  dayRangeUtc,
} from '../utils/timezone.js';

/**
 * Añade a `params` los límites UTC del rango pedido y devuelve la condición SQL.
 *
 * Se filtra por rango (`created_at >= inicio AND created_at < fin`) en lugar de
 * comparar `created_at::date`, por dos razones:
 *   · la comparación por rango puede usar el índice de `created_at`, mientras
 *     que `created_at::date = $1` obliga a recorrer la tabla entera;
 *   · la conversión de zona se hace en JavaScript, así que no depende de
 *     `AT TIME ZONE`, que pg-mem (la base de los tests) no implementa.
 *
 * Concentrarlo aquí evita el fallo que originó este arreglo: antes cada
 * consulta comparaba fechas por su cuenta y unas cuantas se desincronizaron.
 */
const filtroRango = (params, timeZone, dayStartHour, startDate, endDate) => {
  const { start } = dayRangeUtc(startDate, timeZone, dayStartHour);
  const { end } = dayRangeUtc(endDate, timeZone, dayStartHour);

  params.push(start, end);
  const n = params.length;
  return `created_at >= $${n - 1} AND created_at < $${n}`;
};

/** Condición para un único día lógico. */
const filtroDiaLogico = (params, timeZone, dayStartHour, date) =>
  filtroRango(params, timeZone, dayStartHour, date, date);

/**
 * Crea un registro de comida.
 * Se guardan tanto los valores estimados por IA como los finales del usuario.
 */
export const createFoodEntry = async (data) => {
  const {
    userId,
    mealType = 'lunch',
    mealTime = null,
    foods = [],
    totals = {},
    aiTotals = null,
    imageUrl = null,
    confirmedAt = null,
  } = data;

  const result = await query(
    `INSERT INTO food_entries
       (id, user_id, meal_type, meal_time, foods,
        calories, protein, carbs, fats, fiber, sugars, sodium,
        ai_calories, ai_protein, ai_carbs, ai_fats, ai_confidence,
        image_url, estimated_at, confirmed_at, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5::jsonb,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        $18, NOW(), $19, NOW(), NOW())
     RETURNING *`,
    [
      uuidv4(),
      userId,
      mealType,
      mealTime,
      JSON.stringify(foods),
      numOrNull(totals.calories),
      numOrNull(totals.protein),
      numOrNull(totals.carbs),
      numOrNull(totals.fats),
      numOrNull(totals.fiber),
      numOrNull(totals.sugars),
      numOrNull(totals.sodium),
      numOrNull(aiTotals?.calories),
      numOrNull(aiTotals?.protein),
      numOrNull(aiTotals?.carbs),
      numOrNull(aiTotals?.fats),
      numOrNull(aiTotals?.confidence),
      imageUrl,
      confirmedAt,
    ]
  );

  return result.rows[0];
};

const numOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Lista los registros de un usuario con filtros opcionales. */
export const getFoodEntries = async (
  userId,
  {
    date,
    mealType,
    limit,
    offset,
    timeZone = DEFAULT_TIMEZONE,
    dayStartHour = DAY_START_HOUR,
  } = {}
) => {
  const params = [userId];
  const where = ['user_id = $1'];

  if (date) {
    where.push(filtroDiaLogico(params, timeZone, dayStartHour, date));
  }
  if (mealType) {
    params.push(mealType);
    where.push(`meal_type = $${params.length}`);
  }

  let sql = `SELECT * FROM food_entries WHERE ${where.join(' AND ')} ORDER BY created_at DESC`;

  if (limit) {
    params.push(Number(limit));
    sql += ` LIMIT $${params.length}`;
  }
  if (offset) {
    params.push(Number(offset));
    sql += ` OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  return result.rows;
};

export const getAllFoodEntries = async (userId) => {
  const result = await query(
    `SELECT * FROM food_entries WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
};

export const getFoodEntryById = async (id, userId) => {
  const result = await query(
    `SELECT * FROM food_entries WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0];
};

/** Totales del día lógico del usuario. */
export const getDailyStats = async (
  userId,
  date,
  { timeZone = DEFAULT_TIMEZONE, dayStartHour = DAY_START_HOUR } = {}
) => {
  const params = [userId];
  const condicion = filtroDiaLogico(params, timeZone, dayStartHour, date);

  const result = await query(
    `SELECT
       COUNT(*)::int              AS entry_count,
       COALESCE(SUM(calories), 0) AS total_calories,
       COALESCE(SUM(protein), 0)  AS total_protein,
       COALESCE(SUM(carbs), 0)    AS total_carbs,
       COALESCE(SUM(fats), 0)     AS total_fats,
       COALESCE(SUM(fiber), 0)    AS total_fiber,
       COALESCE(SUM(sugars), 0)   AS total_sugars,
       COALESCE(SUM(sodium), 0)   AS total_sodium
     FROM food_entries
     WHERE user_id = $1 AND ${condicion}`,
    params
  );
  return result.rows[0];
};

/**
 * Registros de un rango de días lógicos, SIN agrupar.
 *
 * Agrupar por día lógico en SQL exigiría `AT TIME ZONE` dentro del GROUP BY,
 * que pg-mem no implementa. Se devuelven las filas y el controlador las agrupa
 * reutilizando la misma función de zona horaria que se usa en todo lo demás,
 * así la conversión vive en un único sitio en vez de repartida.
 *
 * @param {string} startDate - YYYY-MM-DD inclusive (día lógico)
 * @param {string} endDate   - YYYY-MM-DD inclusive (día lógico)
 */
export const getEntriesForStats = async (
  userId,
  startDate,
  endDate,
  { timeZone = DEFAULT_TIMEZONE, dayStartHour = DAY_START_HOUR } = {}
) => {
  const params = [userId];
  const condicion = filtroRango(params, timeZone, dayStartHour, startDate, endDate);

  const result = await query(
    `SELECT created_at, calories, protein, carbs, fats
       FROM food_entries
      WHERE user_id = $1 AND ${condicion}
      ORDER BY created_at ASC`,
    params
  );
  return result.rows;
};

/** Actualiza los valores confirmados por el usuario. */
export const updateFoodEntry = async (id, userId, data) => {
  const allowed = [
    'calories',
    'protein',
    'carbs',
    'fats',
    'fiber',
    'sugars',
    'sodium',
    'meal_type',
    'meal_time',
  ];

  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      fields.push(`${key} = $${values.length}`);
    }
  }

  if (data.foods !== undefined) {
    values.push(JSON.stringify(data.foods));
    fields.push(`foods = $${values.length}::jsonb`);
  }

  if (data.confirmed) {
    fields.push('confirmed_at = NOW()');
  }

  if (fields.length === 0) return getFoodEntryById(id, userId);

  fields.push('updated_at = NOW()');
  values.push(id, userId);

  const result = await query(
    `UPDATE food_entries
       SET ${fields.join(', ')}
     WHERE id = $${values.length - 1} AND user_id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0];
};

export const deleteFoodEntry = async (id, userId) => {
  const result = await query(
    `DELETE FROM food_entries WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return result.rows[0];
};

/** Nombres de comidas registradas hoy (para contexto de recomendaciones). */
export const getTodayMealNames = async (
  userId,
  date,
  { timeZone = DEFAULT_TIMEZONE, dayStartHour = DAY_START_HOUR } = {}
) => {
  const params = [userId];
  const condicion = filtroDiaLogico(params, timeZone, dayStartHour, date);

  const result = await query(
    `SELECT foods FROM food_entries WHERE user_id = $1 AND ${condicion}`,
    params
  );

  return result.rows
    .flatMap((row) => (Array.isArray(row.foods) ? row.foods : []))
    .map((f) => f?.name)
    .filter(Boolean);
};
