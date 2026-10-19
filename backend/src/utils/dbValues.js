/**
 * Normalización de valores que devuelve la base de datos.
 *
 * Vive aparte porque hay dos motores en juego: PostgreSQL (con los parsers de
 * `config/database.js`) y `pg-mem` (la base en memoria de los tests). No
 * coinciden en cómo devuelven algunos tipos, y comparar sus salidas sin
 * normalizar es una fuente de bugs silenciosos.
 */

/**
 * Convierte lo que devuelve la base a 'YYYY-MM-DD'.
 *
 * En PostgreSQL las columnas DATE llegan como string (el parser 1082 está
 * registrado en `config/database.js`), pero `pg-mem` las devuelve como objeto
 * Date. Normalizar aquí deja los dos caminos con el mismo formato.
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
 * Convierte un NUMERIC (que según el motor llega como string o como número) a
 * número, o `null` si no hay valor.
 */
export const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
