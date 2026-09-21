import { FOODS } from '../data/foods.js';

/**
 * Motor de sugerencias local.
 *
 * Resuelve el caso común sin llamar a la IA. La lógica es determinista y
 * verificable: no hay tokens, no hay latencia y no puede "alucinar" macros.
 *
 * Cómo elige:
 *   1. Calcula el tamaño razonable de la próxima comida a partir de lo que
 *      queda por comer.
 *   2. Puntúa cada plato según cuánto cubre el déficit principal y qué tan
 *      bien encaja en ese presupuesto calórico.
 *   3. Descarta lo que ya se ha comido hoy y busca variedad de tipos de comida.
 */

/** Reparto orientativo de las calorías restantes según la comida del día. */
const SHARE_POR_COMIDA = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.15,
  dinner: 0.3,
};

/** Tamaño mínimo y máximo de una sugerencia, para no proponer cosas absurdas. */
const MIN_KCAL = 120;
const MAX_KCAL = 900;

const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/**
 * ¿Ya se ha comido algo parecido hoy?
 * Compara por solapamiento de palabras, sin exigir coincidencia exacta.
 */
const yaComido = (nombrePlato, comidasPrevias) => {
  const palabrasPlato = new Set(normalizar(nombrePlato).split(/\s+/).filter((w) => w.length > 3));
  if (palabrasPlato.size === 0) return false;

  return comidasPrevias.some((comida) => {
    const palabrasComida = normalizar(comida).split(/\s+/).filter((w) => w.length > 3);
    return palabrasComida.some((w) => palabrasPlato.has(w));
  });
};

/** Texto de "por qué" generado localmente, sin IA. */
const explicar = (plato, gapPrincipal, kcalRestantes) => {
  const partes = [];

  if (gapPrincipal && gapPrincipal.remaining > 0) {
    const cubre = Math.min(plato[gapPrincipal.key] || 0, gapPrincipal.remaining);
    if (cubre > 0) {
      partes.push(
        `aporta ${Math.round(cubre)} ${gapPrincipal.unit} de ${gapPrincipal.label}`
      );
    }
  }

  if (kcalRestantes > 0) {
    const pct = Math.round((plato.calories / kcalRestantes) * 100);
    if (pct <= 25) partes.push('sin pasarte de calorías');
    else if (pct >= 45) partes.push('aprovecha bien lo que te queda');
  }

  if (partes.length === 0) return 'Encaja con tu objetivo del día.';

  const texto = partes.join(' y ');
  return texto.charAt(0).toUpperCase() + texto.slice(1) + '.';
};

/**
 * Genera sugerencias a partir de los déficits ya calculados.
 *
 * @param {object} opciones
 * @param {object|null} opciones.gaps - salida de computeGaps()
 * @param {{calories:number}} opciones.consumed
 * @param {number} opciones.entryCount - comidas registradas hoy
 * @param {string[]} opciones.recentMeals - nombres de lo ya comido
 * @param {string} opciones.mealType - comida para la que se sugiere
 * @param {number} opciones.limite - cuántas sugerencias devolver
 * @returns {{summary:string, suggestions:object[]}|null} null si no hay datos
 */
export const buildLocalSuggestions = ({
  gaps = [],
  consumed = {},
  entryCount = 0,
  recentMeals = [],
  mealType,
  limite = 4,
} = {}) => {
  const kcalRestantes = Number(consumed.kcalRestantes ?? 0);

  // Sin margen calórico no tiene sentido proponer platos
  if (kcalRestantes < MIN_KCAL) return null;

  const tipoComida = mealType || 'lunch';
  const objetivoKcal = Math.min(
    Math.max(kcalRestantes * (SHARE_POR_COMIDA[tipoComida] ?? 0.3), MIN_KCAL),
    MAX_KCAL
  );

  const gapPrincipal = gaps.length > 0 ? gaps[0] : null;

  const candidatos = FOODS
    // Encaje con el momento del día
    .filter((f) => f.mealType === tipoComida || f.mealType === 'any')
    // Que quepa en lo que queda
    .filter((f) => f.calories <= kcalRestantes + 50)
    // Y que no se repita con lo ya comido
    .filter((f) => !yaComido(f.name, recentMeals))
    .map((plato) => {
      // --- Cobertura del déficit principal ---
      let cobertura = 0.5; // neutro si no falta nada concreto
      if (gapPrincipal && gapPrincipal.remaining > 0) {
        cobertura = Math.min(
          (plato[gapPrincipal.key] || 0) / gapPrincipal.remaining,
          1
        );
      }

      // --- Encaje calórico respecto al tamaño esperado de la comida ---
      const desvio = Math.abs(plato.calories - objetivoKcal) / objetivoKcal;
      const encaje = Math.max(1 - desvio, 0);

      // --- Pequeño extra por densidad proteica, siempre deseable ---
      const densidadProteica =
        plato.calories > 0 ? (plato.protein * 4) / plato.calories : 0;

      const puntuacion =
        cobertura * 0.5 + encaje * 0.35 + Math.min(densidadProteica, 0.6) * 0.15;

      return { plato, puntuacion };
    })
    .sort((a, b) => b.puntuacion - a.puntuacion);

  // Variedad real: como máximo un plato por fuente principal.
  // Sin esto salían cuatro platos de pollo seguidos, porque los nombres
  // ("pechuga", "quinoa", "pasta"…) parecían distintos.
  const fuentesUsadas = new Set();
  const elegidos = [];

  for (const { plato } of candidatos) {
    const fuente = plato.main || 'otro';
    if (fuentesUsadas.has(fuente)) continue;

    fuentesUsadas.add(fuente);
    elegidos.push(plato);
    if (elegidos.length >= limite) break;
  }

  // Si no hay suficientes fuentes distintas, se completa con los siguientes
  if (elegidos.length < Math.min(3, limite)) {
    for (const { plato } of candidatos) {
      if (elegidos.includes(plato)) continue;
      elegidos.push(plato);
      if (elegidos.length >= limite) break;
    }
  }

  if (elegidos.length === 0) return null;

  const suggestions = elegidos.map((plato) => ({
    name: plato.name,
    why: explicar(plato, gapPrincipal, kcalRestantes),
    meal_type: plato.mealType === 'any' ? tipoComida : plato.mealType,
    calories: plato.calories,
    protein: plato.protein,
    carbs: plato.carbs,
    fats: plato.fats,
    ingredients: plato.ingredients,
  }));

  // Resumen local, coherente con el consejo que ya calcula computeGaps
  const nombreComida = {
    breakfast: 'el desayuno',
    lunch: 'la comida',
    snack: 'la merienda',
    dinner: 'la cena',
  }[tipoComida] || 'la próxima comida';

  let summary;
  if (entryCount === 0) {
    summary = `Ideas para ${nombreComida} cubriendo tus objetivos del día.`;
  } else if (gapPrincipal) {
    summary = `Opciones para ${nombreComida} que cubren ${gapPrincipal.label}.`;
  } else {
    summary = `Opciones para ${nombreComida} que encajan con lo que te queda.`;
  }

  return { summary, suggestions, source: 'local' };
};

export default buildLocalSuggestions;
