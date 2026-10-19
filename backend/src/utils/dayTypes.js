/**
 * Tipos de día: entrenamiento (fuerza o aeróbico) y descanso.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE
 * ---------------------------------------------------------------------------
 * El perfil declara una actividad media ("moderado: entrenás 3-5 días"), y el
 * objetivo calórico sale de ahí. Pero el gasto real no es el mismo un día que
 * se entrena que uno de descanso: el componente EAT (ejercicio) de ese día
 * desaparece o se reduce.
 *
 * Con los tipos de día el usuario puede ciclar calorías: los días de
 * entrenamiento mantienen el gasto declarado y los de descanso bajan el EAT a 0
 * (y con él el objetivo). Es lo que hace que una semana de 3 entrenamientos no
 * se presupueste como si fueran 7.
 *
 * El patrón semanal (`training_pattern`, en la tabla `users`) es el valor por
 * defecto de cada día de la semana; `day_types` guarda las excepciones por fecha
 * (por ejemplo, moví el entrenamiento del miércoles al jueves).
 *
 * Sin patrón y sin excepción el día es 'normal': la actividad declarada, es
 * decir, exactamente el comportamiento anterior. Quien no use la función no ve
 * ningún cambio en sus números.
 */
import { weekdayIndex } from './timezone.js';

/**
 * Tipos válidos.
 *
 * `eatFactor` multiplica el EAT del perfil. El "normal" y el "fuerza" coinciden
 * a propósito: la actividad declarada ya incluye los entrenamientos, así que
 * forzar "fuerza" no inventa un gasto extra. La diferencia real está en los días
 * de descanso, que es lo que el usuario viene a marcar.
 *
 * `aerobic` suma un 20 % de EAT: el cardio de una sesión gasta algo más en el
 * momento que una sesión de fuerza (que compensa en parte con EPOC).
 */
export const DAY_TYPES = {
  normal: {
    label: 'Automático',
    short: 'Auto',
    eatFactor: 1,
    description: 'Sigue tu patrón semanal y tu actividad declarada',
  },
  rest: {
    label: 'Descanso',
    short: 'Descanso',
    eatFactor: 0,
    description: 'Sin entrenamiento: el gasto y el objetivo bajan',
  },
  strength: {
    label: 'Fuerza',
    short: 'Fuerza',
    eatFactor: 1,
    description: 'Entrenamiento de fuerza',
  },
  aerobic: {
    label: 'Aeróbico',
    short: 'Aeróbico',
    eatFactor: 1.2,
    description: 'Cardio: gasta un poco más que la media',
  },
};

/** Tipos que se pueden marcar a mano en una fecha. */
export const OVERRIDABLE_DAY_TYPES = ['rest', 'strength', 'aerobic'];

/** ¿Es un tipo que se puede guardar en una fecha? */
export const isOverridableDayType = (value) =>
  OVERRIDABLE_DAY_TYPES.includes(value);

/** Etiqueta legible de un tipo, sin romperse con valores desconocidos. */
export const dayTypeLabel = (value) =>
  DAY_TYPES[value]?.label || DAY_TYPES.normal.label;

/**
 * Aplana el patrón guardado a `{ 0..6: 'rest'|'strength'|'aerobic' }`.
 *
 * Se ignoran claves y valores inválidos: el patrón viene de la base y de un
 * formulario, así que se sanea aquí una sola vez.
 */
export const normalizePattern = (raw) => {
  const pattern = {};

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return pattern;

  for (let dia = 0; dia < 7; dia += 1) {
    // JSONB puede llegar con la clave como número o como string ('0').
    const value = raw[dia] ?? raw[String(dia)];
    if (isOverridableDayType(value)) pattern[dia] = value;
  }

  return pattern;
};

/**
 * Tipo de día que le toca a una fecha.
 *
 * Prioridad: la marca suelta de esa fecha > el patrón semanal > 'normal'.
 *
 * @param {string} date - 'YYYY-MM-DD' (día lógico)
 * @param {object} options
 * @param {object} options.pattern   - patrón ya normalizado (0 = lunes)
 * @param {object} options.overrides - mapa { 'YYYY-MM-DD': tipo }
 */
export const resolveDayType = (date, { pattern = {}, overrides = {} } = {}) => {
  const override = overrides[date];
  if (isOverridableDayType(override)) return override;

  const delPatron = pattern[weekdayIndex(date)];
  return isOverridableDayType(delPatron) ? delPatron : 'normal';
};

/** Fuerza bruta del tipo de día aplicado a un gasto (para tests y UI). */
export const eatFactorOf = (type) => DAY_TYPES[type]?.eatFactor ?? 1;
