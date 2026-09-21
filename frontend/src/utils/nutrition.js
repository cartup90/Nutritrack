// Utilidades de nutrición y formateo

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Desayuno', icon: '☕', defaultTime: '08:00' },
  { value: 'lunch', label: 'Almuerzo', icon: '🍽️', defaultTime: '13:00' },
  { value: 'snack', label: 'Merienda', icon: '🍎', defaultTime: '17:00' },
  { value: 'dinner', label: 'Cena', icon: '🌙', defaultTime: '21:00' },
];

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentario', description: 'Poco o ningún ejercicio' },
  { value: 'light', label: 'Ligero', description: 'Ejercicio 1-3 días/semana' },
  { value: 'moderate', label: 'Moderado', description: 'Ejercicio 3-5 días/semana' },
  { value: 'active', label: 'Activo', description: 'Ejercicio 6-7 días/semana' },
  { value: 'very_active', label: 'Muy activo', description: 'Ejercicio intenso diario' },
];

export const GOALS = [
  { value: 'lose_weight', label: 'Bajar de peso', icon: '📉' },
  { value: 'maintain', label: 'Mantener peso', icon: '⚖️' },
  { value: 'gain_muscle', label: 'Ganar masa muscular', icon: '💪' },
];

/**
 * Niveles de intensidad de cada objetivo.
 *
 * Los porcentajes son los mismos que aplica el backend
 * (backend/src/utils/nutrition.js). Se muestran aquí para que el usuario sepa
 * a qué se compromete antes de elegir.
 */
export const INTENSITIES = {
  lose_weight: [
    {
      value: 'mild',
      label: 'Leve',
      percent: 10,
      rate: '~0,25 kg/semana',
      description: 'Déficit suave, apenas notarás hambre',
      warning:
        'Pérdida lenta pero muy fácil de mantener. Ideal si quieres cambiar hábitos sin prisa.',
      tone: 'ok',
    },
    {
      value: 'moderate',
      label: 'Moderado',
      percent: 20,
      rate: '~0,5 kg/semana',
      description: 'El ritmo sostenible y más recomendado',
      warning:
        'Alrededor de 0,5 kg por semana. Es el ritmo que mejor protege tu masa muscular.',
      tone: 'ok',
    },
    {
      value: 'aggressive',
      label: 'Agresivo',
      percent: 25,
      rate: '~0,6 kg/semana',
      description: 'Rápido, pero exigente y con riesgos',
      warning:
        'Mayor riesgo de perder músculo, fatiga y efecto rebote. No lo mantengas más de 8-12 semanas.',
      tone: 'warn',
    },
  ],
  maintain: [
    {
      value: 'moderate',
      label: 'Mantener',
      percent: 0,
      rate: 'estable',
      description: 'Comes lo que gastas',
      warning: 'Mantendrás tu peso si tu gasto estimado es correcto.',
      tone: 'ok',
    },
  ],
  gain_muscle: [
    {
      value: 'mild',
      label: 'Leve',
      percent: 5,
      rate: '~0,15 kg/semana',
      description: 'Volumen limpio, mínima grasa',
      warning:
        'Ganancia lenta con muy poca grasa. Necesita entrenamiento de fuerza constante.',
      tone: 'ok',
    },
    {
      value: 'moderate',
      label: 'Moderado',
      percent: 10,
      rate: '~0,25 kg/semana',
      description: 'Equilibrio entre músculo y grasa',
      warning: 'La mayor parte del aumento debería ser masa muscular.',
      tone: 'ok',
    },
    {
      value: 'aggressive',
      label: 'Agresivo',
      percent: 15,
      rate: '~0,4 kg/semana',
      description: 'Más músculo, pero también más grasa',
      warning:
        'Solo tiene sentido con entrenamiento intenso y buen control del superávit.',
      tone: 'warn',
    },
  ],
};

/** Intensidad por defecto de cada objetivo (igual que en el backend). */
export const DEFAULT_INTENSITY = {
  lose_weight: 'moderate',
  maintain: 'moderate',
  gain_muscle: 'moderate',
};

/** Devuelve las opciones de intensidad de un objetivo. */
export const getIntensities = (goal) => INTENSITIES[goal] || INTENSITIES.maintain;

/** Busca la descripción de una intensidad concreta. */
export const getIntensity = (goal, value) =>
  getIntensities(goal).find((i) => i.value === value) || getIntensities(goal)[0];

export const MACRO_COLORS = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fats: '#ef4444',
};

/**
 * Obtiene el label de un tipo de comida.
 */
export const getMealLabel = (mealType) => {
  return MEAL_TYPES.find((m) => m.value === mealType)?.label || 'Comida';
};

/**
 * Obtiene el icono de un tipo de comida.
 */
export const getMealIcon = (mealType) => {
  return MEAL_TYPES.find((m) => m.value === mealType)?.icon || '🍽️';
};

/**
 * Determina el tipo de comida según la hora actual.
 */
export const guessMealType = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
};

/**
 * Formatea una fecha a YYYY-MM-DD.
 */
export const toDateString = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formatea una hora a HH:MM.
 */
export const toTimeString = (date = new Date()) => {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};

/**
 * Formatea fecha en formato legible en español.
 */
export const formatDate = (date, options = {}) => {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...options,
  });
};

/**
 * Formatea fecha corta.
 */
export const formatShortDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/**
 * Formatea hora legible.
 */
export const formatTime = (date) => {
  const d = new Date(date);
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Calcula el porcentaje de progreso.
 */
export const percent = (value, target) => {
  if (!target || target <= 0) return 0;
  return Math.min(Math.round((value / target) * 100), 999);
};

/**
 * Redondea un número a n decimales sin ceros innecesarios.
 */
export const round = (value, decimals = 0) => {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) || 0) * factor) / factor;
};

/**
 * Obtiene el color según el porcentaje de progreso.
 */
export const progressColor = (pct) => {
  if (pct >= 100) return '#ef4444'; // excedido
  if (pct >= 80) return '#f59e0b'; // cerca del límite
  return '#16a34a'; // en buen camino
};

/**
 * Genera un resumen de balance de macros para recomendaciones.
 */
export const macroBalance = (consumed, goals) => {
  if (!goals) return [];
  return [
    {
      key: 'protein',
      label: 'Proteínas',
      consumed: round(consumed.protein),
      goal: round(goals.proteinGoal),
      remaining: Math.max(round(goals.proteinGoal - consumed.protein), 0),
      unit: 'g',
      color: MACRO_COLORS.protein,
    },
    {
      key: 'carbs',
      label: 'Carbohidratos',
      consumed: round(consumed.carbs),
      goal: round(goals.carbGoal),
      remaining: Math.max(round(goals.carbGoal - consumed.carbs), 0),
      unit: 'g',
      color: MACRO_COLORS.carbs,
    },
    {
      key: 'fats',
      label: 'Grasas',
      consumed: round(consumed.fats),
      goal: round(goals.fatGoal),
      remaining: Math.max(round(goals.fatGoal - consumed.fats), 0),
      unit: 'g',
      color: MACRO_COLORS.fats,
    },
  ];
};
