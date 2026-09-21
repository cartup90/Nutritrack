import axios from 'axios';

/**
 * Servicio de integración con DeepSeek.
 *
 * NOTA IMPORTANTE SOBRE VISIÓN:
 * El modelo a usar es configurable mediante DEEPSEEK_VISION_MODEL. El endpoint es
 * compatible con el formato OpenAI Chat Completions (content array con image_url),
 * de modo que si DeepSeek expone un modelo multimodal (o se apunta DEEPSEEK_API_URL
 * a un gateway compatible) el flujo funciona sin cambios de código.
 */

const API_URL =
  process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL || 'deepseek-chat';
const TEXT_MODEL = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-chat';
const TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000);

/**
 * Presupuesto de tokens de salida.
 *
 * Los modelos de razonamiento (p. ej. deepseek-flash) emiten `reasoning_content`
 * además de `content`, y ESOS TOKENS CUENTAN dentro de `max_tokens`. Si el
 * presupuesto se agota mientras razona, la respuesta llega con `content` vacío
 * y `finish_reason: "length"`.
 *
 * Medido con deepseek-flash analizando una foto: consume ~2.000-4.000 tokens
 * solo en razonar, así que 4000 se queda corto. 8000 da margen holgado.
 */
const MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS || 8000);

/**
 * Esfuerzo de razonamiento opcional ("minimal" | "low" | "medium" | "high").
 *
 * Medido en pruebas: "minimal" reduce el consumo ~38 % y la latencia ~34 %,
 * a cambio de respuestas algo menos detalladas. Por defecto NO se envía y se
 * usa el comportamiento del modelo, que dio resultados más completos.
 */
const REASONING_EFFORT = process.env.DEEPSEEK_REASONING_EFFORT?.trim();

const reasoningParams = () =>
  REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {};

/**
 * Recomendaciones de texto: razonamiento DESACTIVADO.
 *
 * Elegir platos para un déficit que ya viene calculado desde el backend es una
 * tarea simple, y aquí el razonamiento del modelo se desbocaba de forma
 * impredecible. Medido con deepseek-flash sobre el mismo prompt, 3 intentos:
 *
 *   reasoning_effort: "minimal"  -> 1/3 respuestas válidas
 *                                   24,1 s de media, 6.411 tokens razonando
 *                                   (2 intentos agotaron los 8000 tokens y
 *                                    devolvieron finish_reason "length")
 *   thinking: disabled           -> 3/3 respuestas válidas
 *                                    2,8 s de media, 0 tokens razonando
 *
 * Es decir: desactivarlo es más barato, 8 veces más rápido Y más fiable.
 *
 * OJO: esto vale para TEXTO. El análisis de imágenes SÍ necesita razonar
 * (sin él devuelve la lista de alimentos vacía), así que allí no se toca.
 */
const SUGGESTIONS_THINKING =
  process.env.DEEPSEEK_SUGGESTIONS_THINKING?.trim() || 'disabled';

const SUGGESTIONS_MAX_TOKENS = Number(
  process.env.DEEPSEEK_SUGGESTIONS_MAX_TOKENS || 4000
);

const suggestionsReasoningParams = () => {
  if (SUGGESTIONS_THINKING === 'disabled') {
    return { thinking: { type: 'disabled' } };
  }
  const effort = process.env.DEEPSEEK_SUGGESTIONS_REASONING_EFFORT?.trim();
  return effort ? { reasoning_effort: effort } : {};
};

const httpClient = axios.create({
  timeout: TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

/** Schema fijo que exigimos al modelo para poder parsear la respuesta. */
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion_grams: { type: 'number' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fats: { type: 'number' },
        },
        required: ['name', 'portion_grams', 'calories', 'protein', 'carbs', 'fats'],
      },
    },
    total_calories: { type: 'number' },
    total_protein: { type: 'number' },
    total_carbs: { type: 'number' },
    total_fats: { type: 'number' },
    fiber: { type: 'number' },
    sugars: { type: 'number' },
    sodium: { type: 'number' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: [
    'foods',
    'total_calories',
    'total_protein',
    'total_carbs',
    'total_fats',
    'confidence',
  ],
};

const ANALYSIS_PROMPT = `Eres un nutricionista experto analizando la foto de un plato de comida.

Analiza la imagen y devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto adicional) con esta estructura exacta:

{
  "foods": [
    {
      "name": "nombre del alimento en español",
      "portion_grams": 150,
      "calories": 200,
      "protein": 12,
      "carbs": 20,
      "fats": 8
    }
  ],
  "total_calories": 0,
  "total_protein": 0,
  "total_carbs": 0,
  "total_fats": 0,
  "fiber": 0,
  "sugars": 0,
  "sodium": 0,
  "confidence": 0,
  "notes": "aclaraciones o supuestos"
}

Reglas:
- Identifica cada alimento distinguible del plato por separado.
- Estima la porción en gramos de forma realista según el tamaño aparente.
- Los macros son en gramos; las calorías y el sodio (mg) en números.
- "confidence" es un entero de 0 a 100 que refleja tu certeza global.
- Si la imagen no muestra comida o es ilegible, devuelve "foods": [] y explica el motivo en "notes".
- Los totales deben ser la suma coherente de los alimentos listados.
- Responde en español.`;

