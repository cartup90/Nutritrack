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

/**
 * Desglose orientativo del gasto energético diario.
 *
 * El TDEE se obtiene con `TMB × factor de actividad`, y ese factor YA incluye
 * implícitamente el NEAT, el TEF y el ejercicio. Por eso aquí NO se recalcula
 * nada: se reparte el mismo total para poder explicárselo al usuario.
 *
 *   TDEE = TMB + TEF + NEAT + EAT
 *
 *   · TEF  (termogénesis de los alimentos) ≈ 10 % del TDEE, bastante estable.
 *   · NEAT (actividad no asociada al ejercicio) es el componente MÁS variable:
 *     entre personas con el mismo perfil puede ir del 15 % al 50 % del gasto.
 *     Además baja de forma inconsciente cuando se come menos, que es una de
 *     las razones por las que el adelgazamiento se estanca.
 *   · EAT  (ejercicio) depende de la actividad declarada.
 *
 * `eatShare` = proporción del resto (NEAT + EAT) que se atribuye al ejercicio.
 */
export const ENERGY_BREAKDOWN = {
  tefShare: 0.1,
  eatShare: {
    sedentary: 0,
    light: 0.2,
    moderate: 0.4,
    active: 0.55,
    very_active: 0.65,
  },
};

/**
 * Niveles de intensidad por objetivo.
 *
 * El recorte se aplica como porcentaje del TDEE (escala con el tamaño corporal,
 * más sensato que un valor fijo) y se acota con un suelo de seguridad: el
 * objetivo nunca queda por debajo de la TMB ni de los mínimos clínicos.
 */
export const GOAL_INTENSITIES = {
  lose_weight: {
    mild: {
      multiplier: 0.9, // −10 %
      label: 'Leve',
      description: 'Déficit suave, apenas notarás hambre',
      rateKgPerWeek: 0.25,
      warning:
        'Pérdida lenta pero muy fácil de mantener. Ideal si quieres cambiar hábitos sin prisa.',
    },
    moderate: {
      multiplier: 0.8, // −20 %, unos −500 kcal en un TDEE de 2500
      label: 'Moderado',
      description: 'El ritmo sostenible y más recomendado',
      rateKgPerWeek: 0.5,
      warning:
        'Ritmo sostenible: alrededor de 0,5 kg por semana. Es el que mejor protege tu masa muscular.',
    },
    aggressive: {
      multiplier: 0.75, // −25 %
      label: 'Agresivo',
      description: 'Rápido, pero exigente y con riesgos',
      rateKgPerWeek: 0.6,
      warning:
        'Rápido pero exigente. Mayor riesgo de perder músculo, fatiga y efecto rebote. No lo mantengas más de 8-12 semanas.',
    },
  },

  maintain: {
    moderate: {
      multiplier: 1.0,
      label: 'Mantener',
      description: 'Comes lo que gastas',
      rateKgPerWeek: 0,
      warning: 'Mantendrás tu peso actual si tu gasto estimado es correcto.',
    },
  },

  gain_muscle: {
    mild: {
      multiplier: 1.05, // +5 %
      label: 'Leve',
      description: 'Volumen limpio, mínima grasa',
      rateKgPerWeek: 0.15,
      warning:
        'Ganancia lenta con muy poca grasa acumulada. Necesita entrenamiento de fuerza constante.',
    },
    moderate: {
      multiplier: 1.1, // +10 %
      label: 'Moderado',
      description: 'Equilibrio entre músculo y grasa',
      rateKgPerWeek: 0.25,
      warning:
        'Ritmo equilibrado. La mayor parte del aumento debería ser masa muscular.',
    },
    aggressive: {
      multiplier: 1.15, // +15 %
      label: 'Agresivo',
      description: 'Más músculo, pero también más grasa',
      rateKgPerWeek: 0.4,
      warning:
        'Más músculo pero también más grasa. Solo tiene sentido con entrenamiento intenso y buen control del superávit.',
    },
  },
};

/** Intensidad por defecto de cada objetivo. */
export const DEFAULT_INTENSITY = {
  lose_weight: 'moderate',
  maintain: 'moderate',
  gain_muscle: 'moderate',
};

/**
 * Mínimos clínicos de seguridad (kcal/día).
 * Por debajo de esto no se baja aunque el porcentaje lo permita.
 */
export const CALORIE_FLOOR = { female: 1200, male: 1500 };

/**
 * Reparto de macros por objetivo e intensidad.
 *
 * En déficit agresivo se sube la proteína: es lo que mejor protege la masa
 * muscular cuando el recorte es grande.
 */
