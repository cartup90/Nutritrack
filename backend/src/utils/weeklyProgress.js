/**
 * Progreso semanal (lunes a domingo) y estimación de peso perdido.
 *
 * ---------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 * ---------------------------------------------------------------------------
 * Sumar las calorías de la semana a secas da un número mentiroso: si un día no
 * se cargaron las comidas, ese día aporta unas pocas calorías y el déficit de
 * la semana se dispara como si el usuario hubiera ayunado sin querer.
 *
 * Por eso la semana se cuenta en dos pasos:
 *   1. Se calcula una referencia con los días que SÍ tienen carga.
 *   2. Un día que queda muy por debajo de esa referencia se descarta (se
 *      supone que faltó cargar), SALVO que el usuario lo haya marcado como
 *      ayuno: ahí el día es intencional y sí cuenta.
 *
 * ---------------------------------------------------------------------------
 * CONTRA QUÉ SE MIDE EL DÉFICIT
 * ---------------------------------------------------------------------------
 * El déficit NO se mide contra el objetivo calórico (que ya incluye el déficit
 * del plan), sino contra el GASTO ESTIMADO (el TDEE de Mifflin-St Jeor, que ya
 * calcula el perfil): `déficit = gasto − consumido`.
 *
 * Con el objetivo como referencia, alguien que sigue su plan al pie de la letra
 * vería "0 kcal perdidas", que es justo lo contrario de lo que pasó. Medido
 * contra el gasto, una semana en objetivo muestra el déficit real del plan
 * (≈ 500 kcal/día × 7 = 3.500 kcal ≈ 0,45 kg).
 *
 * La equivalencia energética es la estándar en nutrición: 1 kg de grasa corporal
 * ≈ 7.700 kcal. Es una ESTIMACIÓN: el gasto real varía, el agua y el glucógeno
 * mueven la balanza y el cuerpo se adapta al déficit. Se muestra como tal.
 */
import { addDays } from './timezone.js';

/** Equivalencia energética de la grasa corporal: kcal por kg. */
export const KCAL_POR_KG_GRASA = 7700;

/**
 * Un día por debajo de este porcentaje de la referencia se considera una carga
 * incompleta y no suma a la semana.
 *
 * 0,6 = 60 %. Con una referencia de 2.200 kcal, el umbral queda en 1.320 kcal:
 * un día de 900 kcal no cuenta, uno de 1.800 sí.
 */
export const RATIO_DIA_INCOMPLETO = 0.6;

/**
 * Días contados a partir de los cuales la estimación de peso se muestra como
 * fiable. Con menos, la interfaz avisa de que es orientativa: dos días no son
 * una semana.
 */
export const DIAS_MINIMOS_ESTIMACION = 3;

/** Nombres de los días, empezando en lunes (índice 0). */
export const NOMBRES_DIAS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

const soloFecha = (value) => String(value ?? '').slice(0, 10);

/**
 * Lunes y domingo de la semana que contiene `date`.
 *
 * La semana empieza en lunes a propósito: es lo que pidió el usuario y además
 * es el calendario habitual en Argentina.
 *
 * @param {string} date - 'YYYY-MM-DD' de cualquier día de la semana
 */
export const weekRangeOf = (date) => {
  const ymd = soloFecha(date);
  const [y, m, d] = ymd.split('-').map(Number);

  // getUTCDay(): 0 = domingo. Se desplaza para que 0 = lunes.
  const diaSemana = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const startDate = addDays(ymd, -diaSemana);

  return { startDate, endDate: addDays(startDate, 6) };
};

/** Nombre del día de la semana de una fecha 'YYYY-MM-DD'. */
export const weekdayOf = (date) => {
  const [y, m, d] = soloFecha(date).split('-').map(Number);
  return NOMBRES_DIAS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};

/** Mediana: a diferencia del promedio, un día suelto raro no la mueve. */
export const median = (values) => {
  if (!values.length) return 0;

  const ordenados = [...values].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);

  return ordenados.length % 2
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const redondear = (value) => Math.round(num(value));

/**
 * Calcula el progreso de la semana.
 *
 * @param {object}   params
 * @param {Array}    params.series       - días de lunes a domingo con
 *                                         { date, entryCount, calories, protein, carbs, fats }
 * @param {string[]} params.fastingDates - días marcados como ayuno ('YYYY-MM-DD')
 * @param {object}   params.goals        - salida de calculateGoals() (o null)
 * @param {string}   params.today        - día lógico del usuario ('YYYY-MM-DD').
 *                                         Los días posteriores no cuentan.
 */
