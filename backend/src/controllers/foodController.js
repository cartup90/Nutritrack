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
import { saveFrequentFood } from '../models/FrequentFood.js';
import { getFastingDays } from '../models/FastingDay.js';
import { getDayTypesInRange } from '../models/DayType.js';
import {
  addDays,
  isYmd,
  logicalDateOf,
  resolveTimeZone,
  today as todayLogico,
} from '../utils/timezone.js';
import {
  computeWeeklyProgress,
  weekRangeOf,
} from '../utils/weeklyProgress.js';
import { normalizePattern, resolveDayType } from '../utils/dayTypes.js';
import { resolverFechaComida } from '../utils/mealDate.js';

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Objetivos de cada fecha, aplicando el tipo de día que le toca (fuerza,
 * aeróbico o descanso). El tipo también cambia el gasto, y por eso el objetivo
 * calórico puede variar de un día a otro.
 *
 * @param {object} user - usuario (necesita training_pattern y los datos corporales)
 * @param {string[]} fechas - días lógicos
 * @param {object} overrides - marcas por fecha { 'YYYY-MM-DD': tipo }
 * @returns {Object<string, {dayType: string, goals: object|null}>}
 */
const objetivosPorDia = (user, fechas, overrides = {}) => {
  // `getUserById` devuelve el usuario ya serializado (camelCase); el patrón se
  // acepta en las dos formas para no depender de por dónde entró.
  const pattern = normalizePattern(user?.trainingPattern ?? user?.training_pattern);

  const mapa = {};
  for (const fecha of fechas) {
    const dayType = resolveDayType(fecha, { pattern, overrides });
    mapa[fecha] = { dayType, goals: calculateGoals(user, { dayType }) };
  }

  return mapa;
};

/**
 * Agrupa las filas de comidas por día lógico y rellena los días sin registros.
 *
 * El agrupado se hace en JavaScript y no en SQL a propósito: es donde vive toda
 * la conversión de zona horaria, así el SQL no necesita `AT TIME ZONE` (que
 * pg-mem, la base de los tests, no implementa) y la consulta puede usar el
 * índice de `created_at`.
 *
 * Lo usan el gráfico de rango y el progreso semanal, para que los dos cuenten
 * exactamente igual.
 *
 * @param {Array}  filas - filas de getEntriesForStats()
 * @param {string} startDate - primer día lógico 'YYYY-MM-DD'
 * @param {number} dias - cuántos días devolver (serie continua)
 * @param {string} timeZone - zona IANA del usuario
 */
const serieDeDias = (filas, startDate, dias, timeZone) => {
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

  const series = [];

  for (let i = 0; i < dias; i += 1) {
    const key = addDays(startDate, i);
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

  return series;
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
      saveAsFrequent = false,
      date: rawDate = null,
    } = req.body;

    if (!totals || totals.calories === undefined) {
      return res
        .status(400)
        .json({ error: 'Faltan los valores nutricionales a guardar' });
    }

    // Día al que va la comida: hoy, o uno de los últimos días si el usuario
    // está completando un registro que se le había quedado sin cargar.
    const timeZone = resolveTimeZone(req);
    const fecha = resolverFechaComida(rawDate, mealTime, timeZone, todayLogico(timeZone));

    if (fecha.error) {
      return res.status(400).json({ error: fecha.error });
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
      createdAt: fecha.instant,
    });

    // "Añadir a frecuentes": guarda el desglose ya confirmado para poder
    // registrarlo en un toque sin volver a llamar a la IA.
    if (saveAsFrequent) {
      await saveFrequentFood(req.user.id, {
        foods: Array.isArray(foods) ? foods : [],
        totals,
      });
    }

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
    const {
      mealType = 'lunch',
      mealTime = null,
      foods = [],
      totals = {},
      saveAsFrequent = false,
      date: rawDate = null,
    } = req.body;

    const timeZone = resolveTimeZone(req);
    const fecha = resolverFechaComida(rawDate, mealTime, timeZone, todayLogico(timeZone));

    if (fecha.error) {
      return res.status(400).json({ error: fecha.error });
    }

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
      createdAt: fecha.instant,
    });

    // La alta manual también puede marcarse como frecuente.
    if (saveAsFrequent) {
      await saveFrequentFood(req.user.id, {
        foods: Array.isArray(foods) ? foods : [],
        totals,
      });
    }

    res.status(201).json({
      message: 'Comida registrada manualmente',
      entry,
      date: fecha.date,
    });
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
    // El tipo de día cambia el gasto y el objetivo de ESE día.
    const overrides = await getDayTypesInRange(req.user.id, date, date);
    const { dayType, goals } = objetivosPorDia(user, [date], overrides)[date];

    // Devuelve también la zona y el corte aplicados: si algún día vuelve a
    // haber una discrepancia de fechas, se ve en la propia respuesta sin tener
    // que entrar al servidor.
    res.json({ date, timeZone, stats, goals, dayType });
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

    const [filas, user] = await Promise.all([
      getEntriesForStats(req.user.id, startStr, endStr, { timeZone }),
      getUserById(req.user.id),
    ]);

    // Serie continua (rellena los días sin registros) para que el gráfico no
    // tenga huecos.
    const series = serieDeDias(filas, startStr, days, timeZone);

    const loggedDays = series.filter((d) => d.entryCount > 0);
    const avg = (key) =>
      loggedDays.length
        ? Math.round(loggedDays.reduce((a, d) => a + d[key], 0) / loggedDays.length)
        : 0;

    // "Día en objetivo" es contra el objetivo DE ESE DÍA: con tipos de día el
    // objetivo cambia entre entrenamiento y descanso.
    const overrides = await getDayTypesInRange(req.user.id, startStr, endStr);
    const objetivos = objetivosPorDia(user, series.map((d) => d.date), overrides);

    for (const dia of series) {
      dia.dayType = objetivos[dia.date].dayType;
      dia.goal = objetivos[dia.date].goals?.calorieGoal ?? 0;
    }

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
      daysOnTarget: series.filter(
        (d) => d.entryCount > 0 && d.goal > 0 && d.calories <= d.goal * 1.05
      ).length,
      goals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Progreso de la semana (lunes a domingo) con estimación de peso perdido.
 *
 * Reglas (el detalle está en `utils/weeklyProgress.js`):
 *   · Solo suman los días con una carga coherente con la referencia de la
 *     semana; un día muy por debajo se descarta porque se supone que faltó
 *     cargar las comidas.
 *   · Los días marcados como ayuno cuentan siempre, aunque tengan 0 kcal.
 *   · El déficit se mide contra el gasto estimado del día (que cambia según su
 *     tipo: un día de descanso gasta menos), no contra el objetivo.
 *   · El "margen" semanal (saldo contra el objetivo) va aparte, en los totales.
 *
 * `?date=` elige la semana: sirve cualquier día de ella. Sin parámetro, la
 * semana en curso del usuario.
 */