export const MACRO_SPLIT = {
  lose_weight: {
    mild: { protein: 0.32, carbs: 0.38, fats: 0.3 },
    moderate: { protein: 0.35, carbs: 0.35, fats: 0.3 },
    aggressive: { protein: 0.4, carbs: 0.3, fats: 0.3 },
  },
  maintain: {
    mild: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    moderate: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    aggressive: { protein: 0.3, carbs: 0.4, fats: 0.3 },
  },
  gain_muscle: {
    mild: { protein: 0.3, carbs: 0.45, fats: 0.25 },
    moderate: { protein: 0.3, carbs: 0.45, fats: 0.25 },
    aggressive: { protein: 0.28, carbs: 0.47, fats: 0.25 },
  },
};

/** Normaliza una intensidad pedida a una válida para ese objetivo. */
export const resolveIntensity = (goal, intensity) => {
  const opciones = GOAL_INTENSITIES[goal] || GOAL_INTENSITIES.maintain;
  if (intensity && opciones[intensity]) return intensity;
  return DEFAULT_INTENSITY[goal] || 'moderate';
};

/**
 * Reparte el TDEE en sus componentes, solo a efectos explicativos.
 * El total NO cambia: es el mismo que devuelve `TMB × factor de actividad`.
 */
const breakdownEnergy = (bmr, tdee, activityLevel) => {
  const tef = tdee * ENERGY_BREAKDOWN.tefShare;
  const resto = Math.max(tdee - bmr - tef, 0);
  const eatShare = ENERGY_BREAKDOWN.eatShare[activityLevel] ?? 0;
  const eat = resto * eatShare;
  const neat = resto - eat;

  const pct = (v) => Math.round((v / tdee) * 100);

  return {
    bmr: Math.round(bmr),
    tef: Math.round(tef),
    neat: Math.round(neat),
    eat: Math.round(eat),
    bmrPercent: pct(bmr),
    tefPercent: pct(tef),
    neatPercent: pct(neat),
    eatPercent: pct(eat),
    // El NEAT es el más incierto de todos: conviene decirlo en la interfaz
    note:
      'Estimación orientativa. El NEAT es el componente más variable entre personas ' +
      'y tiende a bajar de forma inconsciente cuando comes menos.',
  };
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

  const activityLevel = user.activity_level || user.activityLevel || 'sedentary';
  const activityFactor = ACTIVITY_FACTORS[activityLevel] || 1.2;
  const tdee = bmr * activityFactor;

  const goal = user.goal || 'maintain';
  const intensity = resolveIntensity(goal, user.goal_intensity || user.goalIntensity);
  const nivel = GOAL_INTENSITIES[goal]?.[intensity] || GOAL_INTENSITIES.maintain.moderate;

  // Objetivo por porcentaje, acotado por el suelo de seguridad
  const objetivoBruto = tdee * nivel.multiplier;
  const sueloTmb = bmr;
  const sueltoClinico = CALORIE_FLOOR[gender];
  const suelo = Math.max(sueloTmb, sueltoClinico);

  const seAplicoSuelo = objetivoBruto < suelo;
  const calorieGoal = Math.round(seAplicoSuelo ? suelo : objetivoBruto);

  const split =
    MACRO_SPLIT[goal]?.[intensity] ||
    MACRO_SPLIT[goal]?.moderate ||
    MACRO_SPLIT.maintain.moderate;

  // Diferencia real aplicada (puede no coincidir con el % si saltó el suelo)
  const ajusteKcal = Math.round(calorieGoal - tdee);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calorieGoal,

    goal,
    intensity,
    intensityLabel: nivel.label,
    intensityDescription: nivel.description,
    intensityWarning: nivel.warning,
    rateKgPerWeek: nivel.rateKgPerWeek,

    /** Ajuste diario respecto al gasto: negativo en déficit, positivo en superávit */
    ajusteKcal,
    /** true si el suelo de seguridad recortó el déficit pedido */
    floorApplied: seAplicoSuelo,
    floorKcal: Math.round(suelo),
    floorReason: seAplicoSuelo
      ? objetivoBruto < sueltoClinico
        ? `Se aplicó el mínimo de seguridad de ${sueltoClinico} kcal/día`
        : 'Se aplicó el suelo de tu metabolismo basal para no perder masa muscular'
      : null,

    proteinGoal: Math.round((calorieGoal * split.protein) / 4),
    carbGoal: Math.round((calorieGoal * split.carbs) / 4),
    fatGoal: Math.round((calorieGoal * split.fats) / 9),

    macroSplit: {
      protein: Math.round(split.protein * 100),
      carbs: Math.round(split.carbs * 100),
      fats: Math.round(split.fats * 100),
    },

    breakdown: breakdownEnergy(bmr, tdee, activityLevel),
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