/** Extrae y parsea el JSON de la respuesta del modelo, tolerando markdown. */
const parseJsonResponse = (content) => {
  if (!content || typeof content !== 'string' || !content.trim()) {
    // Caso típico: modelo de razonamiento que agotó max_tokens pensando
    throw new Error('EMPTY_CONTENT');
  }

  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : content.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) {
      throw new Error('No se pudo extraer JSON de la respuesta del modelo');
    }
    return JSON.parse(candidate);
  }
};

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
};

/** Normaliza la respuesta del modelo al formato interno estable. */
export const normalizeAnalysis = (raw) => {
  const foods = Array.isArray(raw?.foods)
    ? raw.foods
        .filter((f) => f && typeof f === 'object' && f.name)
        .map((f) => ({
          name: String(f.name).trim(),
          portion_grams: num(f.portion_grams),
          calories: num(f.calories),
          protein: num(f.protein),
          carbs: num(f.carbs),
          fats: num(f.fats),
        }))
    : [];

  // Si el modelo omitió totales, los calculamos a partir de los alimentos.
  const sum = (key) => foods.reduce((acc, f) => acc + (f[key] || 0), 0);

  const confidence = Math.max(0, Math.min(100, num(raw?.confidence)));

  return {
    foods,
    total_calories: num(raw?.total_calories, sum('calories')) || sum('calories'),
    total_protein: num(raw?.total_protein, sum('protein')) || sum('protein'),
    total_carbs: num(raw?.total_carbs, sum('carbs')) || sum('carbs'),
    total_fats: num(raw?.total_fats, sum('fats')) || sum('fats'),
    fiber: num(raw?.fiber),
    sugars: num(raw?.sugars),
    sodium: num(raw?.sodium),
    confidence,
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    needs_review: foods.length === 0 || confidence < 50,
  };
};

/**
 * Analiza la imagen de un plato.
 * @param {string} imageBase64 - imagen optimizada en base64 (sin prefijo data:)
 * @returns {Promise<{success: boolean, data?: object, error?: string, code?: string, details?: any}>}
 */
export const analyzeFoodImage = async (imageBase64) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      success: false,
      code: 'MISSING_API_KEY',
      error:
        'El servidor no tiene configurada la API key de DeepSeek (DEEPSEEK_API_KEY).',
    };
  }

  try {
    const { data } = await httpClient.post(API_URL, {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            { type: 'text', text: ANALYSIS_PROMPT },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: MAX_TOKENS,
      ...reasoningParams(),
    });

    const choice = data?.choices?.[0];
    const content = choice?.message?.content;

    let parsed;
    try {
      parsed = parseJsonResponse(content);
    } catch (parseError) {
      // Distinguimos "no hay respuesta" de "la respuesta no es JSON"
      if (parseError.message === 'EMPTY_CONTENT') {
        const soloRazonamiento = Boolean(choice?.message?.reasoning_content);
        return {
          success: false,
          code: soloRazonamiento ? 'TRUNCATED_REASONING' : 'EMPTY_RESPONSE',
          error: soloRazonamiento
            ? 'El modelo agotó su presupuesto de razonamiento antes de responder. Sube DEEPSEEK_MAX_TOKENS o reintenta.'
            : 'El modelo no devolvió ninguna respuesta. Intenta de nuevo.',
          details: {
            finish_reason: choice?.finish_reason,
            usage: data?.usage,
          },
        };
      }
      throw parseError;
    }

    return { success: true, data: normalizeAnalysis(parsed) };
  } catch (error) {
    console.error('[deepSeek] Error analizando imagen:', error.message);

    return mapApiError(error);
  }
};

