/**
 * Tests de integración end-to-end de la API.
 *
 * Levanta la app real (Express + multer + sharp + capa de modelos) contra una
 * base PostgreSQL en memoria (pg-mem) y un servidor que simula la API de
 * DeepSeek. Así se ejercita el flujo completo:
 *
 *   registro → login → análisis de imagen con IA → guardado → estadísticas
 *
 * Ejecutar con:  npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createInMemoryDatabase } from '../scripts/memory-db.mjs';

// ---------------------------------------------------------------------------
// Entorno de test (debe fijarse ANTES de importar la app)
// ---------------------------------------------------------------------------
const TMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'nutritrack-test-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-no-usar-en-produccion';
process.env.JWT_EXPIRES_IN = '1h';
process.env.IMAGE_UPLOAD_PATH = TMP_UPLOADS;
process.env.IMAGE_MAX_SIZE_MB = '8';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.DEEPSEEK_API_KEY = 'test-key';

// ---------------------------------------------------------------------------
// Base de datos en memoria (mismo helper que usa npm run dev:memory)
// ---------------------------------------------------------------------------
const { query: memQuery } = createInMemoryDatabase();

const { setQueryImplementation } = await import('../src/config/database.js');
setQueryImplementation(memQuery);

// ---------------------------------------------------------------------------
// Servidor simulado de DeepSeek
// ---------------------------------------------------------------------------
let deepseekResponse = null; // permite forzar respuestas concretas
let deepseekRawContent = null; // fuerza contenido crudo (p. ej. markdown)
let deepseekStatus = 200;
let lastDeepseekRequest = null;

const deepseekMock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    lastDeepseekRequest = { headers: req.headers, body: JSON.parse(body || '{}') };

    if (deepseekStatus !== 200) {
      res.writeHead(deepseekStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: deepseekResponse?.error || 'boom' } }));
      return;
    }

    // `deepseekRawContent` permite simular respuestas no-JSON (p. ej. markdown)
    const content =
      deepseekRawContent ??
      JSON.stringify(deepseekResponse);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

await new Promise((resolve) => deepseekMock.listen(0, '127.0.0.1', resolve));
process.env.DEEPSEEK_API_URL = `http://127.0.0.1:${deepseekMock.address().port}/v1/chat/completions`;

// ---------------------------------------------------------------------------
// App bajo test
// ---------------------------------------------------------------------------
const { createApp } = await import('../src/app.js');

const app = createApp({ enableLogging: false });
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));

const BASE = `http://127.0.0.1:${server.address().port}/api`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const request = async (method, url, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  const text = await res.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: res.status, body: json, text };
};

const makeJpeg = (width = 800, height = 600) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();

const imageForm = (buffer, filename = 'plato.jpg', type = 'image/jpeg') => {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type }), filename);
  return form;
};

const registerUser = async (email, extra = {}) => {
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Test User',
      email,
      password: 'secreto123',
      age: 30,
      gender: 'female',
      height: 165,
      weight: 65,
      activityLevel: 'moderate',
      goal: 'maintain',
      ...extra,
    },
  });
  return res;
};

// Análisis estándar devuelto por el mock de IA
const CANNED_ANALYSIS = {
  foods: [
    { name: 'Pechuga de pollo', portion_grams: 150, calories: 248, protein: 46, carbs: 0, fats: 5 },
    { name: 'Arroz blanco', portion_grams: 180, calories: 234, protein: 4.9, carbs: 51, fats: 0.5 },
    { name: 'Ensalada mixta', portion_grams: 90, calories: 25, protein: 1.5, carbs: 4, fats: 0.2 },
  ],
  total_calories: 507,
  total_protein: 52.4,
  total_carbs: 55,
  total_fats: 5.7,
  fiber: 3.1,
  sugars: 2,
  sodium: 420,
  confidence: 82,
  notes: 'Porciones estimadas según el tamaño del plato.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('GET /health responde ok', async () => {
  const res = await request('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('Registro: valida campos obligatorios', async () => {
  const res = await request('POST', '/auth/register', { body: { email: 'x@y.com' } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /obligatorios/i);
});

test('Registro: rechaza email inválido', async () => {
  const res = await request('POST', '/auth/register', {
    body: { name: 'A', email: 'no-es-email', password: 'secreto123' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /formato/i);
});

test('Registro: rechaza contraseña corta', async () => {
  const res = await request('POST', '/auth/register', {
    body: { name: 'A', email: 'corta@test.com', password: '123' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /6 caracteres/i);
});

let token = null;

test('Registro: crea el usuario, devuelve token y objetivos calculados', async () => {
  const res = await registerUser('ana@test.com');
  assert.equal(res.status, 201);
  assert.ok(res.body.token, 'debe devolver un token');
  assert.equal(res.body.user.email, 'ana@test.com');
  assert.equal(res.body.user.password, undefined, 'nunca debe devolver el hash');

  // Mifflin-St Jeor: 10*65 + 6.25*165 - 5*30 - 161 = 1370.25 TMB
  // TDEE = 1370.25 * 1.55 = 2123.9 → maintain → 2124 kcal
  assert.equal(res.body.goals.bmr, 1370);
  assert.equal(res.body.goals.tdee, 2124);
  assert.equal(res.body.goals.calorieGoal, 2124);

  // La proteína se calcula por kg de peso, no como % de las calorías:
  // maintain → 1,6 g/kg × 65 kg = 104 g
  assert.equal(res.body.goals.proteinGoal, 104);
  assert.equal(res.body.goals.proteinGPerKg, 1.6);

  // Y los macros deben cuadrar con el objetivo calórico
  const suma =
    res.body.goals.proteinGoal * 4 +
    res.body.goals.carbGoal * 4 +
    res.body.goals.fatGoal * 9;
  assert.ok(Math.abs(suma - 2124) <= 6, `los macros suman ${suma}, no 2124`);

  token = res.body.token;
});

test('Registro: rechaza email duplicado', async () => {
  const res = await registerUser('ana@test.com');
  assert.equal(res.status, 409);
});

test('Registro: normaliza el email a minúsculas', async () => {
  const res = await registerUser('MAYUS@TEST.COM');
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'mayus@test.com');
});

test('Login: rechaza contraseña incorrecta', async () => {
  const res = await request('POST', '/auth/login', {
    body: { email: 'ana@test.com', password: 'incorrecta' },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /incorrectos/i);
});

test('Login: rechaza usuario inexistente con el mismo mensaje', async () => {
  const res = await request('POST', '/auth/login', {
    body: { email: 'nadie@test.com', password: 'secreto123' },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /incorrectos/i);
});

test('Login: autentica correctamente', async () => {
  const res = await request('POST', '/auth/login', {
    body: { email: 'ana@test.com', password: 'secreto123' },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  token = res.body.token;
});

test('Perfil: requiere autenticación', async () => {
  const res = await request('GET', '/profile');
  assert.equal(res.status, 401);
});

test('Perfil: devuelve datos y objetivos', async () => {
  const res = await request('GET', '/profile', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'ana@test.com');
  assert.equal(res.body.goals.calorieGoal, 2124);
});

test('Perfil: recalcula objetivos al cambiar a "bajar de peso"', async () => {
  const res = await request('PUT', '/profile', {
    token,
    body: { weight: 70, goal: 'lose_weight' },
  });
  assert.equal(res.status, 200);

  // TMB = 10*70 + 6.25*165 - 5*30 - 161 = 1420.25 ; TDEE = 2201.4
  assert.equal(res.body.goals.bmr, 1420);
  // lose_weight con intensidad moderada => 80% de 2201.4 = 1761.1
  assert.equal(res.body.goals.calorieGoal, 1761);
  assert.equal(res.body.goals.intensity, 'moderate');
  assert.equal(res.body.goals.ajusteKcal, -440); // 1761 - 2201
  assert.equal(res.body.goals.floorApplied, false);
});

test('Análisis IA: sin token devuelve 401', async () => {
  const res = await request('POST', '/food/analyze', { form: imageForm(await makeJpeg()) });
  assert.equal(res.status, 401);
});

test('Análisis IA: sin archivo devuelve 400', async () => {
  const res = await request('POST', '/food/analyze', { token, form: new FormData() });
  assert.equal(res.status, 400);
});

test('Análisis IA: rechaza archivos que no son imágenes', async () => {
  const form = new FormData();
  form.append('image', new Blob(['no soy una imagen'], { type: 'text/plain' }), 'x.txt');
  const res = await request('POST', '/food/analyze', { token, form });
  assert.equal(res.status, 415);
});

test('Análisis IA: sin API key configurada devuelve 503', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(await makeJpeg(400, 300)),
  });

  process.env.DEEPSEEK_API_KEY = saved;

  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'MISSING_API_KEY');
});

test('Análisis IA: error de la API se propaga con código', async () => {
  deepseekStatus = 429;
  deepseekResponse = { error: 'rate limited' };

  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(await makeJpeg(400, 300)),
  });

  deepseekStatus = 200;
  deepseekResponse = CANNED_ANALYSIS;

  assert.equal(res.status, 502);
  assert.equal(res.body.code, 'RATE_LIMIT');
});

test('Análisis IA: normaliza la respuesta y optimiza la imagen', async () => {
  deepseekResponse = CANNED_ANALYSIS;

  const original = await makeJpeg(1600, 1200);
  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(original),
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.foods.length, 3);
  assert.equal(res.body.analysis.foods[0].name, 'Pechuga de pollo');
  assert.equal(res.body.analysis.total_calories, 507);
  assert.equal(res.body.analysis.confidence, 82);
  assert.equal(res.body.analysis.needs_review, false);

  // La imagen se guardó y se redujo (máx 1024px, JPEG calidad 82)
  assert.match(res.body.imageUrl, /^\/uploads\/[0-9a-f-]+\.jpg$/);

  const saved = path.join(TMP_UPLOADS, path.basename(res.body.imageUrl));
  assert.ok(fs.existsSync(saved), 'la imagen optimizada debe existir en disco');
  assert.ok(
    fs.statSync(saved).size < original.length,
    'la imagen guardada debe pesar menos que la original'
  );

  const meta = await sharp(saved).metadata();
  assert.ok(meta.width <= 1024 && meta.height <= 1024);
  assert.equal(meta.format, 'jpeg');

  // La petición al modelo incluyó la imagen como data-URL base64
  const imageUrl = lastDeepseekRequest.body.messages[0].content[0].image_url.url;
  assert.ok(imageUrl.startsWith('data:image/jpeg;base64,'));

  // El prompt exige JSON y pide los campos clave
  const prompt = lastDeepseekRequest.body.messages[0].content[1].text;
  assert.match(prompt, /JSON/);
  assert.equal(lastDeepseekRequest.body.response_format.type, 'json_object');

  globalThis.__analyzedImageUrl = res.body.imageUrl;
  globalThis.__analyzedAnalysis = res.body.analysis;
});

test('Análisis IA: tolera JSON envuelto en markdown', async () => {
  // El modelo a veces envuelve el JSON en un bloque de código
  deepseekRawContent = '```json\n' + JSON.stringify(CANNED_ANALYSIS) + '\n```';

  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(await makeJpeg(400, 300)),
  });

  deepseekRawContent = null;

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.foods.length, 3);
  assert.equal(res.body.analysis.total_calories, 507);
});

test('Análisis IA: admite customName en req.body para guiar el análisis', async () => {
  deepseekResponse = CANNED_ANALYSIS;

  const form = imageForm(await makeJpeg(400, 300));
  form.append('customName', 'tarta de atun');

  const res = await request('POST', '/food/analyze', {
    token,
    form,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.foods.length, 3);
  assert.match(lastDeepseekRequest.body.messages[0].content[1].text, /tarta de atun/);
});

test('Análisis IA: imagen sin comida devuelve foods vacío y needs_review', async () => {
  deepseekResponse = {
    foods: [],
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fats: 0,
    confidence: 10,
    notes: 'La imagen no muestra comida.',
  };

  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(await makeJpeg(400, 300)),
  });

  deepseekResponse = CANNED_ANALYSIS;

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.foods.length, 0);
  assert.equal(res.body.analysis.needs_review, true);
});

test('Análisis IA: completa los totales si el modelo los omite', async () => {
  deepseekResponse = {
    foods: [
      { name: 'Manzana', portion_grams: 180, calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
      { name: 'Yogur', portion_grams: 125, calories: 60, protein: 10, carbs: 5, fats: 0 },
    ],
    confidence: 90,
  };

  const res = await request('POST', '/food/analyze', {
    token,
    form: imageForm(await makeJpeg(400, 300)),
  });

  deepseekResponse = CANNED_ANALYSIS;

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.total_calories, 155); // 95 + 60
  assert.equal(res.body.analysis.total_protein, 10.5);
});

let entryId = null;

test('Guardar comida: persiste los valores confirmados y los de la IA', async () => {
  const res = await request('POST', '/food', {
    token,
    body: {
      mealType: 'lunch',
      mealTime: '13:30',
      foods: globalThis.__analyzedAnalysis.foods,
      // El usuario corrige la estimación de la IA
      totals: { calories: 480, protein: 50, carbs: 52, fats: 6, fiber: 3, sugars: 2, sodium: 400 },
      aiTotals: {
        calories: globalThis.__analyzedAnalysis.total_calories,
        protein: globalThis.__analyzedAnalysis.total_protein,
        carbs: globalThis.__analyzedAnalysis.total_carbs,
        fats: globalThis.__analyzedAnalysis.total_fats,
        confidence: globalThis.__analyzedAnalysis.confidence,
      },
      imageUrl: globalThis.__analyzedImageUrl,
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.entry.calories, 480);
  assert.equal(Number(res.body.entry.ai_calories), 507);
  assert.equal(Number(res.body.entry.ai_confidence), 82);
  assert.ok(res.body.entry.confirmed_at, 'debe quedar marcado como confirmado');
  assert.equal(res.body.entry.image_url, globalThis.__analyzedImageUrl);
  assert.equal(res.body.entry.foods.length, 3);

  entryId = res.body.entry.id;
});

test('Guardar comida: rechaza payload sin totales', async () => {
  const res = await request('POST', '/food', { token, body: { mealType: 'lunch' } });
  assert.equal(res.status, 400);
});

test('Entrada manual: guarda sin imagen y confirmada', async () => {
  const res = await request('POST', '/food/manual', {
    token,
    body: {
      mealType: 'breakfast',
      foods: [{ name: 'Café con leche', calories: 60, protein: 3, carbs: 5, fats: 3 }],
      totals: { calories: 60, protein: 3, carbs: 5, fats: 3 },
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.entry.calories, 60);
  assert.equal(res.body.entry.image_url, null);
  assert.ok(res.body.entry.confirmed_at);
});

test('Listado: devuelve las comidas del usuario', async () => {
  const res = await request('GET', '/food', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
});

test('Estadísticas diarias: suma los macros del día', async () => {
  const today = new Date().toISOString().split('T')[0];
  const res = await request('GET', `/food/stats/daily?date=${today}`, { token });

  assert.equal(res.status, 200);
  assert.equal(Number(res.body.stats.total_calories), 540); // 480 + 60
  assert.equal(Number(res.body.stats.total_protein), 53); // 50 + 3
  assert.equal(res.body.stats.entry_count, 2);
  assert.equal(res.body.goals.calorieGoal, 1761);
});

test('Estadísticas por rango: serie continua de 7 días', async () => {
  const res = await request('GET', '/food/stats/range?days=7', { token });

  assert.equal(res.status, 200);
  assert.equal(res.body.series.length, 7, 'debe rellenar los días sin datos');
  assert.equal(res.body.daysLogged, 1);
  assert.equal(res.body.daysOnTarget, 1);

  const todayRow = res.body.series.at(-1);
  assert.equal(todayRow.calories, 540);
  assert.equal(todayRow.entryCount, 2);
});

test('Estadísticas por rango: limita el número de días a 90', async () => {
  const res = await request('GET', '/food/stats/range?days=500', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.series.length, 90);
});

test('Editar: actualiza los valores del registro', async () => {
  const res = await request('PUT', `/food/${entryId}`, {
    token,
    body: { calories: 500, protein: 55 },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.entry.calories, 500);
  assert.equal(Number(res.body.entry.protein), 55);
});

test('Editar: devuelve 404 para un id inexistente', async () => {
  const res = await request('PUT', '/food/no-existe', {
    token,
    body: { calories: 100 },
  });
  assert.equal(res.status, 404);
});

test('Aislamiento: otro usuario no puede ver ni modificar el registro', async () => {
  const other = await registerUser('beto@test.com');
  const otherToken = other.body.token;

  const list = await request('GET', '/food', { token: otherToken });
  assert.equal(list.body.count, 0, 'no debe ver comidas de otros');

  const update = await request('PUT', `/food/${entryId}`, {
    token: otherToken,
    body: { calories: 1 },
  });
  assert.equal(update.status, 404);

  const del = await request('DELETE', `/food/${entryId}`, { token: otherToken });
  assert.equal(del.status, 404);
});

test('Eliminar: borra el registro y su imagen del disco', async () => {
  const imagePath = path.join(TMP_UPLOADS, path.basename(globalThis.__analyzedImageUrl));
  assert.ok(fs.existsSync(imagePath), 'la imagen debe existir antes de borrar');

  const res = await request('DELETE', `/food/${entryId}`, { token });
  assert.equal(res.status, 200);

  assert.ok(!fs.existsSync(imagePath), 'la imagen debe eliminarse con el registro');

  const after = await request('GET', '/food', { token });
  assert.equal(after.body.count, 1);
});

test('Macros: la proteína se calcula por kg de peso, no por % de calorías', async () => {
  // Dos personas con el MISMO objetivo calórico pero pesos distintos deben
  // recibir proteína distinta: es el motivo del cambio.
  const base = {
    password: 'secreto123',
    age: 30,
    gender: 'female',
    height: 170,
    activityLevel: 'moderate',
    goal: 'maintain',
  };

  const ligera = await request('POST', '/auth/register', {
    body: { ...base, name: 'Ligera', email: `lig-${Date.now()}@test.com`, weight: 55 },
  });
  const pesada = await request('POST', '/auth/register', {
    body: { ...base, name: 'Pesada', email: `pes-${Date.now()}@test.com`, weight: 80 },
  });

  assert.equal(ligera.status, 201);
  assert.equal(pesada.status, 201);

  // Mismo g/kg pero gramos distintos
  assert.equal(ligera.body.goals.proteinGPerKg, 1.6);
  assert.equal(pesada.body.goals.proteinGPerKg, 1.6);
  assert.equal(ligera.body.goals.proteinGoal, Math.round(55 * 1.6));
  assert.equal(pesada.body.goals.proteinGoal, Math.round(80 * 1.6));
  assert.ok(
    pesada.body.goals.proteinGoal > ligera.body.goals.proteinGoal,
    'la persona más pesada necesita más proteína'
  );
});

test('Macros: en déficit la proteína sube para proteger el músculo', async () => {
  const base = {
    password: 'secreto123',
    name: 'Deficit',
    age: 30,
    gender: 'female',
    height: 165,
    weight: 70,
    activityLevel: 'moderate',
    goal: 'lose_weight',
  };

  const niveles = {};
  for (const intensity of ['mild', 'moderate', 'aggressive']) {
    const res = await request('POST', '/auth/register', {
      body: { ...base, email: `def-${intensity}-${Date.now()}@test.com`, goalIntensity: intensity },
    });
    niveles[intensity] = res.body.goals;
  }

  assert.equal(niveles.mild.proteinGPerKg, 1.8);
  assert.equal(niveles.moderate.proteinGPerKg, 2.0);
  assert.equal(niveles.aggressive.proteinGPerKg, 2.3);

  // Más déficit implica más proteína por kg
  assert.ok(niveles.aggressive.proteinGoal > niveles.moderate.proteinGoal);
  assert.ok(niveles.moderate.proteinGoal > niveles.mild.proteinGoal);
});

test('Macros: los topes evitan repartos imposibles', async () => {
  // Persona de peso alto con objetivo bajo: sin topes, la proteína por kg
  // acapararía las calorías y la grasa se dispararía.
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Pesado',
      email: `topes-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 45,
      gender: 'male',
      height: 180,
      weight: 100,
      activityLevel: 'sedentary',
      goal: 'lose_weight',
      goalIntensity: 'aggressive',
    },
  });

  const g = res.body.goals;
  const pct = g.macroSplit;

  assert.ok(pct.protein <= 45, `proteína al ${pct.protein}%, debería estar topada al 45%`);
  assert.ok(pct.fats <= 36, `grasa al ${pct.fats}%, debería estar topada al 35%`);
  assert.ok(pct.carbs > 0, 'debe quedar margen para carbohidratos');

  const suma = g.proteinGoal * 4 + g.carbGoal * 4 + g.fatGoal * 9;
  assert.ok(Math.abs(suma - g.calorieGoal) <= 6, 'los macros deben cuadrar');
});

test('Macros: con objetivo muy bajo se avisa del ajuste', async () => {
  // Perfil menudo con el suelo de seguridad activado
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Menuda',
      email: `ajuste-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 55,
      gender: 'female',
      height: 148,
      weight: 95,
      activityLevel: 'sedentary',
      goal: 'lose_weight',
      goalIntensity: 'aggressive',
    },
  });

  const g = res.body.goals;
  const suma = g.proteinGoal * 4 + g.carbGoal * 4 + g.fatGoal * 9;

  assert.ok(Math.abs(suma - g.calorieGoal) <= 6, 'los macros deben cuadrar igualmente');
  assert.ok(g.fatGoal > 0, 'nunca grasa cero');
  assert.ok(g.proteinGoal > 0, 'nunca proteína cero');
  assert.ok(g.carbGoal >= 0, 'carbohidratos no negativos');
});

test('Sugerencias: por defecto usa la base local y NO llama a la IA', async () => {
  // Contamos las llamadas al modelo para demostrar que no se consulta
  let llamadas = 0;
  const original = deepseekMock.listeners('request')[0];
  deepseekMock.removeAllListeners('request');
  deepseekMock.on('request', (req, res) => {
    llamadas += 1;
    original(req, res);
  });

  const res = await request('GET', '/food/suggestions', { token });

  deepseekMock.removeAllListeners('request');
  deepseekMock.on('request', original);

  assert.equal(res.status, 200);
  assert.equal(llamadas, 0, 'el uso normal NO debe gastar tokens');
  assert.equal(res.body.source, 'local');
  assert.equal(res.body.cached, false);

  // Debe proponer varios platos
  assert.ok(res.body.suggestions.length >= 3, 'esperaba 3 o más sugerencias');

  // Cada sugerencia trae macros coherentes
  for (const s of res.body.suggestions) {
    assert.ok(s.name, 'debe tener nombre');
    assert.ok(s.why, 'debe explicar por qué');
    assert.ok(s.calories > 0);
    assert.equal(typeof s.protein, 'number');
    assert.ok(Array.isArray(s.ingredients));
  }

  // Los déficits son objetos calculados en el backend
  assert.ok(Array.isArray(res.body.gaps));
  for (const gap of res.body.gaps) {
    assert.ok(gap.label);
    assert.equal(typeof gap.remaining, 'number');
    assert.equal(gap.unit, 'g');
  }
  assert.ok(res.body.gaps.some((g) => g.key === 'protein'), 'debe detectar proteína');

  // Consejo determinista, siempre presente y sin coste
  assert.ok(res.body.advice.length > 0);
});

test('Sugerencias locales: encajan en las calorías que quedan', async () => {
  const res = await request('GET', '/food/suggestions', { token });

  assert.equal(res.body.source, 'local');
  const restantes = res.body.kcalRestantes;
  assert.ok(restantes > 0, 'este usuario debe tener margen');

  for (const s of res.body.suggestions) {
    assert.ok(
      s.calories <= restantes + 60,
      `"${s.name}" aporta ${s.calories} kcal pero solo quedan ${restantes}`
    );
  }
});

test('Sugerencias locales: no repiten lo que ya se ha comido hoy', async () => {
  // Registramos un plato que existe en la base local
  await request('POST', '/food/manual', {
    token,
    body: {
      mealType: 'lunch',
      foods: [{ name: 'Pechuga de pollo' }],
      totals: { calories: 300, protein: 40, carbs: 2, fats: 8 },
    },
  });

  const res = await request('GET', '/food/suggestions?mealType=lunch', { token });
  const nombres = res.body.suggestions.map((s) => s.name.toLowerCase());

  assert.ok(
    !nombres.some((n) => n.includes('pollo con arroz')),
    'no debe volver a proponer algo con pollo ya comido hoy'
  );
});

test('Sugerencias locales: el tipo de comida cambia la propuesta', async () => {
  const desayuno = await request('GET', '/food/suggestions?mealType=breakfast', { token });
  const snack = await request('GET', '/food/suggestions?mealType=snack', { token });

  assert.equal(desayuno.body.source, 'local');
  assert.equal(snack.body.source, 'local');

  const nombresDesayuno = desayuno.body.suggestions.map((s) => s.name);
  const nombresSnack = snack.body.suggestions.map((s) => s.name);

  assert.notDeepEqual(
    nombresDesayuno,
    nombresSnack,
    'un desayuno no debe proponer lo mismo que un snack'
  );
});

test('Sugerencias: ?ai=true consulta a la IA y la cachea', async () => {
  deepseekResponse = {
    summary: 'Resumen del modelo',
    suggestions: [
      {
        name: 'Plato generado por IA',
        why: 'Porque sí.',
        meal_type: 'lunch',
        calories: 400,
        protein: 30,
        carbs: 40,
        fats: 12,
        ingredients: ['Ingrediente A'],
      },
    ],
  };

  const primera = await request('GET', '/food/suggestions?ai=true', { token });
  assert.equal(primera.status, 200);
  assert.equal(primera.body.source, 'ai');
  assert.equal(primera.body.cached, false);
  assert.equal(primera.body.suggestions[0].name, 'Plato generado por IA');
  // Y además devuelve las locales como alternativa
  assert.ok(Array.isArray(primera.body.localSuggestions));

  // Segunda vez: debe venir de caché y no gastar tokens
  const segunda = await request('GET', '/food/suggestions?ai=true', { token });
  assert.equal(segunda.body.cached, true);
  assert.equal(segunda.body.source, 'ai');
  assert.deepEqual(
    segunda.body.suggestions.map((s) => s.name),
    primera.body.suggestions.map((s) => s.name)
  );

  deepseekResponse = CANNED_ANALYSIS;
});

test('Sugerencias: registrar una comida invalida la caché de la IA', async () => {
  const antes = await request('GET', '/food/suggestions?ai=true', { token });
  assert.equal(antes.body.cached, true, 'debería estar cacheada del test anterior');

  const alta = await request('POST', '/food/manual', {
    token,
    body: {
      mealType: 'snack',
      foods: [{ name: 'Puñado de nueces' }],
      totals: { calories: 190, protein: 5, carbs: 4, fats: 18 },
    },
  });
  assert.equal(alta.status, 201);

  const despues = await request('GET', '/food/suggestions?ai=true', { token });
  assert.equal(despues.body.cached, false, 'debe recalcularse tras registrar comida');
  assert.ok(despues.body.consumed.calories > antes.body.consumed.calories);

  deepseekResponse = CANNED_ANALYSIS;
});

test('Sugerencias: cambiar el perfil limpia la caché de la IA', async () => {
  await request('GET', '/food/suggestions?ai=true', { token }); // deja algo cacheado

  const perfil = await request('PUT', '/profile', {
    token,
    body: { weight: 68, goal: 'gain_muscle' },
  });
  assert.equal(perfil.status, 200);

  const res = await request('GET', '/food/suggestions?ai=true', { token });
  assert.equal(res.body.cached, false, 'los objetivos cambiaron: la caché no vale');

  // Restauramos el perfil para no afectar a otros tests
  await request('PUT', '/profile', { token, body: { weight: 70, goal: 'lose_weight' } });
  deepseekResponse = CANNED_ANALYSIS;
});

test('Sugerencias: sin API key las locales siguen funcionando', async () => {
  const guardada = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  // Sin pedir IA: funcionan las locales, 0 tokens y sin errores
  const locales = await request('GET', '/food/suggestions', { token });

  // Pidiendo IA: la IA falla, pero se degrada con elegancia a las locales
  const conIA = await request('GET', '/food/suggestions?ai=true&date=1999-01-01', { token });

  process.env.DEEPSEEK_API_KEY = guardada;

  assert.equal(locales.status, 200, 'las locales no dependen de la API key');
  assert.equal(locales.body.source, 'local');
  assert.ok(locales.body.suggestions.length > 0);

  assert.equal(conIA.status, 200, 'no debe romper: devuelve las locales');
  assert.equal(conIA.body.source, 'local');
  assert.equal(conIA.body.aiErrorCode, 'MISSING_API_KEY');
  assert.ok(conIA.body.suggestions.length > 0, 'el usuario no se queda sin nada');
});

test('Intensidad: leve, moderada y agresiva dan objetivos distintos', async () => {
  // Mismo perfil, solo cambia la intensidad
  const perfil = {
    age: 30,
    gender: 'female',
    height: 165,
    weight: 70,
    activityLevel: 'moderate',
    goal: 'lose_weight',
  };

  const resultados = {};
  for (const intensity of ['mild', 'moderate', 'aggressive']) {
    const res = await request('POST', '/auth/register', {
      body: {
        name: 'Intensidad',
        email: `int-${intensity}-${Date.now()}-${Math.random()}@test.com`,
        password: 'secreto123',
        ...perfil,
        goalIntensity: intensity,
      },
    });
    assert.equal(res.status, 201);
    resultados[intensity] = res.body.goals;
  }

  // TDEE = 2201.4 ; multiplicadores 0.90 / 0.80 / 0.75
  assert.equal(resultados.mild.calorieGoal, 1981);
  assert.equal(resultados.moderate.calorieGoal, 1761);
  assert.equal(resultados.aggressive.calorieGoal, 1651);

  // El déficit crece con la intensidad
  assert.ok(resultados.mild.calorieGoal > resultados.moderate.calorieGoal);
  assert.ok(resultados.moderate.calorieGoal > resultados.aggressive.calorieGoal);

  // Cada nivel trae su aviso y su ritmo esperado
  assert.match(resultados.aggressive.intensityWarning, /riesgo|músculo/i);
  assert.ok(resultados.moderate.rateKgPerWeek > resultados.mild.rateKgPerWeek);

  // En déficit agresivo sube la proteína para proteger el músculo
  assert.ok(
    resultados.aggressive.macroSplit.protein >
      resultados.mild.macroSplit.protein,
    'el déficit agresivo debe subir la proteína'
  );
});

test('Intensidad: el suelo de seguridad evita déficits peligrosos', async () => {
  // Persona menuda: un déficit del 25 % la dejaría por debajo del mínimo
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Menuda',
      email: `suelo-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 55,
      gender: 'female',
      height: 150,
      weight: 45,
      activityLevel: 'sedentary',
      goal: 'lose_weight',
      goalIntensity: 'aggressive',
    },
  });

  assert.equal(res.status, 201);
  const g = res.body.goals;

  // Confirma que el 75 % habría quedado por debajo del suelo
  assert.equal(g.floorApplied, true, 'debe activarse el suelo de seguridad');
  assert.ok(g.calorieGoal >= g.bmr, 'nunca por debajo de la TMB');
  assert.ok(g.calorieGoal >= 1200, 'nunca por debajo del mínimo clínico');
  assert.ok(g.floorReason, 'debe explicar por qué se aplicó');
  assert.ok(g.floorKcal >= 1200);
});

test('Desglose energético: TMB + TEF + NEAT + EAT = TDEE', async () => {
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Desglose',
      email: `desglose-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 35,
      gender: 'male',
      height: 180,
      weight: 85,
      activityLevel: 'active',
      goal: 'maintain',
    },
  });

  assert.equal(res.status, 201);
  const d = res.body.goals.breakdown;

  assert.ok(d, 'debe incluir el desglose');
  // El reparto debe cuadrar con el total (tolerancia de redondeo)
  const suma = d.bmr + d.tef + d.neat + d.eat;
  assert.ok(
    Math.abs(suma - res.body.goals.tdee) <= 3,
    `el desglose (${suma}) debe cuadrar con el TDEE (${res.body.goals.tdee})`
  );

  assert.ok(d.neat > 0, 'debe estimar NEAT');
  assert.ok(d.eat > 0, 'un usuario activo debe tener componente de ejercicio');
  assert.match(d.note, /NEAT/);
  assert.match(d.note, /variable/i);
});

test('Desglose: un sedentario no tiene componente de ejercicio', async () => {
  const res = await request('POST', '/auth/register', {
    body: {
      name: 'Sedentario',
      email: `sed-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 40,
      gender: 'male',
      height: 175,
      weight: 90,
      activityLevel: 'sedentary',
      goal: 'maintain',
    },
  });

  const d = res.body.goals.breakdown;
  assert.equal(d.eat, 0, 'sin ejercicio declarado no hay EAT');
  assert.ok(d.neat > 0, 'pero sí NEAT');
});

test('Intensidad: al cambiar de objetivo se ajusta la intensidad por defecto', async () => {
  const reg = await request('POST', '/auth/register', {
    body: {
      name: 'Cambio',
      email: `cambio-${Date.now()}@test.com`,
      password: 'secreto123',
      age: 30,
      gender: 'female',
      height: 165,
      weight: 70,
      activityLevel: 'moderate',
      goal: 'lose_weight',
      goalIntensity: 'aggressive',
    },
  });
  const t = reg.body.token;
  assert.equal(reg.body.goals.intensity, 'aggressive');

  // `maintain` no admite intensidades: debe caer a la de por defecto
  const res = await request('PUT', '/profile', {
    token: t,
    body: { goal: 'maintain' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.goals.intensity, 'moderate');
  assert.equal(res.body.goals.calorieGoal, res.body.goals.tdee);
});

// ---------------------------------------------------------------------------
// Contraseña: restablecimiento y cambio
// ---------------------------------------------------------------------------

/** Crea un usuario nuevo y devuelve sus credenciales. */
const crearUsuarioPassword = async (sufijo) => {
  const email = `pw-${sufijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const password = 'claveOriginal123';

  const res = await request('POST', '/auth/register', {
    body: { name: 'Password Test', email, password },
  });
  assert.equal(res.status, 201, 'debería crear el usuario');

  return { email, password, token: res.body.token, id: res.body.user.id };
};

test('Contraseña: forgot-password responde igual exista o no el email', async () => {
  const existente = await request('POST', '/auth/forgot-password', {
    body: { email: 'ana@test.com' },
  });
  const inexistente = await request('POST', '/auth/forgot-password', {
    body: { email: 'no-existe-jamas@test.com' },
  });

  assert.equal(existente.status, 200);
  assert.equal(inexistente.status, 200);

  // Misma respuesta: no se puede usar el formulario para averiguar qué emails
  // tienen cuenta.
  assert.equal(existente.body.message, inexistente.body.message);
});

test('Contraseña: forgot-password rechaza un email con formato inválido', async () => {
  const res = await request('POST', '/auth/forgot-password', {
    body: { email: 'esto-no-es-un-email' },
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /formato/i);
});

test('Contraseña: un token inventado no permite restablecer', async () => {
  const res = await request('POST', '/auth/reset-password', {
    body: { token: 'a'.repeat(64), password: 'nuevaClave123' },
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_TOKEN');
});

test('Contraseña: sin token no se puede restablecer', async () => {
  const res = await request('POST', '/auth/reset-password', {
    body: { password: 'nuevaClave123' },
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /token/i);
});

test('Contraseña: rechaza una contraseña nueva demasiado corta', async () => {
  const user = await crearUsuarioPassword('corta');

  const { createResetToken } = await import('../src/models/PasswordReset.js');
  const token = await createResetToken(user.id);

  const res = await request('POST', '/auth/reset-password', {
    body: { token, password: '123' },
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /6 caracteres/i);
});

test('Contraseña: el flujo completo por enlace funciona', async () => {
  const user = await crearUsuarioPassword('flujo');

  const { createResetToken } = await import('../src/models/PasswordReset.js');
  const token = await createResetToken(user.id);

  // 1. Restablecer con el token
  const res = await request('POST', '/auth/reset-password', {
    body: { token, password: 'claveNueva456' },
  });
  assert.equal(res.status, 200);

  // 2. La contraseña vieja deja de valer
  const conVieja = await request('POST', '/auth/login', {
    body: { email: user.email, password: user.password },
  });
  assert.equal(conVieja.status, 401, 'la contraseña anterior ya no debe servir');

  // 3. Y la nueva sí
  const conNueva = await request('POST', '/auth/login', {
    body: { email: user.email, password: 'claveNueva456' },
  });
  assert.equal(conNueva.status, 200);
  assert.ok(conNueva.body.token);
});

test('Contraseña: el token es de un solo uso', async () => {
  const user = await crearUsuarioPassword('unico');

  const { createResetToken } = await import('../src/models/PasswordReset.js');
  const token = await createResetToken(user.id);

  const primera = await request('POST', '/auth/reset-password', {
    body: { token, password: 'clavePrimera123' },
  });
  assert.equal(primera.status, 200);

  // Reutilizarlo no debe funcionar
  const segunda = await request('POST', '/auth/reset-password', {
    body: { token, password: 'claveSegunda123' },
  });
  assert.equal(segunda.status, 400);
  assert.equal(segunda.body.code, 'INVALID_TOKEN');

  // La contraseña sigue siendo la de la primera vez
  const login = await request('POST', '/auth/login', {
    body: { email: user.email, password: 'clavePrimera123' },
  });
  assert.equal(login.status, 200);
});

test('Contraseña: pedir un enlace nuevo invalida el anterior', async () => {
  const user = await crearUsuarioPassword('reemplazo');

  const { createResetToken } = await import('../src/models/PasswordReset.js');
  const primero = await createResetToken(user.id);
  const segundo = await createResetToken(user.id);

  const conPrimero = await request('POST', '/auth/reset-password', {
    body: { token: primero, password: 'claveConPrimero1' },
  });
  assert.equal(conPrimero.status, 400, 'el enlace viejo debe quedar anulado');

  const conSegundo = await request('POST', '/auth/reset-password', {
    body: { token: segundo, password: 'claveConSegundo1' },
  });
  assert.equal(conSegundo.status, 200);
});

test('Contraseña: cambiarla con la sesión iniciada exige la actual', async () => {
  const user = await crearUsuarioPassword('cambio');

  // Sin la contraseña actual
  const sinActual = await request('PUT', '/auth/password', {
    token: user.token,
    body: { newPassword: 'otraClave123' },
  });
  assert.equal(sinActual.status, 400);

  // Con una incorrecta
  const incorrecta = await request('PUT', '/auth/password', {
    token: user.token,
    body: { currentPassword: 'noEsLaCorrecta', newPassword: 'otraClave123' },
  });
  assert.equal(incorrecta.status, 401);

  // Con la correcta
  const correcta = await request('PUT', '/auth/password', {
    token: user.token,
    body: { currentPassword: user.password, newPassword: 'otraClave123' },
  });
  assert.equal(correcta.status, 200);

  // Y la nueva funciona
  const login = await request('POST', '/auth/login', {
    body: { email: user.email, password: 'otraClave123' },
  });
  assert.equal(login.status, 200);
});

test('Contraseña: no se puede poner la misma que ya tenías', async () => {
  const user = await crearUsuarioPassword('misma');

  const res = await request('PUT', '/auth/password', {
    token: user.token,
    body: { currentPassword: user.password, newPassword: user.password },
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /distinta/i);
});

test('Contraseña: cambiar la contraseña requiere sesión', async () => {
  const res = await request('PUT', '/auth/password', {
    body: { currentPassword: 'x', newPassword: 'y'.repeat(10) },
  });

  assert.equal(res.status, 401);
});

test('404: ruta inexistente', async () => {
  const res = await request('GET', '/no-existe');
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------
test.after(() => {
  server.close();
  deepseekMock.close();
  fs.rmSync(TMP_UPLOADS, { recursive: true, force: true });
});
