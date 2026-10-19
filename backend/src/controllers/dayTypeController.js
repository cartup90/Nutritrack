import { clearDayType, setDayType } from '../models/DayType.js';
import { isOverridableDayType } from '../utils/dayTypes.js';
import {
  addDays,
  isYmd,
  resolveTimeZone,
  today as todayLogico,
} from '../utils/timezone.js';

/**
 * Tipos de día por fecha (excepciones al patrón semanal del perfil).
 *
 * El objetivo calórico de un día depende de si se entrena o se descansa, así que
 * marcar el día cambia lo que la app considera objetivo de esa jornada.
 */

/** Hasta cuánto se puede marcar hacia atrás (2 años). */
const DIAS_ATRAS_MAXIMO = 730;

/**
 * Y hacia adelante: se permite planificar la semana que viene (marcar el
 * entrenamiento de mañana o del lunes), pero no fechas absurdas.
 */
const DIAS_ADELANTE_MAXIMO = 7;

/** Valida la fecha de la ruta y devuelve un mensaje de error o null. */
const validarFecha = (date, hoy) => {
  if (!isYmd(date)) return 'La fecha debe tener el formato YYYY-MM-DD';
  if (date > addDays(hoy, DIAS_ADELANTE_MAXIMO)) {
    return `No se puede marcar un día a más de ${DIAS_ADELANTE_MAXIMO} días vista`;
  }
  if (date < addDays(hoy, -DIAS_ATRAS_MAXIMO)) return 'La fecha es demasiado antigua';
  return null;
};

export const putDayType = async (req, res, next) => {
  try {
    const { date } = req.params;
    const { type } = req.body || {};
    const hoy = todayLogico(resolveTimeZone(req));

    const errorFecha = validarFecha(date, hoy);
    if (errorFecha) return res.status(400).json({ error: errorFecha });

    if (!isOverridableDayType(type)) {
      return res.status(400).json({
        error: 'El tipo debe ser "rest", "strength" o "aerobic"',
      });
    }

    const result = await setDayType(req.user.id, date, type);

    res.json({
      message: `Día marcado como ${result.type}`,
      date,
      type: result.type,
    });
  } catch (error) {
    next(error);
  }
};

export const removeDayType = async (req, res, next) => {
  try {
    const { date } = req.params;
    const hoy = todayLogico(resolveTimeZone(req));

    const errorFecha = validarFecha(date, hoy);
    if (errorFecha) return res.status(400).json({ error: errorFecha });

    const result = await clearDayType(req.user.id, date);

    res.json({
      message: result.removed
        ? 'Se quitó la marca del día: vuelve a regir tu patrón semanal'
        : 'Ese día no tenía una marca propia',
      date,
      removed: result.removed,
    });
  } catch (error) {
    next(error);
  }
};
