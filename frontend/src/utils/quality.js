/**
 * Calidad nutricional: niveles de micronutrientes y puntuación del plato/día.
 *
 * Es una heurística transparente y orientativa, NO un consejo médico. Sirve
 * para que el usuario vea de un vistazo si una comida (o su día) se pasa de
 * sodio o azúcares y si aporta fibra.
 *
 * Referencias usadas (valores orientativos de salud pública, por DÍA):
 *   · Fibra    ≥ 25 g  (más es mejor)
 *   · Azúcares < 50 g  (menos es mejor)
 *   · Sodio    < 2300 mg (menos es mejor)
 *
 * Para "un plato" se usan referencias por comida (≈ 1/3 del día).
 */

const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));

/** Referencias estándar diarias (orientativas). */
export const DAILY_REFERENCES = {
  fiber: 25,
  sugars: 50,
  sodium: 2300,
};

/** Referencias aproximadas por plato (≈ 1/3 del día). */
export const DISH_REFERENCES = {
  fiber: 8,
  sugars: 25,
  sodium: 800,
};

const unit = (type) => (type === 'sodium' ? 'mg' : 'g');

/**
 * Nivel de un micronutriente respecto a su referencia.
 *
 * @param {number} value
 * @param {'fiber'|'sugars'|'sodium'} type
 * @param {'dish'|'day'} scope
 * @returns {{ level: string, tone: 'good'|'warn'|'bad', label: string, ratio: number }}
 */
export const microLevel = (value, type, scope = 'dish') => {
  const ref = (scope === 'day' ? DAILY_REFERENCES : DISH_REFERENCES)[type];
  const v = Number(value) || 0;
  const ratio = ref ? v / ref : 0;

  if (type === 'fiber') {
    // Más es mejor
    if (ratio >= 0.8) return { level: 'bueno', tone: 'good', label: 'Bueno', ratio };
    if (ratio >= 0.4) return { level: 'medio', tone: 'warn', label: 'Regular', ratio };
    return { level: 'bajo', tone: 'bad', label: 'Bajo', ratio };
  }

  // Azúcares y sodio: menos es mejor
  if (ratio <= 0.5) return { level: 'bueno', tone: 'good', label: 'Bueno', ratio };
  if (ratio <= 0.9) return { level: 'medio', tone: 'warn', label: 'Moderado', ratio };
  return { level: 'alto', tone: 'bad', label: 'Alto', ratio };
};

/**
 * Puntuación de calidad 0-100 y etiqueta, a partir de fibra/azúcares/sodio.
 *
 * Pesos: fibra 35%, azúcares 25%, sodio 40% (el sodio pesa más por su impacto
 * en la salud cardiovascular).
 */
export const qualityScore = (
  { fiber = 0, sugars = 0, sodium = 0 } = {},
  scope = 'dish'
) => {
  const ref = scope === 'day' ? DAILY_REFERENCES : DISH_REFERENCES;

  const fiberScore = clamp((fiber / ref.fiber) * 100);
  const sugarsScore = clamp(100 - (sugars / ref.sugars) * 100);
  const sodiumScore = clamp(100 - (sodium / ref.sodium) * 100);

  const score = Math.round(
    fiberScore * 0.35 + sugarsScore * 0.25 + sodiumScore * 0.4
  );

  let label;
  let tone;
  if (score >= 80) {
    label = 'Excelente';
    tone = 'good';
  } else if (score >= 60) {
    label = 'Buena';
    tone = 'good';
  } else if (score >= 40) {
    label = 'Regular';
    tone = 'warn';
  } else {
    label = 'Mejorar';
    tone = 'bad';
  }

  // Sugerencia: qué es lo que más le resta puntos.
  const señales = [
    { score: fiberScore, msg: 'poca fibra' },
    { score: sugarsScore, msg: 'muchos azúcares' },
    { score: sodiumScore, msg: 'mucho sodio' },
  ]
    .filter((s) => s.score < 60)
    .sort((a, b) => a.score - b.score);

  const hint = señales[0]
    ? `Lo que más le resta: ${señales[0].msg}.`
    : 'Buen equilibrio de fibra, azúcares y sodio.';

  return { score, label, tone, hint };
};

/**
 * ¿Hay datos para puntuar? (los tres en cero suelen ser "sin estimar").
 */
export const hasMicroData = ({ fiber = 0, sugars = 0, sodium = 0 } = {}) =>
  (Number(fiber) || 0) + (Number(sugars) || 0) + (Number(sodium) || 0) > 0;

export { unit };
