/**
 * Fecha de una comida: hoy o un día de los últimos días.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE
 * ---------------------------------------------------------------------------
 * Antes toda comida se guardaba con `NOW()`. Si el usuario se olvidaba de cargar
 * la cena de ayer, no tenía forma de hacerlo: cargarla hoy la metía en el día
 * equivocado y le rompía las estadísticas de los dos días.
 *
 * Ahora el cliente manda la fecha lógica ('YYYY-MM-DD') y, aquí, se calcula el
 * instante UTC que cae DENTRO de ese día lógico (ver `logicalInstant`), así que
 * el registro aparece donde corresponde sin tocar el resto de las consultas.
 */
import { addDays, isYmd, logicalInstant } from './timezone.js';

/**
 * Hasta cuántos días atrás se puede cargar.
 *
 * El caso real es "me olvidé de cargar la cena de ayer". Con 7 días alcanza y
 * sobra, y evita que un error de fecha meta comidas de hace meses en el
 * historial y en las estadísticas.
 */
export const DIAS_MAXIMOS_CARGA_ATRASADA = 7;

/**
 * Resuelve a qué día va una comida.
 *
 * Sin `date` se asume hoy y se deja `instant` en null (se guarda con NOW(),
 * como siempre). Con `date`, se calcula el instante del día lógico usando
 * `mealTime` (12:00 si no viene).
 *
 * @returns {{date: string|null, instant: Date|null, error: string|null}}
 */
export const resolverFechaComida = (rawDate, mealTime, timeZone, hoy) => {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return { date: hoy, instant: null, error: null };
  }

  if (!isYmd(rawDate)) {
    return {
      date: null,
      instant: null,
      error: 'La fecha debe tener el formato YYYY-MM-DD',
    };
  }

  if (rawDate > hoy) {
    return {
      date: null,
      instant: null,
      error: 'No se puede registrar una comida en un día que todavía no pasó',
    };
  }

  if (rawDate < addDays(hoy, -DIAS_MAXIMOS_CARGA_ATRASADA)) {
    return {
      date: null,
      instant: null,
      error: `Solo se pueden cargar comidas de los últimos ${DIAS_MAXIMOS_CARGA_ATRASADA} días`,
    };
  }

  const [horas, minutos] = String(mealTime || '')
    .split(':')
    .map(Number);

  const instant = logicalInstant(
    rawDate,
    Number.isFinite(horas) ? horas : 12,
    Number.isFinite(minutos) ? minutos : 0,
    timeZone
  );

  return { date: rawDate, instant, error: null };
};
