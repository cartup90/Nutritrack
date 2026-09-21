import {
  createFoodEntry,
  getFoodEntries,
  getFoodEntryById,
  getDailyStats,
  getStatsByDateRange,
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

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Normaliza un valor de fecha a 'YYYY-MM-DD'.
 *
 * Postgres devuelve las columnas DATE como string (ver config/database.js),
 * pero algunos drivers/entornos las entregan como objetos Date. En ese caso,
 * node-postgres construye la fecha a medianoche LOCAL mientras que otros
 * (p. ej. el PostgreSQL en memoria usado en tests) usan medianoche UTC, por lo
 * que elegimos los getters según la representación detectada.
 */
const toYmd = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);

  if (value instanceof Date) {
    const isUtcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;

    if (isUtcMidnight) return value.toISOString().slice(0, 10);

    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  return String(value).slice(0, 10);
};

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

    const analysis = await analyzeFoodImage(image.base64);

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
    const { date, mealType, limit, offset } = req.query;

    const entries = await getFoodEntries(req.user.id, {
      date,
      mealType,
      limit,
      offset,
    });

    res.json({ entries, count: entries.length });
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
    const date = req.query.date || todayStr();
    const stats = await getDailyStats(req.user.id, date);

    const user = await getUserById(req.user.id);
    const goals = calculateGoals(user);

    res.json({ date, stats, goals });
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
    const end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const rows = await getStatsByDateRange(req.user.id, startStr, endStr);

    // Rellenamos los días sin registros para que el gráfico sea continuo
    const byDate = new Map(rows.map((r) => [toYmd(r.date), r]));
    const series = [];

    for (let i = 0; i < days; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const row = byDate.get(key);

      series.push({
        date: key,
        entryCount: row ? Number(row.entry_count) : 0,
        calories: row ? Number(row.total_calories) : 0,
        protein: row ? Number(row.total_protein) : 0,
        carbs: row ? Number(row.total_carbs) : 0,
        fats: row ? Number(row.total_fats) : 0,
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
    const date = req.query.date || todayStr();
    const quiereIA = req.query.ai === 'true' || req.query.ai === '1';

    const stats = await getDailyStats(req.user.id, date);
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

    const recentMeals = await getTodayMealNames(req.user.id, date);

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
