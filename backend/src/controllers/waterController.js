/**
 * Controlador de agua y recordatorios.
 *
 * Todo lo de los recordatorios es OPCIONAL y opt-in: por defecto están
 * desactivados, y activarlos exige un permiso explícito del navegador. Si el
 * servidor no tiene claves VAPID, la app sigue funcionando y simplemente no
 * ofrece la opción.
 */
import {
  createWaterLog,
  deleteWaterLog,
  getWaterLogsByDay,
  getWaterTotalByDay,
} from '../models/WaterLog.js';
import {
  getReminderSettings,
  updateReminderSettings,
} from '../models/User.js';
import {
  deleteSubscription,
  saveSubscription,
} from '../models/PushSubscription.js';
import {
  enviarPrueba,
  getPublicKey,
  pushDisponible,
} from '../services/pushService.js';
import { resolveTimeZone, today } from '../utils/timezone.js';

/** Tope por registro: más que esto es un error de dedo, no un vaso. */
const MAX_ML = 5000;
/** Máximo de recordatorios al día: más sería acoso, no un recordatorio. */
const MAX_RECORDATORIOS = 12;

/**
 * Valida y normaliza una lista de horas 'HH:MM'.
 *
 * Descarta lo que no encaje en vez de rechazar toda la petición: si el cliente
 * manda una hora mal formada entre varias buenas, es mejor guardar las buenas.
 */
const normalizarHoras = (times) => {
  if (!Array.isArray(times)) return [];

  const validas = times
    .filter((t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim()))
    .map((t) => t.trim());

  // Sin duplicados y ordenadas: el planificador las recorre en orden
  return [...new Set(validas)].sort().slice(0, MAX_RECORDATORIOS);
};

/** Respuesta estándar del día de agua. */
const respuestaDia = (date, timeZone, total, goalMl, logs = null) => ({
  date,
  timeZone,
  totalMl: Number(total?.total_ml || 0),
  logCount: Number(total?.log_count || 0),
  goalMl,
  percent: goalMl > 0 ? Math.round((Number(total?.total_ml || 0) / goalMl) * 100) : 0,
  ...(logs ? { logs } : {}),
});

/** GET /water — agua bebida en el día lógico del usuario. */
export const getWater = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const date = today(timeZone);

    const [total, logs] = await Promise.all([
      getWaterTotalByDay(req.user.id, date, { timeZone }),
      getWaterLogsByDay(req.user.id, date, { timeZone }),
    ]);

    const goalMl = req.user.waterGoalMl || 2000;

    res.json(respuestaDia(date, timeZone, total, goalMl, logs));
  } catch (error) {
    next(error);
  }
};

/** POST /water — registra un vaso. */
export const addWater = async (req, res, next) => {
  try {
    const amountMl = Math.trunc(Number(req.body?.amountMl));

    if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > MAX_ML) {
      return res.status(400).json({
        error: `La cantidad debe estar entre 1 y ${MAX_ML} ml`,
      });
    }

    const timeZone = resolveTimeZone(req);
    const date = today(timeZone);

    const log = await createWaterLog(req.user.id, amountMl);
    const total = await getWaterTotalByDay(req.user.id, date, { timeZone });
    const goalMl = req.user.waterGoalMl || 2000;

    res.status(201).json({
      ...respuestaDia(date, timeZone, total, goalMl),
      log,
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /water/:id — deshace un registro. */
export const removeWater = async (req, res, next) => {
  try {
    const borrado = await deleteWaterLog(req.params.id, req.user.id);

    if (!borrado) {
      return res.status(404).json({ error: 'Registro de agua no encontrado' });
    }

    const timeZone = resolveTimeZone(req);
    const date = today(timeZone);
    const total = await getWaterTotalByDay(req.user.id, date, { timeZone });
    const goalMl = req.user.waterGoalMl || 2000;

    res.json(respuestaDia(date, timeZone, total, goalMl));
  } catch (error) {
    next(error);
  }
};

/** GET /water/reminders — ajustes actuales y si el push está disponible. */
export const getReminders = async (req, res, next) => {
  try {
    const ajustes = await getReminderSettings(req.user.id);

    res.json({
      ...ajustes,
      // El cliente necesita saberlo para no ofrecer una opción que no puede
      // funcionar (servidor sin claves VAPID).
      pushAvailable: pushDisponible(),
      publicKey: getPublicKey(),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /water/reminders — activa o desactiva y guarda las horas. */
export const putReminders = async (req, res, next) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const times = normalizarHoras(req.body?.times);

    // Activar sin ninguna hora no tendría efecto: no habría cuándo avisar.
    if (enabled && times.length === 0) {
      return res.status(400).json({
        error: 'Elige al menos una hora para los recordatorios',
      });
    }

    const guardado = await updateReminderSettings(req.user.id, {
      enabled,
      times,
      // La zona la manda el navegador: es la única fuente fiable de en qué
      // reloj vive el usuario.
      timezone: resolveTimeZone(req),
    });

    res.json({ ...guardado, pushAvailable: pushDisponible() });
  } catch (error) {
    next(error);
  }
};

/** POST /water/push — registra el dispositivo para recibir avisos. */
export const subscribePush = async (req, res, next) => {
  try {
    if (!pushDisponible()) {
      return res.status(503).json({ error: 'Las notificaciones no están configuradas en el servidor' });
    }

    const guardada = await saveSubscription(
      req.user.id,
      req.body?.subscription,
      req.get('User-Agent')
    );

    if (!guardada) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    res.status(201).json({ ok: true, endpoint: guardada.endpoint });
  } catch (error) {
    next(error);
  }
};

/** DELETE /water/push — da de baja este dispositivo. */
export const unsubscribePush = async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ error: 'Falta el endpoint' });
    }

    await deleteSubscription(endpoint, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

/** POST /water/push/test — envía un aviso de prueba. */
export const testPush = async (req, res, next) => {
  try {
    if (!pushDisponible()) {
      return res.status(503).json({ error: 'Las notificaciones no están configuradas en el servidor' });
    }

    const resultado = await enviarPrueba(req.user.id);

    // Si no había ninguna suscripción, decirlo claramente en vez de un "ok"
    // que dejaría al usuario esperando un aviso que nunca llega.
    if (resultado.sent === 0 && resultado.removed === 0) {
      return res.status(409).json({
        error: 'Este dispositivo no está suscrito a las notificaciones',
      });
    }

    res.json(resultado);
  } catch (error) {
    next(error);
  }
};