const mapApiError = (error) => {
  // Errores de parseo, no de red ni de HTTP
  if (
    error.message === 'EMPTY_CONTENT' ||
    error.message.startsWith('No se pudo extraer JSON')
  ) {
    return {
      success: false,
      code: 'EMPTY_RESPONSE',
      error:
        'El modelo no devolvió una respuesta utilizable. Vuelve a intentarlo.',
    };
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      success: false,
      code: 'TIMEOUT',
      error:
        'El análisis tardó demasiado. Intenta de nuevo o carga los datos manualmente.',
    };
  }

  const status = error.response?.status;
  const apiMessage =
    error.response?.data?.error?.message || error.response?.data?.message;

  if (status === 401 || status === 403) {
    return {
      success: false,
      code: 'INVALID_API_KEY',
      error: 'La API key de DeepSeek no es válida o no tiene permisos.',
    };
  }

  if (status === 429) {
    return {
      success: false,
      code: 'RATE_LIMIT',
      error:
        'Se alcanzó el límite de solicitudes a la IA. Espera un momento y reintenta.',
    };
  }

  if (status === 400 && /image|vision|multimodal/i.test(apiMessage || '')) {
    return {
      success: false,
      code: 'VISION_UNSUPPORTED',
      error:
        'El modelo configurado no admite imágenes. Configura un modelo multimodal en DEEPSEEK_VISION_MODEL.',
      details: apiMessage,
    };
  }

  if (!error.response) {
    return {
      success: false,
      code: 'NETWORK',
      error: 'No se pudo contactar al servicio de IA. Revisa tu conexión.',
    };
  }

  return {
    success: false,
    code: 'API_ERROR',
    error: 'El servicio de IA devolvió un error al analizar la imagen.',
    details: apiMessage || `HTTP ${status}`,
  };
};

/**
 * Genera sugerencias de comidas saludables basadas en el progreso del usuario.
 */
export const getFoodSuggestions = async (context) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      success: false,
      code: 'MISSING_API_KEY',
      error: 'El servidor no tiene configurada la API key de DeepSeek.',
    };
  }

  const {
    consumed = {},
    goals = {},
    goalType = 'maintain',
    recentMeals = [],
    gaps,
  } = context || {};

  // Los déficits vienen ya calculados desde el backend. Al modelo solo le
  // queda elegir platos, así que no necesita razonar sobre aritmética: de ahí
  // el esfuerzo mínimo, que recorta el consumo ~76 %.
  const deficitTexto =
    gaps && gaps.length
      ? gaps
          .map((g) => `${g.label}: faltan ${g.remaining} ${g.unit}`)
          .join('; ')
      : 'ninguno destacable';

  const restante = Math.max(
    (goals.calorieGoal || 2000) - (consumed.calories || 0),
    0
  );

  const prompt = `Eres un nutricionista. Propón comidas concretas en español.

Datos ya calculados (NO los recalcules):
- Objetivo del usuario: ${goalType}
- Le quedan hoy: ${restante} kcal
- Déficits a cubrir: ${deficitTexto}
- Ya ha comido hoy: ${recentMeals.length ? recentMeals.join(', ') : 'nada'}

Devuelve SOLO este JSON:
{
  "summary": "una frase corta sobre qué necesita ahora",
  "suggestions": [
    {
      "name": "nombre del plato",
      "why": "por qué encaja (una frase)",
      "meal_type": "snack",
      "calories": 250,
      "protein": 20,
      "carbs": 25,
      "fats": 8,
      "ingredients": ["ingrediente 1", "ingrediente 2"]
    }
  ]
}

Reglas:
- 3 o 4 sugerencias, cada una cubriendo los déficits indicados.
- Que la suma encaje en las kcal restantes.
- Alimentos accesibles y de preparación simple.
- No repitas lo que ya ha comido hoy.
- Sé conciso, sin markdown.`;

  try {
    const { data } = await httpClient.post(API_URL, {
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      // Este endpoint no necesita 8000 tokens: la respuesta es corta y el
      // razonamiento va al mínimo. Deja margen de sobra para ambos.
      max_tokens: SUGGESTIONS_MAX_TOKENS,
      ...suggestionsReasoningParams(),
    });

    const choice = data?.choices?.[0];
    const content = choice?.message?.content;

    let parsed;
    try {
      parsed = parseJsonResponse(content);
    } catch (parseError) {
      if (parseError.message === 'EMPTY_CONTENT') {
        // Distinguimos "se quedó sin cupo razonando" de "no respondió".
        const truncado = choice?.finish_reason === 'length';
        return {
          success: false,
          code: truncado ? 'TRUNCATED_REASONING' : 'EMPTY_RESPONSE',
          error: truncado
            ? 'El modelo agotó su presupuesto razonando. Sube DEEPSEEK_SUGGESTIONS_MAX_TOKENS o reintenta.'
            : 'El modelo no devolvió ninguna respuesta. Vuelve a intentarlo.',
          details: { finish_reason: choice?.finish_reason, usage: data?.usage },
        };
      }
      throw parseError;
    }

    return {
      success: true,
      data: {
        summary: parsed.summary || '',
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map((s) => ({
              name: s.name || 'Sugerencia',
              why: s.why || '',
              meal_type: s.meal_type || 'snack',
              calories: num(s.calories),
              protein: num(s.protein),
              carbs: num(s.carbs),
              fats: num(s.fats),
              ingredients: Array.isArray(s.ingredients) ? s.ingredients : [],
            }))
          : [],
      },
      usage: data?.usage,
    };
  } catch (error) {
    console.error('[deepSeek] Error generando sugerencias:', error.message);
    return mapApiError(error);
  }
};
