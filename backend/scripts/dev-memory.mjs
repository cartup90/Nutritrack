/**
 * Servidor de desarrollo con base de datos **en memoria**.
 *
 * Permite probar la app completa sin instalar PostgreSQL ni Docker.
 * Los datos viven solo mientras el proceso está en marcha: al reiniciar,
 * la base se recrea vacía (usa `--seed` para volver a tener datos de demo).
 *
 * Uso (desde backend/):
 *   npm run dev:memory           → API en http://localhost:5000
 *   npm run dev:memory -- --seed → además crea un usuario de demo con historial
 *
 * Usuario de demo (con --seed):  demo@nutritrack.app / demo1234
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createInMemoryDatabase } from './memory-db.mjs';

const shouldSeed = process.argv.includes('--seed');

// Valores por defecto para que funcione sin necesidad de crear un .env.
// Son deliberadamente inseguros: solo valen para desarrollo local.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev-secret-solo-para-desarrollo-local-no-usar-en-produccion';
}
if (!process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS = 'http://localhost:5173,http://localhost:4173';
}
if (!process.env.PORT) {
  process.env.PORT = '5000';
}

// 1) Base en memoria ANTES de cargar la app
const { query } = createInMemoryDatabase();

const { setQueryImplementation } = await import('../src/config/database.js');
setQueryImplementation(query);

// Aviso si falta la API key: el resto de la app funciona igual
if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY.startsWith('sk-tu')) {
  console.warn(
    '\n⚠️  DEEPSEEK_API_KEY no configurada: el análisis de fotos fallará,\n' +
      '   pero puedes probar registro, login, perfil y registro manual.\n'
  );
}

// 2) Seed opcional
if (shouldSeed) {
  await seedDemoData();
}

// 3) Arrancar la API (server.js lee DATABASE_URL, pero el query ya está inyectado)
const { default: server } = await import('../src/server.js');

console.log('🧠 Base de datos: PostgreSQL EN MEMORIA (los datos se pierden al salir)');
if (shouldSeed) {
  console.log('👤 Usuario de demo: demo@nutritrack.app / demo1234');
}
console.log('   Para usar PostgreSQL real: configura DATABASE_URL y ejecuta "npm run dev"\n');

// ---------------------------------------------------------------------------
// Datos de demostración
// ---------------------------------------------------------------------------
async function seedDemoData() {
  const email = 'demo@nutritrack.app';
  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.length > 0) return;

  const userId = uuidv4();
  const password = await bcrypt.hash('demo1234', 10);

  await query(
    `INSERT INTO users (id, email, password, name, age, gender, height, weight, activity_level, goal, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [userId, email, password, 'Ana Demo', 30, 'female', 165, 65, 'moderate', 'maintain']
  );

  // Plan de comidas de ejemplo, repetido durante los últimos 7 días
  const dayPlan = [
    {
      mealType: 'breakfast',
      mealTime: '08:00',
      foods: [
        { name: 'Avena con leche', portion_grams: 250, calories: 220, protein: 10, carbs: 35, fats: 5 },
        { name: 'Plátano', portion_grams: 120, calories: 105, protein: 1.3, carbs: 27, fats: 0.4 },
      ],
    },
    {
      mealType: 'lunch',
      mealTime: '13:30',
      foods: [
        { name: 'Pechuga de pollo', portion_grams: 150, calories: 248, protein: 46, carbs: 0, fats: 5 },
        { name: 'Arroz blanco', portion_grams: 180, calories: 234, protein: 4.9, carbs: 51, fats: 0.5 },
        { name: 'Ensalada mixta', portion_grams: 90, calories: 25, protein: 1.5, carbs: 4, fats: 0.2 },
      ],
    },
    {
      mealType: 'snack',
      mealTime: '17:00',
      foods: [
        { name: 'Yogur griego', portion_grams: 150, calories: 130, protein: 15, carbs: 6, fats: 5 },
        { name: 'Nueces', portion_grams: 25, calories: 164, protein: 3.8, carbs: 3.4, fats: 16.3 },
      ],
    },
    {
      mealType: 'dinner',
      mealTime: '21:00',
      foods: [
        { name: 'Salmón a la plancha', portion_grams: 140, calories: 280, protein: 39, carbs: 0, fats: 13 },
        { name: 'Verduras al vapor', portion_grams: 200, calories: 70, protein: 4, carbs: 12, fats: 0.5 },
      ],
    },
  ];

  // Pequeña variación por día para que las gráficas no salgan planas
  const variation = [0, 0.06, -0.05, 0.12, -0.08, 0.04, -0.02];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const factor = 1 + variation[6 - daysAgo];

    for (const meal of dayPlan) {
      // Algún día sin cena, para que el historial no sea perfecto
      if (daysAgo === 4 && meal.mealType === 'dinner') continue;

      const [hours, minutes] = meal.mealTime.split(':').map(Number);
      const when = new Date();
      when.setDate(when.getDate() - daysAgo);
      when.setHours(hours, minutes, 0, 0);

      const foods = meal.foods.map((f) => ({
        ...f,
        calories: Math.round(f.calories * factor),
        protein: Math.round(f.protein * factor * 10) / 10,
        carbs: Math.round(f.carbs * factor * 10) / 10,
        fats: Math.round(f.fats * factor * 10) / 10,
      }));

      const totals = foods.reduce(
        (acc, f) => ({
          calories: acc.calories + f.calories,
          protein: acc.protein + f.protein,
          carbs: acc.carbs + f.carbs,
          fats: acc.fats + f.fats,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      );

      await query(
        `INSERT INTO food_entries
           (id, user_id, meal_type, meal_time, foods,
            calories, protein, carbs, fats,
            ai_calories, ai_protein, ai_carbs, ai_fats, ai_confidence,
            image_url, estimated_at, confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb,
                 $6, $7, $8, $9,
                 $10, $11, $12, $13, $14,
                 NULL, $15, $15, $15, NOW())`,
        [
          uuidv4(),
          userId,
          meal.mealType,
          meal.mealTime,
          JSON.stringify(foods),
          totals.calories,
          totals.protein,
          totals.carbs,
          totals.fats,
          Math.round(totals.calories * 1.05),
          Math.round(totals.protein * 1.05 * 10) / 10,
          Math.round(totals.carbs * 1.05 * 10) / 10,
          Math.round(totals.fats * 1.05 * 10) / 10,
          78,
          when.toISOString(),
        ]
      );
    }
  }

  console.log('🌱 Datos de demostración creados (7 días de comidas)');
}
