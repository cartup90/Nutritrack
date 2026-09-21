import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

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
export const getFoodEntries = async (userId, { date, mealType, limit, offset } = {}) => {
  const params = [userId];
  const where = ['user_id = $1'];

  if (date) {
    params.push(date);
    where.push(`created_at::date = $${params.length}`);
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

/** Totales del día. */
export const getDailyStats = async (userId, date) => {
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
     WHERE user_id = $1 AND created_at::date = $2`,
    [userId, date]
  );
  return result.rows[0];
};

/**
 * Estadísticas por día para un rango de fechas.
 * @param {string} startDate - YYYY-MM-DD inclusive
 * @param {string} endDate   - YYYY-MM-DD inclusive
 */
export const getStatsByDateRange = async (userId, startDate, endDate) => {
  const result = await query(
    `SELECT
       created_at::date           AS date,
       COUNT(*)::int              AS entry_count,
       COALESCE(SUM(calories), 0) AS total_calories,
       COALESCE(SUM(protein), 0)  AS total_protein,
       COALESCE(SUM(carbs), 0)    AS total_carbs,
       COALESCE(SUM(fats), 0)     AS total_fats
     FROM food_entries
     WHERE user_id = $1
       AND created_at::date BETWEEN $2::date AND $3::date
     GROUP BY created_at::date
     ORDER BY date ASC`,
    [userId, startDate, endDate]
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
export const getTodayMealNames = async (userId, date) => {
  const result = await query(
    `SELECT foods FROM food_entries WHERE user_id = $1 AND created_at::date = $2`,
    [userId, date]
  );

  return result.rows
    .flatMap((row) => (Array.isArray(row.foods) ? row.foods : []))
    .map((f) => f?.name)
    .filter(Boolean);
};