export const weekStats = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const hoy = todayLogico(timeZone);
    const referencia = isYmd(req.query.date) ? req.query.date : hoy;

    const { startDate, endDate } = weekRangeOf(referencia);

    const [filas, ayunos, user] = await Promise.all([
      getEntriesForStats(req.user.id, startDate, endDate, { timeZone }),
      getFastingDays(req.user.id, startDate, endDate),
      getUserById(req.user.id),
    ]);

    const series = serieDeDias(filas, startDate, 7, timeZone);

    // Tipo de día de cada jornada (patrón semanal + marcas) y su gasto/objetivo
    const overrides = await getDayTypesInRange(req.user.id, startDate, endDate);
    const objetivos = objetivosPorDia(user, series.map((d) => d.date), overrides);

    for (const dia of series) {
      const { dayType, goals } = objetivos[dia.date];
      dia.dayType = dayType;
      dia.goal = goals?.calorieGoal ?? 0;
      dia.burn = goals?.burn ?? 0;
    }

    const progreso = computeWeeklyProgress({
      series,
      fastingDates: ayunos,
      // Respaldo para cuando un día no tiene datos corporales completos
      goals: calculateGoals(user),
      today: hoy,
    });

    res.json({
      week: {
        startDate,
        endDate,
        /** Día que se usó para elegir la semana */
        referenceDate: referencia,
        today: hoy,
        isCurrentWeek: hoy >= startDate && hoy <= endDate,
      },
      timeZone,
      // La serie cruda, por si el cliente quiere dibujar los días por su cuenta
      series,
      goals: calculateGoals(user),
      ...progreso,
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
 * Tres capas, de más inmediata a más elaborada:
 *   1. El consejo y los déficits se calculan en local (una resta exacta).
 *   2. Las sugerencias de platos salen de una base local: instantáneo.
 *   3. Solo si el usuario pide expresamente ideas nuevas (`?ai=true`) se llama
 *      al modelo, y el resultado se cachea.
 *
 * Así, el uso normal de la pantalla no consulta al modelo.
 */
export const suggestions = async (req, res, next) => {
  try {
    const timeZone = resolveTimeZone(req);
    const date = isYmd(req.query.date) ? req.query.date : todayLogico(timeZone);
    const quiereIA = req.query.ai === 'true' || req.query.ai === '1';

    const stats = await getDailyStats(req.user.id, date, { timeZone });
    const user = await getUserById(req.user.id);
    // Los huecos se calculan contra el objetivo de ese día (según su tipo)
    const overrides = await getDayTypesInRange(req.user.id, date, date);
    const { goals } = objetivosPorDia(user, [date], overrides)[date];

    const consumed = {
      calories: Number(stats.total_calories) || 0,
      protein: Number(stats.total_protein) || 0,
      carbs: Number(stats.total_carbs) || 0,
      fats: Number(stats.total_fats) || 0,
    };

    const entryCount = Number(stats.entry_count) || 0;
    const goalType = user?.goal || 'maintain';

    // Cálculo local: instantáneo
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
