/**
 * Día lógico del usuario: zona horaria + corte de día.
 *
 * ---------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 * ---------------------------------------------------------------------------
 * El servidor, PostgreSQL y los contenedores corren en UTC. Al agrupar las
 * comidas con `created_at::date`, PostgreSQL usa SU zona horaria (UTC), así que
 * el día cambiaba a las 21:00 de Argentina (00:00 UTC). Lo que se comía después
 * quedaba archivado en la fecha siguiente y desaparecía del resumen del día:
 * el gráfico se "reseteaba" de golpe.
 *
 * Además había una segunda inconsistencia: el backend calculaba "hoy" con
 * `new Date().toISOString()` (UTC) mientras el navegador filtraba con
 * `toDateString()` (hora local). Los dos lados del mismo pantalla usaban días
 * distintos.
 *
 * ---------------------------------------------------------------------------
 * LA SOLUCIÓN
 * ---------------------------------------------------------------------------
 * 1. Agrupar SIEMPRE en la zona horaria del usuario, que el navegador envía en
 *    la cabecera `X-Timezone` (zona IANA, p. ej. 'America/Argentina/Buenos_Aires').
 *    Si falta o no es válida, se usa APP_TIMEZONE.
 * 2. Aplicar un CORTE DE DÍA configurable con DAY_START_HOUR. Con el valor 1 el
 *    día cambia a la 01:00, de modo que una comida a las 00:30 sigue contando
 *    como la cena del día anterior. Es lo habitual en apps de nutrición, porque
 *    quien cena tarde no quiere que su cena aparezca en el día siguiente.
 *
 * El instante real de cada comida se sigue guardando en UTC (`created_at`), que
 * es lo correcto: solo cambia a qué día se asigna. Por eso este arreglo no
 * necesita migrar ningún dato existente.
 */

/** Zona horaria por defecto si el cliente no envía una válida. */
export const DEFAULT_TIMEZONE =
  process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

/**
 * Hora a la que empieza el día lógico (0-23).
 *
 * 0  -> el día cambia a medianoche local.
 * 1  -> el día cambia a la 01:00 local: lo comido entre las 00:00 y la 01:00
 *       cuenta todavía para el día anterior.
 */
const parseDayStartHour = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  const hora = Math.trunc(n);
  return hora >= 0 && hora <= 23 ? hora : 1;
};

export const DAY_START_HOUR = parseDayStartHour(process.env.DAY_START_HOUR);

/**
 * Comprueba que la zona horaria sea un identificador IANA que el runtime
 * reconozca.
 *
 * No es solo validación: este valor llega del cliente y acaba como parámetro de
 * una consulta SQL (`AT TIME ZONE $n`). Va ligado como parámetro, así que no
 * hay inyección posible, pero una zona inválida haría fallar la consulta con un
 * error 500. Validarla aquí lo convierte en un fallback silencioso y seguro.
 */
