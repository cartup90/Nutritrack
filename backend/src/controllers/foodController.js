import {
  createFoodEntry,
  getFoodEntries,
  getFoodEntryById,
  getDailyStats,
  getEntriesForStats,
  updateFoodEntry,
  deleteFoodEntry,
  getAllFoodEntries,
  getTodayMealNames,
} from '../models/FoodEntry.js';
import { analyzeFoodImage, getFoodSuggestions } from '../services/deepSeekService.js';
import { processAndSaveImage, deleteImageByUrl } from '../services/imageService.js';
import {
  calculateGoals,
  computeGaps,
  recommendationCacheKey,
  guessMealType,
} from '../utils/nutrition.js';
import { buildLocalSuggestions } from '../utils/suggestions.js';
import {
  getCachedRecommendation,
  saveCachedRecommendation,
} from '../models/RecommendationCache.js';
import { getUserById } from '../models/User.js';
import {
  addDays,
  isYmd,
  logicalDateOf,
  resolveTimeZone,
  today as todayLogico,
} from '../utils/timezone.js';

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * PASO 1 — Analiza la imagen con IA.
 * NO guarda el registro de comida: solo optimiza la imagen, la persiste y
 * devuelve la estimación para que el usuario la revise antes de confirmar.
 */
export const analyzeFood = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    // Optimizar y guardar la imagen (se borra si el usuario descarta el análisis)
    const image = await processAndSaveImage(req.file.buffer);

    const { customName } = req.body;
    const analysis = await analyzeFoodImage(image.base64, customName);

    if (!analysis.success) {
      // No dejamos imágenes huérfanas en disco
      await deleteImageByUrl(image.imageUrl);

      return res.status(analysis.code === 'MISSING_API_KEY' ? 503 : 502).json({
        error: analysis.error,
        code: analysis.code,
        details: analysis.details,
      });
    }

    res.json({
      imageUrl: image.imageUrl,
      imageSizeBytes: image.sizeBytes,
      analysis: analysis.data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PASO 2 — Guarda la comida con los valores confirmados por el usuario.
 * La IA es una estimación; el usuario es la fuente de verdad final.
 */
export const saveFood = async (req, res, next) => {
  try {
    const {
      mealType = 'lunch',
      mealTime = null,
      foods = [],
      totals = {},
      aiTotals = null,
      imageUrl = null,
      confirmed = true,
    } = req.body;

    if (!totals || totals.calories === undefined) {
      return res
        .status(400)
        .json({ error: 'Faltan los valores nutricionales a guardar' });
    }

    const entry = await createFoodEntry({
      userId: req.user.id,
      mealType,
      mealTime,
      foods: Array.isArray(foods) ? foods : [],
      totals: {
        calories: parseNumber(totals.calories),
        protein: parseNumber(totals.protein),
        carbs: parseNumber(totals.carbs),
        fats: parseNumber(totals.fats),
        fiber: parseNumber(totals.fiber),
        sugars: parseNumber(totals.sugars),
        sodium: parseNumber(totals.sodium),
      },
      aiTotals: aiTotals
        ? {
            calories: parseNumber(aiTotals.calories),
            protein: parseNumber(aiTotals.protein),
            carbs: parseNumber(aiTotals.carbs),
            fats: parseNumber(aiTotals.fats),
            confidence: parseNumber(aiTotals.confidence),
          }
        : null,
      imageUrl,
      confirmedAt: confirmed ? new Date().toISOString() : null,
    });

    res.status(201).json({ message: 'Comida registrada', entry });
  } catch (error) {
    next(error);
  }
};

/**
 * Alta manual sin imagen (la app ofrece esta vía si la IA falla).
 */
export const createManualEntry = async (req, res, next) => {
  try {
    const { mealType = 'lunch', mealTime = null, foods = [], totals = {} } = req.body;

    const entry = await createFoodEntry({
      userId: req.user.id,
      mealType,
      mealTime,
      foods: Array.isArray(foods) ? foods : [],
      totals: {
        calories: parseNumber(totals.calories) || 0,
        protein: parseNumber(totals.protein) || 0,
        carbs: parseNumber(totals.carbs) || 0,
        fats: parseNumber(totals.fats) || 0,
        fiber: parseNumber(totals.fiber),
        sugars: parseNumber(totals.sugars),
        sodium: parseNumber(totals.sodium),
      },
      aiTotals: null,
      imageUrl: null,
      confirmedAt: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Comida registrada manualmente', entry });
  } catch (error) {
    next(error);
  }
};

export const listFoodEntries = async (req, res, next) => {
  try {
    const { mealType, limit, offset } = req.query;
    const timeZone = resolveTimeZone(req);

    // Sin `date` devolvemos el día lógico del usuario, no todos los registros.
    // Así el navegador ya no calcula fechas por su cuenta, que era justo lo que
    // se desincronizaba con el backend (el gráfico usaba UTC y la lista, la
    // hora local, y por eso mostraban días distintos).
    const date = isYmd(req.query.date) ? req.query.date : todayLogico(timeZone);

    const entries = await getFoodEntries(req.user.id, {
      date,
      mealType,
      limit,
      offset,
      timeZone,
    });

    res.json({ entries, count: entries.length, date });
  } catch (error) {
    next(error);
  }
};

export const listAllFoodEntries = async (req, res, next) => {
  try {
    const entries = await getAllFoodEntries(req.user.id);
    res.json({ entries, count: entries.length });
  } catch (error) {
    next(error);
  }
};

export const dailyStats = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const date = isYmd(req.query.date) ? req.query.date : todayLogico(timeZone);
    const stats = await getDailyStats(req.user.id, date, { timeZone });

    const user = await getUserById(req.user.id);
    const goals = calculateGoals(user);

    // Devuelve también la zona y el corte aplicados: si algún día vuelve a
    // haber una discrepancia de fechas, se ve en la propia respuesta sin tener
    // que entrar al servidor.
    res.json({ date, timeZone, stats, goals });
  } catch (error) {
    next(error);
  }
};

/**
 * Estadísticas para gráficos.
 * `days` (por defecto 7, máx 90) cuenta hacia atrás desde `endDate`.
 */
export const rangeStats = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const timeZone = resolveTimeZone(req);

    // El rango se calcula en el calendario del usuario. Antes se derivaba con
    // toISOString() (UTC), así que el intervalo quedaba desplazado y el último
    // día del gráfico salía siempre a cero.
    const endStr = isYmd(req.query.endDate)
      ? req.query.endDate
      : todayLogico(timeZone);
    const startStr = addDays(endStr, -(days - 1));

    const filas = await getEntriesForStats(req.user.id, startStr, endStr, {
      timeZone,
    });

    // Agrupamos por día lógico aquí, en JavaScript, que es donde vive toda la
    // conversión de zona horaria: así el SQL no necesita `AT TIME ZONE` y
    // PostgreSQL puede usar el índice de `created_at` para el filtro.
    const acumulado = new Map();

    for (const fila of filas) {
      const clave = logicalDateOf(fila.created_at, timeZone);
      const acc = acumulado.get(clave) || {
        entryCount: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      };

      acc.entryCount += 1;
      acc.calories += Number(fila.calories) || 0;
      acc.protein += Number(fila.protein) || 0;
      acc.carbs += Number(fila.carbs) || 0;
      acc.fats += Number(fila.fats) || 0;

      acumulado.set(clave, acc);
    }

    // Rellenamos los días sin registros para que el gráfico sea continuo
    const series = [];

    for (let i = 0; i < days; i += 1) {
      const key = addDays(startStr, i);
      const acc = acumulado.get(key);

      series.push({
        date: key,
        entryCount: acc ? acc.entryCount : 0,
        calories: acc ? acc.calories : 0,
        protein: acc ? acc.protein : 0,
        carbs: acc ? acc.carbs : 0,
        fats: acc ? acc.fats : 0,
      });
    }

    const loggedDays = series.filter((d) => d.entryCount > 0);
    const avg = (key) =>
      loggedDays.length
        ? Math.round(loggedDays.reduce((a, d) => a + d[key], 0) / loggedDays.length)
        : 0;

    const user = await getUserById(req.user.id);
    const goals = calculateGoals(user);

    res.json({
      range: { startDate: startStr, endDate: endStr, days },
      series,
      averages: {
        calories: avg('calories'),
        protein: avg('protein'),
        carbs: avg('carbs'),
        fats: avg('fats'),
      },
      daysLogged: loggedDays.length,
      daysOnTarget: goals
        ? series.filter(
            (d) => d.entryCount > 0 && d.calories <= goals.calorieGoal * 1.05
          ).length
        : 0,
      goals,
    });
  } catch (error) {
    next(error);
  }
};