export const computeWeeklyProgress = ({
  series = [],
  fastingDates = [],
  goals = null,
  today = null,
} = {}) => {
  const hoy = today ? soloFecha(today) : null;
  const ayunos = new Set(fastingDates.map(soloFecha));

  const calorieGoal = num(goals?.calorieGoal);
  const tdee = num(goals?.tdee);

  // Gasto estimado: es la referencia del déficit. Si el perfil está incompleto
  // (calculateGoals devuelve null) no hay estimación posible.
  const gastoEstimado = tdee || calorieGoal;

  // --- 1. Clasificación inicial de cada día --------------------------------
  const days = series.map((dia) => {
    const date = soloFecha(dia.date);
    const entryCount = num(dia.entryCount);
    const calories = num(dia.calories);

    const isFuture = Boolean(hoy && date > hoy);
    const isFasting = ayunos.has(date);

    // Un día de ayuno cuenta siempre (ese es justamente el punto); el resto de
    // los días con carga se deciden más abajo, contra la referencia.
    const counted = isFasting && !isFuture;

    return {
      date,
      weekday: weekdayOf(date),
      entryCount,
      calories: redondear(calories),
      protein: redondear(dia.protein),
      carbs: redondear(dia.carbs),
      fats: redondear(dia.fats),
      isFasting,
      isFuture,
      counted,
      reason: isFuture
        ? 'futuro'
        : isFasting
          ? 'ayuno'
          : entryCount > 0
            ? 'pendiente'
            : 'sin_registro',
    };
  });

  // --- 2. Referencia y umbral ----------------------------------------------
  const conDatos = days.filter(
    (d) => !d.isFuture && !d.isFasting && d.entryCount > 0
  );

  const mediana = median(conDatos.map((d) => d.calories));

  /**
   * Con tres días o más cargados, la mediana es una buena referencia: es
   * robusta y un día flojo no la arrastra.
   *
   * Con uno o dos días, la mediana ES prácticamente el propio valor y no
   * distingue nada, así que se usa el objetivo diario ("lo que debería haber
   * comido"). Sin objetivo, se cae en la mediana y, sin ningún dato, no hay
   * referencia que aplicar.
   */
  const referenceSource =
    conDatos.length >= 3
      ? 'mediana'
      : conDatos.length > 0 && calorieGoal > 0
        ? 'objetivo'
        : conDatos.length > 0
          ? 'mediana'
          : 'sin_datos';

  const dailyReference =
    referenceSource === 'objetivo' ? calorieGoal : mediana;

  const incompleteThreshold = redondear(dailyReference * RATIO_DIA_INCOMPLETO);

  // --- 3. Decidir los días que quedaron pendientes -------------------------
  for (const dia of days) {
    if (dia.reason !== 'pendiente') continue;

    // Sin referencia (perfil incompleto y sin datos) no se descarta nada: es
    // preferible contar de más que vaciarle la semana al usuario.
    const cuenta = incompleteThreshold > 0 ? dia.calories >= incompleteThreshold : true;

    dia.counted = cuenta;
    dia.reason = cuenta ? 'ok' : 'incompleto';
  }

  // --- 4. Totales ----------------------------------------------------------
  const contados = days.filter((d) => d.counted);
  const conAyuno = contados.filter((d) => d.isFasting);

  const consumido = contados.reduce((acc, d) => acc + d.calories, 0);
  const esperado = gastoEstimado * contados.length;

  // Sin perfil completo no hay gasto estimado: el balance queda en 0 en vez de
  // inventarse un superávit igual a todo lo comido. La interfaz usa
  // `estimate.canEstimate` para pedir que se complete el perfil.
  const balance = gastoEstimado > 0 ? esperado - consumido : 0;
  const deficitKcal = Math.max(balance, 0);
  const surplusKcal = Math.max(-balance, 0);

  // Negativo = se perdió peso. Los ayunos no entran en el promedio porque
  // bajarían la media de lo que come en un día normal.
  const paraPromedio = contados.filter((d) => !d.isFasting);
  const promedio = (clave) =>
    paraPromedio.length
      ? redondear(
          paraPromedio.reduce((acc, d) => acc + num(d[clave]), 0) /
            paraPromedio.length
        )
      : 0;

  const contar = (motivo) => days.filter((d) => d.reason === motivo).length;
  const puedeEstimar = gastoEstimado > 0 && contados.length > 0;

  return {
    days,
    reference: {
      /** 'mediana' | 'objetivo' | 'sin_datos' — de dónde salió la referencia */
      source: referenceSource,
      dailyReference: redondear(dailyReference),
      incompleteRatio: RATIO_DIA_INCOMPLETO,
      /** Por debajo de estas kcal el día se descarta (si no es ayuno) */
      incompleteThreshold,
      /** Gasto estimado del perfil (TDEE): contra esto se mide el déficit */
      estimatedBurn: redondear(gastoEstimado),
      calorieGoal: redondear(calorieGoal),
      kcalPerKg: KCAL_POR_KG_GRASA,
      minDaysForEstimate: DIAS_MINIMOS_ESTIMACION,
    },
    totals: {
      daysInWeek: days.length,
      countedDays: contados.length,
      fastingCountedDays: conAyuno.length,
      /** Días descartados por carga incompleta */
      skippedDays: contar('incompleto'),
      /** Días sin ningún registro */
      missingDays: contar('sin_registro'),
      futureDays: contar('futuro'),
      loggedDays: days.filter((d) => !d.isFuture && d.entryCount > 0).length,
      consumedKcal: redondear(consumido),
      expectedKcal: redondear(esperado),
      /** gasto − consumido: positivo = déficit */
      balanceKcal: redondear(balance),
      deficitKcal: redondear(deficitKcal),
      surplusKcal: redondear(surplusKcal),
    },
    averages: {
      calories: promedio('calories'),
      protein: promedio('protein'),
      carbs: promedio('carbs'),
      fats: promedio('fats'),
      /** Sobre cuántos días se promedió (los contados, sin los ayunos) */
      overDays: paraPromedio.length,
    },
    estimate: {
      kcalPerKg: KCAL_POR_KG_GRASA,
      /** Negativo = peso perdido; positivo = peso ganado */
      weightChangeKg: Number((-balance / KCAL_POR_KG_GRASA).toFixed(2)),
      deficitKcal: redondear(deficitKcal),
      surplusKcal: redondear(surplusKcal),
      /** Con pocos días contados la estimación es solo orientativa */
      reliable: contados.length >= DIAS_MINIMOS_ESTIMACION,
      countedDays: contados.length,
      canEstimate: puedeEstimar,
    },
  };
};
