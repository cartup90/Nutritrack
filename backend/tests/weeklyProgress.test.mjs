/**
 * Tests del cálculo del progreso semanal.
 *
 * Es una función pura y es donde vive la regla que pidió el usuario: un día con
 * muy pocas calorías no suma a la semana (se supone que faltó cargar comidas)
 * salvo que esté marcado como ayuno. Se prueba aquí, sin pasar por la API, para
 * poder cubrir los bordes (referencias, días futuros, perfil incompleto…) sin
 * montar una semana entera en la base.
 *
 * Ejecutar con:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_MINIMOS_ESTIMACION,
  KCAL_POR_KG_GRASA,
  computeWeeklyProgress,
  median,
  weekRangeOf,
  weekdayOf,
} from '../src/utils/weeklyProgress.js';
import { addDays } from '../src/utils/timezone.js';

// 2026-09-21 es lunes: la semana de prueba va del 21 al 27 de septiembre.
const LUNES = '2026-09-21';
const DOMINGO = '2026-09-27';

/** Objetivos de un perfil tipo: objetivo 2.200, gasto estimado 2.750. */
const GOALS = { calorieGoal: 2200, tdee: 2750 };

const dia = (date, calories, entryCount = 1, extra = {}) => ({
  date,
  calories,
  entryCount,
  protein: 0,
  carbs: 0,
  fats: 0,
  ...extra,
});

/** Serie de la semana con los días que se indiquen cargados. */
const semana = (porDia = {}) =>
  Array.from({ length: 7 }, (_, i) => {
    const fecha = addDays(LUNES, i);
    const kcal = porDia[fecha];

    return kcal === undefined ? dia(fecha, 0, 0) : dia(fecha, kcal);
  });

const buscar = (resultado, fecha) =>
  resultado.days.find((d) => d.date === fecha);

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------
test('Semana: el rango va de lunes a domingo', () => {
  const rango = weekRangeOf('2026-09-23'); // miércoles

  assert.equal(rango.startDate, LUNES);
  assert.equal(rango.endDate, DOMINGO);

  // Cualquier día de la semana devuelve la misma semana
  assert.deepEqual(weekRangeOf(DOMINGO), rango);
  assert.equal(weekRangeOf('2026-09-28').startDate, '2026-09-28', 'el lunes abre semana nueva');
});

test('Semana: nombra los días en español y en orden', () => {
  assert.equal(weekdayOf(LUNES), 'lunes');
  assert.equal(weekdayOf('2026-09-26'), 'sábado');
  assert.equal(weekdayOf(DOMINGO), 'domingo');
});

test('Semana: la mediana no se deja arrastrar por un día raro', () => {
  assert.equal(median([2200, 2100, 900]), 2100);
  assert.equal(median([2200, 2100]), 2150);
  assert.equal(median([]), 0);
});

// ---------------------------------------------------------------------------
// La regla central: días con carga incompleta
// ---------------------------------------------------------------------------
test('Semana: un día muy por debajo de la referencia no suma', () => {
  const resultado = computeWeeklyProgress({
    // jueves 900 kcal contra una referencia de 2.150
    series: semana({
      [LUNES]: 2100,
      '2026-09-22': 2200,
      '2026-09-23': 2150,
      '2026-09-24': 900,
      '2026-09-25': 2300,
    }),
    goals: GOALS,
    today: DOMINGO,
  });

  assert.equal(resultado.reference.source, 'mediana');
  assert.equal(resultado.reference.dailyReference, 2150);
  assert.equal(resultado.reference.incompleteThreshold, 1290);

  const jueves = buscar(resultado, '2026-09-24');
  assert.equal(jueves.counted, false, 'el día flojo no suma');
  assert.equal(jueves.reason, 'incompleto');

  assert.equal(buscar(resultado, '2026-09-23').reason, 'ok');
  assert.equal(buscar(resultado, '2026-09-26').reason, 'sin_registro');

  assert.equal(resultado.totals.countedDays, 4);
  assert.equal(resultado.totals.skippedDays, 1);
  assert.equal(resultado.totals.missingDays, 2);
  assert.equal(resultado.totals.consumedKcal, 2100 + 2200 + 2150 + 2300);
  // El promedio solo mira los días que cuentan
  assert.equal(resultado.averages.calories, 2188);
  assert.equal(resultado.averages.overDays, 4);
});

