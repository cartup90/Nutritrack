import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { toNumberOrNull, toYmd } from '../utils/dbValues.js';

/**
 * Registro corporal: peso y medidas por día.
 *
 * Una fila por fecha. El usuario puede cargar solo el peso, solo una medida o
 * todo junto: los campos son opcionales y un PUT parcial **no borra** lo que ya
 * estaba (ver `upsertBodyMetrics`).
 *
 * El peso diario oscila por retención de agua (creatina, sal, la cena anterior),
 * así que la lectura que importa es la **media móvil de 7 días**; eso se calcula
 * en el controlador, no aquí.
 */

/** Campos numéricos de la tabla, con el nombre que usa la API. */
const CAMPOS = {
  weight_kg: 'weightKg',
  waist_cm: 'waistCm',
  arm_cm: 'armCm',
  thigh_cm: 'thighCm',
};

/** Convierte una fila de la base al objeto de la API. */
const normalizar = (row) => ({
  date: toYmd(row.metric_date),
  weightKg: toNumberOrNull(row.weight_kg),
  waistCm: toNumberOrNull(row.waist_cm),
  armCm: toNumberOrNull(row.arm_cm),
  thighCm: toNumberOrNull(row.thigh_cm),
  updatedAt: row.updated_at || null,
});

/**
 * Guarda (o completa) las métricas de un día.
 *
 * Si la fecha no existía se inserta, y si existía se actualizan **solo los
 * campos enviados**: cargar el peso no borra la cintura que ya estaba.
 *
 * @param {object} metrics - { weightKg?, waistCm?, armCm?, thighCm? } (valores ya
 *                           validados y numéricos, o undefined para no tocar)
 */
export const upsertBodyMetrics = async (userId, date, metrics = {}) => {
  const existente = await query(
    `SELECT * FROM body_metrics WHERE user_id = $1 AND metric_date = $2`,
    [userId, date]
  );

  if (existente.rows.length === 0) {
    const columnas = [];
    const valores = [uuidv4(), userId, date];

    for (const [columna, clave] of Object.entries(CAMPOS)) {
      if (metrics[clave] !== undefined) {
        columnas.push(columna);
        valores.push(metrics[clave]);
      }
    }

    const placeholders = columnas.map((_, i) => `$${i + 4}`);
    const sql = `INSERT INTO body_metrics (id, user_id, metric_date${
      columnas.length ? `, ${columnas.join(', ')}` : ''
    }, created_at, updated_at)
       VALUES ($1, $2, $3${placeholders.length ? `, ${placeholders.join(', ')}` : ''}, NOW(), NOW())
       RETURNING *`;

    const result = await query(sql, valores);
    return normalizar(result.rows[0]);
  }

  const asignaciones = [];
  const valores = [];

  for (const [columna, clave] of Object.entries(CAMPOS)) {
    if (metrics[clave] !== undefined) {
      valores.push(metrics[clave]);
      asignaciones.push(`${columna} = $${valores.length}`);
    }
  }

  if (asignaciones.length === 0) return normalizar(existente.rows[0]);

  asignaciones.push('updated_at = NOW()');
  valores.push(userId, date);

  const result = await query(
    `UPDATE body_metrics
        SET ${asignaciones.join(', ')}
      WHERE user_id = $${valores.length - 1} AND metric_date = $${valores.length}
      RETURNING *`,
    valores
  );

  return normalizar(result.rows[0]);
};

/** Borra el registro de un día. */
export const deleteBodyMetrics = async (userId, date) => {
  const result = await query(
    `DELETE FROM body_metrics
      WHERE user_id = $1 AND metric_date = $2
      RETURNING metric_date`,
    [userId, date]
  );

  return { date, removed: result.rows.length > 0 };
};

/**
 * Registros de un rango de fechas, ordenados de más viejo a más nuevo.
 * @returns {Promise<Array<{date,weightKg,waistCm,armCm,thighCm}>>}
 */
export const getBodyMetricsInRange = async (userId, startDate, endDate) => {
  const result = await query(
    `SELECT metric_date, weight_kg, waist_cm, arm_cm, thigh_cm, updated_at
       FROM body_metrics
      WHERE user_id = $1 AND metric_date BETWEEN $2 AND $3
      ORDER BY metric_date ASC`,
    [userId, startDate, endDate]
  );

  return result.rows.map(normalizar);
};

/** Último registro del usuario (o null si nunca cargó nada). */
export const getLatestBodyMetrics = async (userId) => {
  const result = await query(
    `SELECT metric_date, weight_kg, waist_cm, arm_cm, thigh_cm, updated_at
       FROM body_metrics
      WHERE user_id = $1
      ORDER BY metric_date DESC
      LIMIT 1`,
    [userId]
  );

  return result.rows[0] ? normalizar(result.rows[0]) : null;
};
