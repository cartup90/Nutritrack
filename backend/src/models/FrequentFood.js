/**
 * Alimentos frecuentes.
 *
 * Guardan el desglose nutricional YA CONFIRMADO por el usuario (los macros
 * finales, no la estimación cruda de la IA) para poder registrarlos en un toque
 * sin volver a pasar la foto por el modelo.
 *
 * La deduplicación es por nombre, sin distinguir mayúsculas: si guardas dos
 * veces "Empanadas", la segunda actualiza los valores en vez de crear una copia.
 */
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { createFoodEntry } from './FoodEntry.js';

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Nombre por defecto: los alimentos unidos con " + ". */
const nombreDesdeFoods = (foods) => {
  const nombres = (Array.isArray(foods) ? foods : [])
    .map((f) => f?.name && String(f.name).trim())
    .filter(Boolean);
  const base = nombres.join(' + ');
  return base ? base.slice(0, 255) : 'Alimento frecuente';
};

/** Serializa una fila para el cliente. */
const serializar = (row) => ({
  id: row.id,
  name: row.name,
  foods: Array.isArray(row.foods) ? row.foods : [],
  totals: {
    calories: Number(row.calories) || 0,
    protein: Number(row.protein) || 0,
    carbs: Number(row.carbs) || 0,
    fats: Number(row.fats) || 0,
    fiber: Number(row.fiber) || 0,
    sugars: Number(row.sugars) || 0,
    sodium: Number(row.sodium) || 0,
  },
  portion_grams: row.portion_grams ? Number(row.portion_grams) : null,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at || null,
});

/**
 * Guarda un alimento frecuente.
 * Si ya existe otro con el mismo nombre, actualiza sus valores en vez de
 * duplicarlo.
 */
export const saveFrequentFood = async (userId, { name, foods = [], totals = {} }) => {
  const nombre = (name && String(name).trim()) || nombreDesdeFoods(foods);
  const lista = Array.isArray(foods) ? foods : [];

  const calorias = num(totals.calories);
  const proteina = num(totals.protein);
  const carbos = num(totals.carbs);
  const grasas = num(totals.fats);
  const fibra = num(totals.fiber);
  const azucares = num(totals.sugars);
  const sodio = num(totals.sodium);
  const gramos = lista.reduce((acc, f) => acc + num(f.portion_grams), 0);

  const existente = await query(
    `SELECT id FROM frequent_foods WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
    [userId, nombre]
  );

  if (existente.rows[0]) {
    const r = await query(
      `UPDATE frequent_foods
          SET name = $2, foods = $3::jsonb,
              calories = $4, protein = $5, carbs = $6, fats = $7,
              fiber = $8, sugars = $9, sodium = $10, portion_grams = $11,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        existente.rows[0].id,
        nombre,
        JSON.stringify(lista),
        calorias, proteina, carbos, grasas,
        fibra, azucares, sodio,
        gramos > 0 ? gramos : null,
      ]
    );
    return serializar(r.rows[0]);
  }

  const r = await query(
    `INSERT INTO frequent_foods
       (id, user_id, name, foods, calories, protein, carbs, fats,
        fiber, sugars, sodium, portion_grams, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
     RETURNING *`,
    [
      uuidv4(),
      userId,
      nombre,
      JSON.stringify(lista),
      calorias, proteina, carbos, grasas,
      fibra, azucares, sodio,
      gramos > 0 ? gramos : null,
    ]
  );
  return serializar(r.rows[0]);
};

/** Lista los frecuentes del usuario; los más usados primero. */
export const getFrequentFoods = async (userId) => {
  const r = await query(
    `SELECT * FROM frequent_foods
      WHERE user_id = $1
      ORDER BY COALESCE(last_used_at, created_at) DESC`,
    [userId]
  );
  return r.rows.map(serializar);
};

/** Borra un frecuente, solo si es del usuario. */
export const deleteFrequentFood = async (id, userId) => {
  const r = await query(
    `DELETE FROM frequent_foods WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return r.rows[0];
};

/**
 * Registra un alimento frecuente en el conteo del día.
 *
 * Crea una entrada de comida con los macros guardados y toca `last_used_at`
 * para que suba en la lista. NO llama a la IA: es una escritura local.
 *
 * @returns {object|null} la entrada creada, o null si el id no es del usuario.
 */
export const logFrequentFood = async (
  id,
  userId,
  { mealType = 'lunch', mealTime = null } = {}
) => {
  const r = await query(
    `SELECT * FROM frequent_foods WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  const ff = r.rows[0];
  if (!ff) return null;

  await query(`UPDATE frequent_foods SET last_used_at = NOW() WHERE id = $1`, [id]);

  const entry = await createFoodEntry({
    userId,
    mealType,
    mealTime,
    foods: Array.isArray(ff.foods) ? ff.foods : [],
    totals: {
      calories: Number(ff.calories) || 0,
      protein: Number(ff.protein) || 0,
      carbs: Number(ff.carbs) || 0,
      fats: Number(ff.fats) || 0,
      fiber: Number(ff.fiber) || 0,
      sugars: Number(ff.sugars) || 0,
      sodium: Number(ff.sodium) || 0,
    },
    aiTotals: null,
    imageUrl: null,
    confirmedAt: new Date().toISOString(),
  });

  return entry;
};