export const editFoodEntry = async (req, res, next) => {
  try {
    const existing = await getFoodEntryById(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const { calories, protein, carbs, fats, fiber, sugars, sodium, foods, mealType, mealTime, confirmed } =
      req.body;

    const entry = await updateFoodEntry(req.params.id, req.user.id, {
      calories: parseNumber(calories) ?? undefined,
      protein: parseNumber(protein) ?? undefined,
      carbs: parseNumber(carbs) ?? undefined,
      fats: parseNumber(fats) ?? undefined,
      fiber: parseNumber(fiber) ?? undefined,
      sugars: parseNumber(sugars) ?? undefined,
      sodium: parseNumber(sodium) ?? undefined,
      foods: Array.isArray(foods) ? foods : undefined,
      meal_type: mealType,
      meal_time: mealTime,
      confirmed: confirmed !== false,
    });

    res.json({ message: 'Registro actualizado', entry });
  } catch (error) {
    next(error);
  }
};

export const removeFoodEntry = async (req, res, next) => {
  try {
    const entry = await deleteFoodEntry(req.params.id, req.user.id);
    if (!entry) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // Política de datos: la foto se elimina junto con su registro
    await deleteImageByUrl(entry.image_url);

    res.json({ message: 'Registro eliminado' });
  } catch (error) {
    next(error);
  }
};

/**
 * Recomendaciones de comidas.
 *
 * Tres capas, de más barata a más cara:
 *   1. El consejo y los déficits se calculan en local (una resta exacta).
 *   2. Las sugerencias de platos salen de una base local: instantáneo y 0 tokens.
 *   3. Solo si el usuario pide expresamente ideas nuevas (`?ai=true`) se llama
 *      al modelo, y el resultado se cachea.
 *
 * Así, el uso normal de la pantalla no gasta un solo token.
 */
export const suggestions = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const date = isYmd(req.query.date) ? req.query.date : todayLogico(timeZone);
    const quiereIA = req.query.ai === 'true' || req.query.ai === '1';

    const stats = await getDailyStats(req.user.id, date, { timeZone });
    const user = await getUserById(req.user.id);
    const goals = calculateGoals(user);

    const consumed = {
      calories: Number(stats.total_calories) || 0,
      protein: Number(stats.total_protein) || 0,
      carbs: Number(stats.total_carbs) || 0,
      fats: Number(stats.total_fats) || 0,
    };

    const entryCount = Number(stats.entry_count) || 0;
    const goalType = user?.goal || 'maintain';

    // Cálculo local: instantáneo y gratis
    const gapInfo = computeGaps(consumed, goals, entryCount);
    const gaps = gapInfo?.gaps || [];

    const recentMeals = await getTodayMealNames(req.user.id, date, { timeZone });

    // Qué comida toca sugerir: lo que pida el cliente, o la siguiente por hora
    const mealType = req.query.mealType || guessMealType();

    const base = {
      date,
      goals,
      consumed,
      gaps,
      advice: gapInfo?.advice || '',
      kcalRestantes: gapInfo?.kcalRestantes ?? 0,
    };

    // --- Sugerencias locales (por defecto) ---------------------------------
    const locales = buildLocalSuggestions({
      gaps,
      consumed: { ...consumed, kcalRestantes: base.kcalRestantes },
      entryCount,
      recentMeals,
      mealType,
    });

    if (!quiereIA) {
      if (!locales) {
        return res.json({
          ...base,
          summary: '',
          suggestions: [],
          source: 'local',
          cached: false,
          reason: 'sin_margen',
        });
      }
      return res.json({ ...base, ...locales, cached: false });
    }

    // --- Ideas generadas por IA (bajo petición) ----------------------------
    const cacheKey = recommendationCacheKey(date, consumed, entryCount, goalType);
    const cached = await getCachedRecommendation(req.user.id, cacheKey);

    if (cached) {
      return res.json({
        ...base,
        summary: cached.summary || '',
        suggestions: cached.suggestions || [],
        source: 'ai',
        cached: true,
        cachedAt: cached.createdAt,
        localSuggestions: locales?.suggestions || [],
      });
    }

    const result = await getFoodSuggestions({
      consumed,
      goals: goals || {},
      goalType,
      recentMeals,
      gaps,
      mealType,
    });

    if (!result.success) {
      // Si la IA falla, las locales siguen siendo útiles: no dejamos al usuario
      // sin nada solo porque el modelo no responda.
      if (locales) {
        return res.json({
          ...base,
          ...locales,
          cached: false,
          aiError: result.error,
          aiErrorCode: result.code,
        });
      }
      return res
        .status(result.code === 'MISSING_API_KEY' ? 503 : 502)
        .json({ error: result.error, code: result.code, details: result.details });
    }

    await saveCachedRecommendation(req.user.id, cacheKey, result.data);

    res.json({
      ...base,
      summary: result.data.summary,
      suggestions: result.data.suggestions,
      source: 'ai',
      cached: false,
      localSuggestions: locales?.suggestions || [],
    });
  } catch (error) {
    next(error);
  }
};
