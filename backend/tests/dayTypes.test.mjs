/**
 * Tests de los tipos de día y del cálculo de objetivos por día.
 *
 * Son funciones puras: el camino completo por la API se prueba en
 * `api.test.mjs`. Aquí interesa el detalle de la regla: qué día hereda el
 * patrón, cuánto baja el gasto en descanso y qué pasa en los bordes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_TYPES,
  dayTypeLabel,
  isOverridableDayType,
  normalizePattern,
  resolveDayType,
} from '../src/utils/dayTypes.js';
import { calculateGoals } from '../src/utils/nutrition.js';

// 2026-09-21 es lunes: 0 = lunes, 1 = martes, …
const LUNES = '2026-09-21';
const MARTES = '2026-09-22';
const MIERCOLES = '2026-09-23';

/** Perfil de ejemplo: hombre, 40 años, 185 cm, 95 kg, activo, bajar de peso. */
const PERFIL = {
  age: 40,
  gender: 'male',
  height: 185,
  weight: 95,
  activity_level: 'active',
  goal: 'lose_weight',
  goal_intensity: 'moderate',
};

test('Tipos de día: solo se pueden marcar los tres de entrenamiento/descanso', () => {
  assert.equal(isOverridableDayType('rest'), true);
  assert.equal(isOverridableDayType('strength'), true);
  assert.equal(isOverridableDayType('aerobic'), true);
  assert.equal(isOverridableDayType('normal'), false, 'normal es la ausencia de marca');
  assert.equal(isOverridableDayType('otro'), false);
  assert.equal(isOverridableDayType(null), false);
});

test('Tipos de día: el patrón se sanea (claves y valores inválidos fuera)', () => {
  const pattern = normalizePattern({
    0: 'rest',
    1: 'strength',
    2: 'foo', // tipo inventado
    7: 'aerobic', // día que no existe
    lunes: 'rest', // clave que no es un día
  });

  assert.deepEqual(pattern, { 0: 'rest', 1: 'strength' });
  assert.deepEqual(normalizePattern(null), {});
  assert.deepEqual(normalizePattern([1, 2, 3]), {});
});

test('Tipos de día: la marca de la fecha manda sobre el patrón', () => {
  const pattern = { 0: 'rest', 1: 'strength' };

  assert.equal(resolveDayType(LUNES, { pattern }), 'rest');
  assert.equal(resolveDayType(MARTES, { pattern }), 'strength');
  assert.equal(resolveDayType(MIERCOLES, { pattern }), 'normal', 'sin dato → normal');

  // Una excepción puntual gana: moví el entrenamiento del martes al miércoles
  assert.equal(
    resolveDayType(MARTES, { pattern, overrides: { [MARTES]: 'rest' } }),
    'rest'
  );
});

test('Tipos de día: etiquetas sin romperse con valores desconocidos', () => {
  assert.equal(dayTypeLabel('rest'), 'Descanso');
  assert.equal(dayTypeLabel('strength'), 'Fuerza');
  assert.equal(dayTypeLabel('aerobic'), 'Aeróbico');
  assert.equal(dayTypeLabel(undefined), 'Automático');
});

test('Objetivos: en descanso el gasto baja el EAT y el objetivo también', () => {
  const normal = calculateGoals(PERFIL);
  const descanso = calculateGoals(PERFIL, { dayType: 'rest' });
  const fuerza = calculateGoals(PERFIL, { dayType: 'strength' });
  const aerobico = calculateGoals(PERFIL, { dayType: 'aerobic' });

  // Fuerza y normal son iguales a propósito: la actividad declarada ya incluye
  // los entrenamientos. La diferencia está en el descanso.
  assert.equal(fuerza.burn, normal.burn);
  assert.equal(fuerza.calorieGoal, normal.calorieGoal);

  // En descanso se quita todo el EAT: el gasto baja exactamente eso.
  assert.ok(descanso.burn < normal.burn, 'el día de descanso gasta menos');
  assert.equal(descanso.burn, normal.burn - normal.eatBaseKcal);
  assert.ok(
    descanso.calorieGoal < normal.calorieGoal,
    'y el objetivo acompaña (es el ciclado de calorías)'
  );

  // El aeróbico gasta un poco más que la media.
  assert.ok(aerobico.burn > normal.burn);
  assert.ok(aerobico.calorieGoal >= normal.calorieGoal);

  // Lo que se muestra: etiqueta y EAT aplicado
  assert.equal(descanso.dayType, 'rest');
  assert.equal(descanso.dayTypeLabel, 'Descanso');
  assert.equal(descanso.eatAppliedKcal, 0);
  assert.equal(normal.eatAppliedKcal, normal.eatBaseKcal);
  assert.equal(descanso.breakdown.eat, 0, 'el reparto también lo refleja');
});

test('Objetivos: el ciclado se nota en el objetivo diario (ejemplo del pedido)', () => {
  const normal = calculateGoals(PERFIL);
  const descanso = calculateGoals(PERFIL, { dayType: 'rest' });

  const diferencia = normal.calorieGoal - descanso.calorieGoal;

  // La diferencia es el EAT del perfil multiplicado por el factor del objetivo:
  // con este perfil (activo, 95 kg) ronda las 465 kcal, y escala con el tamaño
  // corporal y la actividad declarada.
  assert.ok(
    diferencia > 150 && diferencia < 600,
    `la diferencia entre entreno y descanso debería notarse (fue ${diferencia})`
  );
});

test('Objetivos: el suelo de seguridad también se aplica en descanso', () => {
  // Perfil menudo con un objetivo agresivo: el suelo clínico tiene que frenar
  const menudo = {
    age: 25,
    gender: 'female',
    height: 150,
    weight: 45,
    activity_level: 'sedentary',
    goal: 'lose_weight',
    goal_intensity: 'aggressive',
  };

  for (const dayType of Object.keys(DAY_TYPES)) {
    const goals = calculateGoals(menudo, { dayType });
    assert.ok(goals.calorieGoal >= 1200, `suelo clínico con ${dayType}`);
  }
});
