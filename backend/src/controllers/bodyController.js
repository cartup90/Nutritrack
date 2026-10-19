import {
  deleteBodyMetrics,
  getBodyMetricsInRange,
  getLatestBodyMetrics,
  upsertBodyMetrics,
} from '../models/BodyMetric.js';
import { updateUser } from '../models/User.js';
import { clearRecommendationCache } from '../models/RecommendationCache.js';
import {
  addDays,
  isYmd,
  resolveTimeZone,
  today as todayLogico,
} from '../utils/timezone.js';

/**
 * Registro corporal: peso y medidas, con media móvil de 7 días.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ MEDIA MÓVIL
 * ---------------------------------------------------------------------------
 * El peso diario oscila un kilo o más por retención de agua (creatina, sal,
 * la cena anterior, el ciclo menstrual) sin que haya cambiado nada de grasa.
 * Mirar el número de cada día genera falsas alarmas; la **media de los últimos
 * 7 días** muestra la tendencia real y es lo que se usa para la gráfica.
 *
 * El peso del perfil (el que usan los objetivos) se actualiza solo cuando se
 * registra el peso de la fecha más reciente: así no se desincroniza, pero editar
 * un día viejo no te cambia el objetivo de hoy.
 */

/** Rangos de cordura: por fuera de esto es un error de tipeo. */
const CAMPOS = {
  weightKg: { min: 20, max: 400, etiqueta: 'peso' },
  waistCm: { min: 30, max: 250, etiqueta: 'cintura' },
  armCm: { min: 10, max: 100, etiqueta: 'brazo' },
  thighCm: { min: 20, max: 150, etiqueta: 'muslo' },
};

const DIAS_ATRAS_MAXIMO = 730;
const DIAS_ADELANTE_MAXIMO = 0;

const redondear = (value, decimales = 0) => {
  const factor = 10 ** decimales;
  return Math.round(Number(value) * factor) / factor;
};

/** Lee y valida un campo del cuerpo. Devuelve { valor } o { error }. */
const leerCampo = (raw, clave) => {
  const { min, max, etiqueta } = CAMPOS[clave];

  if (raw === undefined) return { valor: undefined };
  if (raw === null || raw === '') return { valor: undefined };

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { error: `El ${etiqueta} debe ser un número` };
  }
  if (n < min || n > max) {
    return { error: `El ${etiqueta} debe estar entre ${min} y ${max}` };
  }

  return { valor: n };
};

/**
 * Media móvil de 7 días de una métrica, cerrando en `date`.
 *
 * Se promedian los valores NO nulos de los últimos 7 días. Si no hay datos en
 * la ventana devuelve null, para que la gráfica no invente un punto.
 */
const mediaMovil = (filas, date, clave) => {
  const desde = addDays(date, -6);
  const valores = filas
    .filter((f) => f.date >= desde && f.date <= date)
    .map((f) => f[clave])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));

  if (!valores.length) return null;

  return redondear(valores.reduce((acc, v) => acc + v, 0) / valores.length, 1);
};

/**
 * GET /body?days=90
 *
 * Devuelve los registros del rango, la serie para la gráfica (valor diario +
 * media de 7 días), las medias del final del rango y la tendencia semanal.
 */
