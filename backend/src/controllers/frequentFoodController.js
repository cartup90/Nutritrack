/**
 * Controlador de alimentos frecuentes.
 *
 * Permiten guardar un desglose nutricional ya confirmado y registrarlo después
 * en un toque, sin volver a llamar a la IA.
 */
import {
  deleteFrequentFood,
  getFrequentFoods,
  logFrequentFood,
  saveFrequentFood,
} from '../models/FrequentFood.js';

/** GET /frequent — lista los alimentos frecuentes del usuario. */
export const listFrequent = async (req, res, next) => {
  try {
    const frecuentes = await getFrequentFoods(req.user.id);
    res.json({ frecuentes, count: frecuentes.length });
  } catch (error) {
    next(error);
  }
};

/** POST /frequent — guarda (o actualiza) un alimento frecuente. */
export const addFrequent = async (req, res, next) => {
  try {
    const { name, foods, totals } = req.body || {};

    if (!Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({ error: 'Faltan los alimentos a guardar' });
    }
    if (!totals || totals.calories === undefined) {
      return res.status(400).json({ error: 'Faltan los valores nutricionales' });
    }

    const frecuente = await saveFrequentFood(req.user.id, { name, foods, totals });
    res.status(201).json({ frecuente });
  } catch (error) {
    next(error);
  }
};

/** DELETE /frequent/:id — borra un alimento frecuente. */
export const removeFrequent = async (req, res, next) => {
  try {
    const borrado = await deleteFrequentFood(req.params.id, req.user.id);

    if (!borrado) {
      return res.status(404).json({ error: 'Alimento frecuente no encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /frequent/:id/log — registra el frecuente en el conteo del día.
 *
 * No llama a la IA: reutiliza los macros ya guardados. Es una escritura local.
 */
export const logFrequent = async (req, res, next) => {
  try {
    const { mealType = 'lunch', mealTime = null } = req.body || {};

    const entry = await logFrequentFood(req.params.id, req.user.id, {
      mealType,
      mealTime,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Alimento frecuente no encontrado' });
    }

    res.status(201).json({ message: 'Comida registrada', entry });
  } catch (error) {
    next(error);
  }
};
