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
import { addDays, weekdayIndex } from './timezone.js';
import { dayTypeLabel } from './dayTypes.js';

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
  const startDate = addDays(ymd, -weekdayIndex(ymd));

  return { startDate, endDate: addDays(startDate, 6) };
};

/** Nombre del día de la semana de una fecha 'YYYY-MM-DD'. */
export const weekdayOf = (date) => NOMBRES_DIAS[weekdayIndex(date)];

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
 * Dos cuentas distintas, a propósito:
 *
 *   · **Déficit real** (`balanceKcal`): `Σ gasto del día − consumido`. Como cada
 *     día puede tener su propio gasto (un día de descanso gasta menos), la serie
 *     puede traer `burn` por día. Es de donde sale el peso estimado.
 *   · **Saldo contra el objetivo** (`goalBalanceKcal`): `Σ objetivo del día −
 *     consumido`. Es el "margen" que le queda al usuario: si un día se pasó
 *     150 kcal, al siguiente tiene 150 menos de margen. Cada día también puede
 *     traer su propio objetivo (`goal`).
 *
 * @param {object}   params
 * @param {Array}    params.series       - días de lunes a domingo con
 *                                         { date, entryCount, calories, protein, carbs, fats,
 *                                           goal?, burn?, dayType? }
 * @param {string[]} params.fastingDates - días marcados como ayuno ('YYYY-MM-DD')
 * @param {object}   params.goals        - salida de calculateGoals() (o null).
 *                                         Se usa como respaldo si la serie no
 *                                         trae el dato por día.
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

  // Gasto estimado de referencia: si el perfil está incompleto
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

    // Gasto y objetivo DEL DÍA (los pone el controlador según el tipo de día).
    // Si la serie no los trae, se usan los del perfil: así el cálculo también
    // sirve para llamadas antiguas y para los tests de la función pura.
    const goal = num(dia.goal) || calorieGoal;
    const burn = num(dia.burn) || gastoEstimado;
    const dayType = dia.dayType || 'normal';

    return {
      date,
      weekday: weekdayOf(date),
      entryCount,
      calories: redondear(calories),
      protein: redondear(dia.protein),
      carbs: redondear(dia.carbs),
      fats: redondear(dia.fats),
      dayType,
      dayTypeLabel: dayTypeLabel(dayType),
      /** Objetivo calórico de este día (según su tipo) */
      goal: redondear(goal),
      /** Gasto estimado de este día (según su tipo) */
      burn: redondear(burn),
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
  const futuros = days.filter((d) => d.isFuture);

  const consumido = contados.reduce((acc, d) => acc + d.calories, 0);

  // Gasto real de los días contados: cada día aporta el suyo (un día de
  // descanso gasta menos que uno de entrenamiento).
  const esperado = contados.reduce((acc, d) => acc + d.burn, 0);
  // Y el objetivo de esos mismos días: el presupuesto que tenía el usuario.
  const presupuesto = contados.reduce((acc, d) => acc + d.goal, 0);

  const hayGasto = gastoEstimado > 0 || esperado > 0;
  const hayObjetivo = presupuesto > 0;

  // Sin perfil completo no hay gasto estimado: el balance queda en 0 en vez de
  // inventarse un superávit igual a todo lo comido. La interfaz usa
  // `estimate.canEstimate` para pedir que se complete el perfil.
  const balance = hayGasto ? esperado - consumido : 0;
  const deficitKcal = Math.max(balance, 0);
  const surplusKcal = Math.max(-balance, 0);

  // Saldo contra el OBJETIVO (no contra el gasto): es el "margen" del usuario.
  // Positivo = le sobra margen; negativo = se pasó.
  const goalBalance = hayObjetivo ? presupuesto - consumido : 0;

  // Lo que queda de semana: presupuesto de los días futuros y cuánto toca por
  // día sumándole el margen acumulado. Es el "te quedan 1.200 kcal" del widget.
  const remainingBudgetKcal = futuros.reduce((acc, d) => acc + d.goal, 0);
  const remainingDays = futuros.length;
  const remainingAllowancePerDay =
    remainingDays > 0 && hayObjetivo
      ? Math.round((remainingBudgetKcal + goalBalance) / remainingDays)
      : null;

  // Adherencia: días contados que no se pasaron del objetivo (5 % de margen,
  // el mismo criterio que usa el historial para "días en objetivo").
  const daysOnGoal = contados.filter(
    (d) => d.goal > 0 && d.calories <= d.goal * 1.05
  ).length;

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
  const puedeEstimar = hayGasto && contados.length > 0;

  return {
    days,
    reference: {
      /** 'mediana' | 'objetivo' | 'sin_datos' — de dónde salió la referencia */
      source: referenceSource,
      dailyReference: redondear(dailyReference),
      incompleteRatio: RATIO_DIA_INCOMPLETO,
      /** Por debajo de estas kcal el día se descarta (si no es ayuno) */
      incompleteThreshold,
      /**
       * Gasto medio de los días contados: es la línea de referencia del gráfico.
       * Con tipos de día cada jornada gasta distinto, así que se usa la media.
       */
      estimatedBurn: contados.length
        ? redondear(esperado / contados.length)
        : redondear(gastoEstimado),
      /** Objetivo medio de los días contados */
      averageGoal: contados.length
        ? redondear(presupuesto / contados.length)
        : redondear(calorieGoal),
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

      // --- Saldo contra el objetivo (margen semanal) ---------------------
      /** Suma de los objetivos de los días contados */
      weeklyBudgetKcal: redondear(presupuesto),
      /** objetivo − consumido: positivo = margen a favor */
      goalBalanceKcal: redondear(goalBalance),
      /** Días que todavía no pasaron */
      remainingDays,
      /** Objetivos de esos días futuros */
      remainingBudgetKcal: redondear(remainingBudgetKcal),
      /** Margen por día para lo que queda (null si la semana terminó) */
      remainingAllowancePerDay,
      /** Días contados dentro del objetivo (±5 %) */
      daysOnGoal,
      adherencePct: contados.length
        ? Math.round((daysOnGoal / contados.length) * 100)
        : 0,
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