test('Semana: el déficit se mide contra el gasto estimado y se pasa a kilos', () => {
  const resultado = computeWeeklyProgress({
    series: semana({
      [LUNES]: 2200,
      '2026-09-22': 2200,
      '2026-09-23': 2200,
      '2026-09-24': 2200,
      '2026-09-25': 2200,
      '2026-09-26': 2200,
      [DOMINGO]: 2200,
    }),
    goals: GOALS, // objetivo 2.200 = plan de −550 kcal/día sobre el gasto
    today: DOMINGO,
  });

  assert.equal(resultado.totals.countedDays, 7);

  assert.equal(resultado.totals.consumedKcal, 15400);
  assert.equal(resultado.totals.expectedKcal, 19250); // 2750 × 7
  assert.equal(resultado.totals.deficitKcal, 3850);
  assert.equal(resultado.totals.surplusKcal, 0);

  // 3.850 / 7.700 = 0,5 kg perdidos (negativo = se perdió peso)
  assert.equal(resultado.estimate.weightChangeKg, -0.5);
  assert.equal(resultado.estimate.reliable, true);
  assert.equal(resultado.estimate.canEstimate, true);
  assert.equal(KCAL_POR_KG_GRASA, 7700);
});

test('Semana: comer por encima del gasto da superávit, no déficit', () => {
  const resultado = computeWeeklyProgress({
    series: semana({
      [LUNES]: 3200,
      '2026-09-22': 3100,
      '2026-09-23': 3300,
    }),
    goals: GOALS,
    today: DOMINGO,
  });

  assert.equal(resultado.totals.countedDays, 3);
  assert.equal(resultado.totals.deficitKcal, 0);
  assert.equal(resultado.totals.surplusKcal, 1350); // 9600 − 8250
  assert.equal(resultado.estimate.weightChangeKg, 0.18);
  assert.equal(resultado.estimate.surplusKcal, 1350);
});

// ---------------------------------------------------------------------------
// Ayunos
// ---------------------------------------------------------------------------
test('Semana: un día marcado como ayuno suma aunque tenga pocas calorías', () => {
  const series = semana({
    [LUNES]: 2100,
    '2026-09-22': 2200,
    '2026-09-23': 2150,
    '2026-09-24': 900, // el mismo día flojo de antes
    '2026-09-25': 2300,
  });

  const sinAyuno = computeWeeklyProgress({ series, goals: GOALS, today: DOMINGO });
  const conAyuno = computeWeeklyProgress({
    series,
    fastingDates: ['2026-09-24'],
    goals: GOALS,
    today: DOMINGO,
  });

  const jueves = buscar(conAyuno, '2026-09-24');
  assert.equal(jueves.isFasting, true);
  assert.equal(jueves.counted, true, 'un ayuno voluntario sí cuenta');
  assert.equal(jueves.reason, 'ayuno');

  assert.equal(conAyuno.totals.countedDays, sinAyuno.totals.countedDays + 1);
  assert.equal(conAyuno.totals.fastingCountedDays, 1);
  assert.equal(conAyuno.totals.skippedDays, 0);
  assert.equal(conAyuno.totals.consumedKcal, sinAyuno.totals.consumedKcal + 900);

  // El ayuno no baja el promedio de lo que come en un día normal
  assert.equal(conAyuno.averages.overDays, 4);
  assert.equal(conAyuno.averages.calories, 2188);
});

