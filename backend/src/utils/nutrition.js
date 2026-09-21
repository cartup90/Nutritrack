/**
 * Cálculo de objetivos nutricionales.
 * Fórmula base: Mifflin-St Jeor para la TMB, ajustada por factor de actividad
 * y por el objetivo declarado del usuario.
 */

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_MULTIPLIERS = {
  lose_weight: 0.85, // déficit del 15%
  maintain: 1.0,
  gain_muscle: 1.1, // superávit del 10%
};

/**
 * Distribución de macros por objetivo: [proteína, carbohidratos, grasas] en % de kcal.
 */
export const MACRO_SPLIT = {
  lose_weight: { protein: 0.35, carbs: 0.35, fats: 0.3 },
  maintain: { protein: 0.3, carbs: 0.4, fats: 0.3 },
  gain_muscle: { protein: 0.3, carbs: 0.45, fats: 0.25 },
};

/**
 * Calcula TMB, TDEE y objetivos de calorías/macros.
 * @returns {null|object} null si faltan datos antropométricos.
 */
export const calculateGoals = (user) => {
  const weight = Number(user?.weight);
  const height = Number(user?.height);
  const age = Number(user?.age);

  if (!weight || !height || !age) return null;

  const gender = user.gender === 'male' ? 'male' : 'female';

  // Mifflin-St Jeor
  const bmr =
    gender === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

  const activityFactor = ACTIVITY_FACTORS[user.activity_level || user.activityLevel] || 1.2;
  const tdee = bmr * activityFactor;

  const goal = user.goal || 'maintain';
  const tdeeAdjusted = tdee * (GOAL_MULTIPLIERS[goal] || 1);
  const calorieGoal = Math.round(tdeeAdjusted);

  const split = MACRO_SPLIT[goal] || MACRO_SPLIT.maintain;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calorieGoal,
    proteinGoal: Math.round((calorieGoal * split.protein) / 4),
    carbGoal: Math.round((calorieGoal * split.carbs) / 4),
    fatGoal: Math.round((calorieGoal * split.fats) / 9),
  };
};

/**
 * Calcula qué le falta al usuario hoy.
 *
 * Se hace en local, no con IA: `objetivo - consumido` es una resta exacta.
 * Pedirle al modelo que la haga gasta tokens y además puede equivocarse.
 *
 * @param {{calories:number, protein:number, carbs:number, fats:number}} consumed
 * @param {object|null} goals - salida de calculateGoals()
 * @param {number} entryCount - número de comidas registradas hoy
 * @returns {null|object}
 */
export const computeGaps = (consumed = {}, goals = null, entryCount = null) => {
  if (!goals) return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const eaten = {
    calories: num(consumed.calories),
    protein: num(consumed.protein),
    carbs: num(consumed.carbs),
    fats: num(consumed.fats),
  };

  const kcalRestantes = Math.max(goals.calorieGoal - eaten.calories, 0);
  const excedido = eaten.calories > goals.calorieGoal;

  const definiciones = [
    { key: 'protein', label: 'proteínas', unit: 'g', goal: goals.proteinGoal },
    { key: 'carbs', label: 'carbohidratos', unit: 'g', goal: goals.carbGoal },
    { key: 'fats', label: 'grasas', unit: 'g', goal: goals.fatGoal },
  ];

  const macros = definiciones.map((d) => {
    const valor = eaten[d.key];
    const restante = Math.max(d.goal - valor, 0);
    const pct = d.goal > 0 ? Math.round((valor / d.goal) * 100) : 0;
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      consumed: Math.round(valor),
      goal: d.goal,
      remaining: Math.round(restante),
      percent: pct,
      exceeded: valor > d.goal,
    };
  });

  // Un macro es prioritario si aún queda margen y va más atrasado que los demás.
  const pendientes = macros
    .filter((m) => m.remaining > 0)
    .sort((a, b) => a.percent - b.percent);

  // Solo lo señalamos como carencia si va por debajo del 60 % a una hora
  // razonable del día; si no, cualquier mañana saldría "faltan proteínas".
  const prioritarios = pendientes.filter((m) => m.percent < 60);

  const gaps = prioritarios.map((m) => ({
    key: m.key,
    label: m.label,
    remaining: m.remaining,
    unit: m.unit,
  }));

  let advice;
  if (entryCount === 0) {
    // Aún no ha registrado nada: decirle que "va corto de todo" es cierto pero
    // inútil. Es mejor recordarle cuál es su reparto objetivo del día.
    advice =
      `Aún no has registrado nada hoy. Tu objetivo son ${goals.calorieGoal} kcal ` +
      `con ${goals.proteinGoal} g de proteína, ${goals.carbGoal} g de carbohidratos ` +
      `y ${goals.fatGoal} g de grasas.`;
  } else if (excedido) {
    advice = `Has superado tu objetivo por ${Math.round(
      eaten.calories - goals.calorieGoal
    )} kcal. Prioriza opciones ligeras si comes algo más.`;
  } else if (gaps.length > 0) {
    const principal = gaps[0];
    const extras = gaps.slice(1).map((g) => g.label);
    advice =
      `Te quedan ${Math.round(kcalRestantes)} kcal y vas corto de ${principal.label} ` +
      `(te faltan ${principal.remaining} ${principal.unit})` +
      (extras.length ? `, y también de ${extras.join(' y ')}.` : '.');
  } else if (pendientes.length > 0) {
    advice = `Vas bien encaminado. Te quedan ${Math.round(
      kcalRestantes
    )} kcal para cerrar el día.`;
  } else {
    advice = 'Has cubierto todos tus objetivos de macros de hoy.';
  }

  return {
    kcalRestantes: Math.round(kcalRestantes),
    excedido,
    macros,
    gaps,
    advice,
  };
};

/**
 * Clave de caché de recomendaciones.
 *
 * Cambia cuando cambia algo relevante: el día, el número de comidas o los
 * totales consumidos. Así, añadir una comida invalida la caché sola, sin
 * necesidad de borrarla a mano.
 */
export const recommendationCacheKey = (date, consumed = {}, entryCount = 0, goal = 'maintain') => {
  const r = (v) => Math.round(Number(v) || 0);
  return [
    date,
    goal,
    entryCount,
    r(consumed.calories),
    r(consumed.protein),
    r(consumed.carbs),
    r(consumed.fats),
  ].join('|');
};
