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
