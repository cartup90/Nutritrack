/**
 * Filtros SQL por día lógico.
 *
 * Vive aparte de los modelos porque tanto las comidas como el agua agrupan por
 * el día del usuario, y el fallo original (el gráfico se reseteaba a las 21:00)
 * vino justamente de que cada consulta comparaba fechas por su cuenta.
 *
 * El filtro es por RANGO y no por `created_at::date`:
 *   · la comparación por rango puede usar el índice de `created_at`, mientras
 *     que `created_at::date = $1` obliga a recorrer la tabla entera;
 *   · no necesita `AT TIME ZONE`, que pg-mem (la base de los tests) no
 *     implementa.
 */
import {
  DAY_START_HOUR,
  DEFAULT_TIMEZONE,
  dayRangeUtc,
} from './timezone.js';

/**
 * Añade a `params` los límites UTC del rango de días lógicos y devuelve la
 * condición SQL que los aplica.
 *
 * @param {any[]} params - parámetros acumulados de la consulta (se modifican)
 * @param {string} timeZone - zona IANA del usuario
 * @param {number} dayStartHour - hora a la que cambia el día
 * @param {string} startDate - 'YYYY-MM-DD' del primer día lógico
 * @param {string} endDate - 'YYYY-MM-DD' del último día lógico, inclusive
 */
export const filtroRangoDias = (
  params,
  timeZone = DEFAULT_TIMEZONE,
  dayStartHour = DAY_START_HOUR,
  startDate,
  endDate
) => {
  const { start } = dayRangeUtc(startDate, timeZone, dayStartHour);
  const { end } = dayRangeUtc(endDate, timeZone, dayStartHour);

  params.push(start, end);
  const n = params.length;

  return `created_at >= $${n - 1} AND created_at < $${n}`;
};

/** Condición para un único día lógico. */
export const filtroDiaLogico = (
  params,
  timeZone = DEFAULT_TIMEZONE,
  dayStartHour = DAY_START_HOUR,
  date
) => filtroRangoDias(params, timeZone, dayStartHour, date, date);