test('Semana: un ayuno sin ninguna comida cargada cuenta como 0 kcal', () => {
  const resultado = computeWeeklyProgress({
    series: semana({ [LUNES]: 2200, '2026-09-22': 2200 }),
    fastingDates: ['2026-09-23', '2026-09-24'],
    goals: GOALS,
    today: DOMINGO,
  });

  const miercoles = buscar(resultado, '2026-09-23');
  assert.equal(miercoles.calories, 0);
  assert.equal(miercoles.entryCount, 0);
  assert.equal(miercoles.counted, true, 'sin comidas pero con ayuno marcado, cuenta');

  assert.equal(resultado.totals.countedDays, 4);
  assert.equal(resultado.totals.consumedKcal, 4400);
  assert.equal(resultado.totals.expectedKcal, 11000);
  assert.equal(resultado.totals.deficitKcal, 6600);
  assert.equal(resultado.estimate.weightChangeKg, -0.86);
});

// ---------------------------------------------------------------------------
// Bordes
// ---------------------------------------------------------------------------
test('Semana: los días que todavía no pasaron no cuentan', () => {
  const resultado = computeWeeklyProgress({
    series: semana({ [LUNES]: 2100, '2026-09-22': 2200, '2026-09-23': 2150 }),
    goals: GOALS,
    today: '2026-09-23', // miércoles: jueves a domingo son futuro
  });

  assert.equal(resultado.totals.futureDays, 4);
  assert.equal(buscar(resultado, '2026-09-24').reason, 'futuro');
  assert.equal(buscar(resultado, '2026-09-24').counted, false);
  assert.equal(resultado.totals.countedDays, 3);
  assert.equal(resultado.estimate.reliable, true, `${DIAS_MINIMOS_ESTIMACION} días ya son fiables`);
});

test('Semana: con un solo día cargado y flojo no se inventa un déficit', () => {
  // Sin tres días no hay mediana útil: la referencia pasa a ser el objetivo
  // diario, así que 900 kcal contra un objetivo de 2.200 se descarta.
  const resultado = computeWeeklyProgress({
    series: semana({ [LUNES]: 900 }),
    goals: GOALS,
    today: DOMINGO,
  });

  assert.equal(resultado.reference.source, 'objetivo');
  assert.equal(resultado.reference.dailyReference, 2200);
  assert.equal(resultado.reference.incompleteThreshold, 1320);
  assert.equal(buscar(resultado, LUNES).reason, 'incompleto');
  assert.equal(resultado.totals.countedDays, 0);
  assert.equal(resultado.estimate.canEstimate, false, 'sin días contados no hay estimación');
  assert.equal(resultado.estimate.weightChangeKg, 0);
});

test('Semana: con pocos días la estimación se marca como no fiable', () => {
  const resultado = computeWeeklyProgress({
    series: semana({ [LUNES]: 1800, '2026-09-22': 1900 }),
    goals: GOALS,
    today: DOMINGO,
  });

  assert.equal(resultado.totals.countedDays, 2);
  assert.equal(resultado.estimate.canEstimate, true);
  assert.equal(resultado.estimate.reliable, false, 'dos días no son una semana');
});

test('Semana: sin perfil no hay gasto ni estimación posible', () => {
  const resultado = computeWeeklyProgress({
    series: semana({ [LUNES]: 2000, '2026-09-22': 2100, '2026-09-23': 1900 }),
    goals: null,
    today: DOMINGO,
  });

  assert.equal(resultado.reference.estimatedBurn, 0);
  assert.equal(resultado.estimate.canEstimate, false);
  assert.equal(resultado.totals.balanceKcal, 0, 'no se inventa un superávit con todo lo comido');
  assert.equal(resultado.estimate.weightChangeKg, 0);
});

test('Semana: sin ningún dato la respuesta sigue siendo coherente', () => {
  const resultado = computeWeeklyProgress({
    series: semana(),
    goals: GOALS,
    today: DOMINGO,
  });

  assert.equal(resultado.reference.source, 'sin_datos');
  assert.equal(resultado.totals.countedDays, 0);
  assert.equal(resultado.totals.missingDays, 7);
  assert.equal(resultado.averages.calories, 0);
  assert.equal(resultado.days.length, 7);
});
