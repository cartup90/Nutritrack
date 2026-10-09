import {
  removeFastingDay,
  setFastingDay,
} from '../models/FastingDay.js';
import {
  addDays,
  isYmd,
  resolveTimeZone,
  today as todayLogico,
} from '../utils/timezone.js';

/**
 * Marcas de ayuno voluntario.
 *
 * Solo se pueden marcar días que ya pasaron (o el de hoy): un ayuno es algo que
 * ocurrió, no una intención. Además se acota hacia atrás para no llenar la tabla
 * con fechas imposibles si alguien escribe una a mano.
 */

/** Hasta cuántos días atrás se acepta una marca (2 años). */
const DIAS_ATRAS_MAXIMO = 730;

const fechaDeLaRuta = (req) => req.params.date;

export const markFastingDay = async (req, res, next) => {
  try {
    const date = fechaDeLaRuta(req);

    if (!isYmd(date)) {
      return res
        .status(400)
        .json({ error: 'La fecha debe tener el formato YYYY-MM-DD' });
    }

    const hoy = todayLogico(resolveTimeZone(req));

    if (date > hoy) {
      return res
        .status(400)
        .json({ error: 'No se puede marcar como ayuno un día que todavía no pasó' });
    }

    if (date < addDays(hoy, -DIAS_ATRAS_MAXIMO)) {
      return res.status(400).json({ error: 'La fecha es demasiado antigua' });
    }

    const result = await setFastingDay(req.user.id, date);

    // 201 si se creó, 200 si ya estaba marcado: repetir la marca no es un error.
    res.status(result.created ? 201 : 200).json({
      message: result.created
        ? 'Día marcado como ayuno'
        : 'El día ya estaba marcado como ayuno',
      date,
      created: result.created,
    });
  } catch (error) {
    next(error);
  }
};

export const unmarkFastingDay = async (req, res, next) => {
  try {
    const date = fechaDeLaRuta(req);

    if (!isYmd(date)) {
      return res
        .status(400)
        .json({ error: 'La fecha debe tener el formato YYYY-MM-DD' });
    }

    const result = await removeFastingDay(req.user.id, date);

    res.json({
      message: result.removed
        ? 'Ayuno quitado'
        : 'Ese día no estaba marcado como ayuno',
      date,
      removed: result.removed,
    });
  } catch (error) {
    next(error);
  }
};
