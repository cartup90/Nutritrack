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