export const isValidTimeZone = (tz) => {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Deduce la zona horaria del usuario a partir de la petición. */
export const resolveTimeZone = (req) => {
  const cabecera =
    (typeof req?.get === 'function' ? req.get('X-Timezone') : null) ??
    req?.headers?.['x-timezone'];

  return isValidTimeZone(cabecera) ? cabecera : DEFAULT_TIMEZONE;
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * Devuelve las partes de fecha y hora de un instante EN una zona horaria dada.
 *
 * Se usa `formatToParts` en lugar de construir un Date porque un Date siempre
 * representa un instante absoluto: lo que necesitamos es "qué hora marca el
 * reloj de pared del usuario", y eso solo lo da el formateador.
 */
const partesEnZona = (instant, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const partes = {};
  for (const { type, value } of fmt.formatToParts(instant)) {
    partes[type] = value;
  }

  // Algunos runtimes devuelven '24' para la medianoche con hour12:false.
  const hora = Number(partes.hour) % 24;

  return {
    year: Number(partes.year),
    month: Number(partes.month),
    day: Number(partes.day),
    hour: Number.isFinite(hora) ? hora : 0,
    minute: Number(partes.minute),
  };
};

/**
 * Día lógico ('YYYY-MM-DD') al que pertenece un instante.
 *
 * Si la hora local es anterior al corte, el instante pertenece al día anterior.
 */
export const logicalDateOf = (
  instant = new Date(),
  timeZone = DEFAULT_TIMEZONE,
  dayStartHour = DAY_START_HOUR
) => {
  const { year, month, day, hour } = partesEnZona(instant, timeZone);
  const ymd = `${year}-${pad(month)}-${pad(day)}`;

  return hour < dayStartHour ? addDays(ymd, -1) : ymd;
};

/** Día lógico actual del usuario. Reemplaza al antiguo `todayStr()` en UTC. */
export const today = (
  timeZone = DEFAULT_TIMEZONE,
  dayStartHour = DAY_START_HOUR
) => logicalDateOf(new Date(), timeZone, dayStartHour);

/**
 * Reloj de pared del usuario en un instante: fecha local y hora 'HH:MM'.
 *
 * Se usa para los recordatorios, que van por hora de reloj y NO por el día
 * lógico: si alguien pone un aviso a las 00:30, quiere que suene a las 00:30
 * aunque esa comida cuente para el día anterior.
 *
 * Devuelve además `minutes`, que es lo que compara el planificador.
 */
export const localClock = (instant = new Date(), timeZone = DEFAULT_TIMEZONE) => {
  const { year, month, day, hour, minute } = partesEnZona(instant, timeZone);

  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    minutes: hour * 60 + minute,
  };
};

/**
 * Suma (o resta) días a una fecha 'YYYY-MM-DD'.
 *
 * Se opera en UTC a propósito: son fechas de calendario sin hora, y usar la
 * zona local haría que un cambio de horario de verano moviera el resultado.
 */
export const addDays = (ymd, days) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/** Comprueba que un valor sea una fecha 'YYYY-MM-DD' real. */
export const isYmd = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

/**
 * Desfase (en ms) de una zona horaria en un instante concreto.
 *
 * Se obtiene formateando el instante EN esa zona y volviendo a leer el
 * resultado como si fuera UTC: la diferencia es el desfase. Es la forma
 * estándar de hacerlo sin librerías, y respeta el horario de verano porque se
 * evalúa en el instante exacto que se le pasa.
 */
const desfaseZonaMs = (instant, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const p = {};
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value;

  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );

  return comoUtc - instant.getTime();
};

/**
 * Convierte una hora de reloj de pared ('YYYY-MM-DD' + hora) de una zona
 * horaria al instante UTC real.
 */
export const zonedTimeToUtc = (ymd, hour, timeZone) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const comoSiFueraUtc = Date.UTC(y, m - 1, d, hour, 0, 0, 0);

  // El desfase se evalúa primero sobre una estimación y luego se corrige: en
  // los cambios de horario de verano la estimación puede caer del otro lado del
  // salto, y esta segunda pasada lo resuelve.
  const estimacion = new Date(comoSiFueraUtc);
  const corregido = comoSiFueraUtc - desfaseZonaMs(estimacion, timeZone);
  const ajuste = comoSiFueraUtc - desfaseZonaMs(new Date(corregido), timeZone);

  return new Date(ajuste);
};

/**
 * Instantes UTC que delimitan un día lógico: [inicio, fin).
 *
 * Es la pieza que permite filtrar en SQL sin `AT TIME ZONE`. PostgreSQL no
 * necesitaba esa función, pero pg-mem (la base en memoria de los tests) no la
 * implementa, y calcular el rango en JavaScript es mejor de todos modos:
 * la comparación `created_at >= $1 AND created_at < $2` puede usar el índice de
 * `created_at`, mientras que `created_at::date = $1` obligaba a recorrer la
 * tabla entera.
 */
export const dayRangeUtc = (
  ymd,
  timeZone = DEFAULT_TIMEZONE,
  dayStartHour = DAY_START_HOUR
) => ({
  start: zonedTimeToUtc(ymd, dayStartHour, timeZone),
  end: zonedTimeToUtc(addDays(ymd, 1), dayStartHour, timeZone),
});
