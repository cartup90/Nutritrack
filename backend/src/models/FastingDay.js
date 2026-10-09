import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Días de ayuno voluntario.
 *
 * Sirven al progreso semanal: un día con muy pocas calorías se descarta (se
 * supone que no se cargaron las comidas), salvo que esté marcado aquí.
 *
 * La fecha es el día LÓGICO del usuario ('YYYY-MM-DD'), el mismo que usan las
 * comidas y el agua. No se guarda como instante porque no lo es: es una decisión
 * sobre un día del calendario del usuario.
 */

/**
 * Normaliza lo que devuelve la base a 'YYYY-MM-DD'.
 *
 * En PostgreSQL la columna DATE llega ya como string porque
 * `config/database.js` registra el parser 1082, pero la base en memoria de los
 * tests (pg-mem) la devuelve como objeto Date. Normalizar aquí deja los dos
 * caminos con el mismo formato y evita comparar peras con manzanas.
 */
export const toYmd = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

/**
 * Marca un día como ayuno. Idempotente: si ya estaba marcado no falla ni
 * duplica (el UNIQUE de (user_id, fasting_date) lo garantiza).
 */
export const setFastingDay = async (userId, date) => {
  // Se consulta antes de insertar para poder informar de si la marca es nueva.
  // `ON CONFLICT ... RETURNING` no sirve: en PostgreSQL DO NOTHING no devuelve
  // fila, pero en la base en memoria de los tests sí, así que el resultado no
  // distinguiría un alta de una repetición.
  const existente = await query(
    `SELECT id FROM fasting_days WHERE user_id = $1 AND fasting_date = $2`,
    [userId, date]
  );

  if (existente.rows.length > 0) return { date, created: false };

  // El ON CONFLICT queda como red de seguridad ante dos toques simultáneos:
  // sin él, el segundo INSERT fallaría con una violación de clave duplicada.
  await query(
    `INSERT INTO fasting_days (id, user_id, fasting_date, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, fasting_date) DO NOTHING`,
    [uuidv4(), userId, date]
  );

  return { date, created: true };
};

/** Quita la marca de ayuno de un día. Idempotente. */
export const removeFastingDay = async (userId, date) => {
  const result = await query(
    `DELETE FROM fasting_days
      WHERE user_id = $1 AND fasting_date = $2
      RETURNING fasting_date`,
    [userId, date]
  );

  return { date, removed: result.rows.length > 0 };
};

/**
 * Días de ayuno de un rango de días lógicos, ambos inclusive.
 * @returns {Promise<string[]>} fechas 'YYYY-MM-DD' ordenadas
 */
export const getFastingDays = async (userId, startDate, endDate) => {
  const result = await query(
    `SELECT fasting_date
       FROM fasting_days
      WHERE user_id = $1 AND fasting_date BETWEEN $2 AND $3
      ORDER BY fasting_date ASC`,
    [userId, startDate, endDate]
  );

  return result.rows.map((row) => toYmd(row.fasting_date)).filter(Boolean);
};
