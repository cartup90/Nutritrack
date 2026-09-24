/**
 * Planificador de recordatorios de agua.
 *
 * ---------------------------------------------------------------------------
 * CÓMO FUNCIONA
 * ---------------------------------------------------------------------------
 * Cada minuto mira qué usuarios tienen recordatorios activos y comprueba si su
 * hora local coincide con alguna de las horas que eligieron. Si coincide y
 * todavía no llegaron a su meta, envía la notificación.
 *
 * Cada usuario se evalúa con SU zona horaria, así que a quien esté de viaje le
 * suena a la hora de su reloj, no a la del servidor.
 *
 * ---------------------------------------------------------------------------
 * DOS DETALLES QUE IMPORTAN
 * ---------------------------------------------------------------------------
 * 1. IDEMPOTENCIA. Si el proceso se reinicia justo en el minuto del aviso, o un
 *    barrido tarda más de un minuto, el mismo recordatorio podría dispararse dos
 *    veces. Antes de enviar se inserta una fila en `water_reminder_log`; si ya
 *    existía, no se envía. La clave primaria lo garantiza.
 *
 * 2. NO MOLESTAR SI YA BEBIÓ. Si el usuario ya alcanzó su meta, el aviso sobra.
 *    Se comprueba justo antes de enviar, no al arrancar el barrido, para que el
 *    dato sea lo más fresco posible.
 */
import { query } from '../config/database.js';
import { getUsersWithActiveReminders } from '../models/User.js';
import { getWaterTotalByDay } from '../models/WaterLog.js';
import { sendToUser } from './pushService.js';
import { DEFAULT_TIMEZONE, localClock, logicalDateOf } from '../utils/timezone.js';

/** Cada cuánto se revisa. Un minuto es la resolución de las horas 'HH:MM'. */
const INTERVALO_MS = 60 * 1000;

/**
 * Cuántos días de histórico de envíos se conservan.
 *
 * Solo sirve para no repetir avisos, así que no hace falta guardarlo todo. Se
 * limpia una vez al día para que la tabla no crezca sin fin.
 */
const DIAS_HISTORIAL = 30;

let temporizador = null;

/**
 * Reserva el envío de un recordatorio.
 * @returns {Promise<boolean>} false si ya se había enviado antes.
 */
const reclamarEnvio = async (userId, date, time) => {
  try {
    await query(
      `INSERT INTO water_reminder_log (user_id, reminder_date, reminder_time)
       VALUES ($1, $2, $3)`,
      [userId, date, time]
    );
    return true;
  } catch {
    // Clave duplicada: ya se envió. Es el caso normal, no un error.
    return false;
  }
};

/**
 * Un barrido: revisa a todos los usuarios con recordatorios activos.
 *
 * Se exporta para poder probarlo sin arrancar el temporizador.
 *
 * @param {Date} ahora - instante de referencia (inyectable en los tests)
 */
export const revisarRecordatorios = async (ahora = new Date()) => {
  const usuarios = await getUsersWithActiveReminders();

  let enviados = 0;
  let omitidosPorMeta = 0;

  for (const usuario of usuarios) {
    const tz = usuario.timezone || DEFAULT_TIMEZONE;
    const reloj = localClock(ahora, tz);
    const horas = Array.isArray(usuario.water_reminder_times)
      ? usuario.water_reminder_times
      : [];

    // El barrido corre cada minuto, así que como mucho coincide una hora.
    if (!horas.includes(reloj.time)) continue;

    // El día se deduce del instante evaluado (`ahora`), no del reloj real: así
    // todo el barrido es coherente con la misma referencia temporal y el
    // planificador se puede probar con una hora inyectada.
    const date = logicalDateOf(ahora, tz);
    const total = await getWaterTotalByDay(usuario.id, date, { timeZone: tz });
    const goal = Number(usuario.water_goal_ml) || 2000;
    const bebido = Number(total.total_ml) || 0;

    if (bebido >= goal) {
      omitidosPorMeta += 1;
      continue;
    }

    if (!(await reclamarEnvio(usuario.id, reloj.date, reloj.time))) continue;

    await sendToUser(usuario.id, {
      title: 'Hora de beber agua 💧',
      body: `Te faltan ${goal - bebido} ml para llegar a tu meta de hoy.`,
      tag: 'nutritrack-agua',
      url: '/',
    });

    enviados += 1;
  }

  return { revisados: usuarios.length, enviados, omitidosPorMeta };
};

/** Borra el histórico antiguo. No afecta a la corrección, solo al tamaño. */
const limpiarHistorial = async () => {
  try {
    await query(
      `DELETE FROM water_reminder_log
        WHERE reminder_date < CURRENT_DATE - ($1 || ' days')::interval`,
      [DIAS_HISTORIAL]
    );
  } catch (error) {
    console.error('[recordatorios] no se pudo limpiar el histórico:', error.message);
  }
};

/**
 * Arranca el planificador.
 *
 * No arranca en los tests: dejaría un temporizador vivo y los tests no deben
 * depender del reloj real.
 */
export const startReminderScheduler = () => {
  if (temporizador) return null;
  if (process.env.NODE_ENV === 'test') return null;
  if (process.env.WATER_REMINDERS_ENABLED === 'false') {
    console.log('ℹ️  Recordatorios de agua desactivados por configuración');
    return null;
  }

  let ultimaLimpieza = null;

  temporizador = setInterval(async () => {
    try {
      const resultado = await revisarRecordatorios();

      if (resultado.enviados > 0) {
        console.log(
          `💧 Recordatorios: ${resultado.enviados} enviado(s) de ${resultado.revisados} usuario(s)`
        );
      }

      // Una limpieza al día basta
      const hoy = new Date().toISOString().slice(0, 10);
      if (ultimaLimpieza !== hoy) {
        ultimaLimpieza = hoy;
        await limpiarHistorial();
      }
    } catch (error) {
      // Un fallo del planificador NUNCA debe tumbar la API.
      console.error('[recordatorios] error en el barrido:', error.message);
    }
  }, INTERVALO_MS);

  // No bloquea el cierre del proceso
  temporizador.unref?.();

  console.log('⏰ Planificador de recordatorios de agua activo (cada minuto)');
  return temporizador;
};

/** Detiene el planificador (tests y apagado ordenado). */
export const stopReminderScheduler = () => {
  if (temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
};