export const getBodyProgress = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const hoy = todayLogico(timeZone);

    const days = Math.min(Math.max(Number(req.query.days) || 90, 7), 730);
    const endDate = isYmd(req.query.endDate) ? req.query.endDate : hoy;
    const startDate = addDays(endDate, -(days - 1));

    // Se traen 6 días más atrás: la media móvil del primer día del rango
    // necesita la ventana completa.
    const filas = await getBodyMetricsInRange(
      req.user.id,
      addDays(startDate, -6),
      endDate
    );

    const enRango = filas.filter((f) => f.date >= startDate && f.date <= endDate);

    const chart = enRango.map((f) => ({
      date: f.date,
      weightKg: f.weightKg,
      weightAvg7d: mediaMovil(filas, f.date, 'weightKg'),
      waistCm: f.waistCm,
      waistAvg7d: mediaMovil(filas, f.date, 'waistCm'),
      armCm: f.armCm,
      armAvg7d: mediaMovil(filas, f.date, 'armCm'),
      thighCm: f.thighCm,
      thighAvg7d: mediaMovil(filas, f.date, 'thighCm'),
    }));

    const latest = enRango.length ? enRango[enRango.length - 1] : null;
    const primero = enRango.length ? enRango[0] : null;

    // Diferencia entre los dos últimos valores de cada métrica: es lo que el
    // usuario quiere ver ("bajé 1,5 cm de cintura desde la última medición").
    const deltas = {};
    for (const clave of Object.keys(CAMPOS)) {
      const conValor = enRango.filter(
        (f) => typeof f[clave] === 'number' && Number.isFinite(f[clave])
      );
      deltas[clave] =
        conValor.length >= 2
          ? redondear(
              conValor[conValor.length - 1][clave] -
                conValor[conValor.length - 2][clave],
              1
            )
          : null;
    }

    // Tendencia de peso: media de los últimos 7 días contra la de los 7 previos
    const mediaActual = mediaMovil(filas, endDate, 'weightKg');
    const mediaPrevia = mediaMovil(
      filas,
      addDays(endDate, -7),
      'weightKg'
    );

    res.json({
      range: { startDate, endDate, days },
      entries: enRango,
      chart,
      latest,
      first: primero,
      deltas,
      averages: {
        weight7d: mediaMovil(filas, endDate, 'weightKg'),
        waist7d: mediaMovil(filas, endDate, 'waistCm'),
        arm7d: mediaMovil(filas, endDate, 'armCm'),
        thigh7d: mediaMovil(filas, endDate, 'thighCm'),
      },
      trend: {
        /** Cambio de la media de 7 días contra los 7 días anteriores */
        weeklyWeightChangeKg:
          mediaActual !== null && mediaPrevia !== null
            ? redondear(mediaActual - mediaPrevia, 2)
            : null,
        averageWeight7d: mediaActual,
        previousAverageWeight7d: mediaPrevia,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /body/:date
 *
 * Upsert parcial: solo se tocan los campos enviados. Cargar el peso no borra la
 * cintura que ya estaba cargada.
 */
export const saveBodyMetrics = async (req, res, next) => {
  try {
    const { date } = req.params;
    const timeZone = resolveTimeZone(req);
    const hoy = todayLogico(timeZone);

    if (!isYmd(date)) {
      return res
        .status(400)
        .json({ error: 'La fecha debe tener el formato YYYY-MM-DD' });
    }
    if (date > addDays(hoy, DIAS_ADELANTE_MAXIMO)) {
      return res
        .status(400)
        .json({ error: 'No se puede registrar el peso de un día que no pasó' });
    }
    if (date < addDays(hoy, -DIAS_ATRAS_MAXIMO)) {
      return res.status(400).json({ error: 'La fecha es demasiado antigua' });
    }

    const metrics = {};
    for (const clave of Object.keys(CAMPOS)) {
      const { valor, error } = leerCampo(req.body?.[clave], clave);
      if (error) return res.status(400).json({ error });
      metrics[clave] = valor;
    }

    if (Object.values(metrics).every((v) => v === undefined)) {
      return res.status(400).json({
        error: 'Enviá al menos un dato: peso, cintura, brazo o muslo',
      });
    }

    const saved = await upsertBodyMetrics(req.user.id, date, metrics);

    // El peso del perfil (el que usan los objetivos) se actualiza solo si la
    // fecha registrada es la más reciente: editar un día viejo no debe cambiar
    // el objetivo de hoy.
    let profileWeightUpdated = false;
    if (metrics.weightKg !== undefined) {
      const ultimo = await getLatestBodyMetrics(req.user.id);
      if (ultimo && ultimo.date === date) {
        await updateUser(req.user.id, { weight: metrics.weightKg });
        await clearRecommendationCache(req.user.id);
        profileWeightUpdated = true;
      }
    }

    res.json({
      message: 'Registro corporal guardado',
      date,
      metrics: saved,
      profileWeightUpdated,
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /body/:date */
export const removeBodyMetrics = async (req, res, next) => {
  try {
    const { date } = req.params;

    if (!isYmd(date)) {
      return res
        .status(400)
        .json({ error: 'La fecha debe tener el formato YYYY-MM-DD' });
    }

    const result = await deleteBodyMetrics(req.user.id, date);

    res.json({
      message: result.removed
        ? 'Registro corporal eliminado'
        : 'Ese día no tenía registros',
      date,
      removed: result.removed,
    });
  } catch (error) {
    next(error);
  }
};
