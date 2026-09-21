# Referencia de la API — NutriTrack

- **Base URL:** `/api`
- **Formato:** JSON (excepto la subida de imágenes, que usa `multipart/form-data`)
- **Autenticación:** `Authorization: Bearer <jwt>` salvo en los endpoints marcados como públicos.

## Códigos de estado

| Código | Significado |
|---|---|
| 200 / 201 | OK / recurso creado |
| 400 | Datos inválidos |
| 401 | Token ausente, inválido o expirado |
| 403 | Origen no permitido por CORS |
| 404 | Recurso inexistente o de otro usuario |
| 409 | Conflicto (email ya registrado) |
| 413 | Archivo demasiado grande |
| 415 | Tipo de archivo no soportado |
| 502 | Error del proveedor de IA |
| 503 | Falta la API key de DeepSeek |

Todos los errores tienen la forma:

```json
{ "error": "mensaje legible", "code": "CODIGO_OPCIONAL" }
```

---

## Salud

### `GET /health` · público

```json
{ "status": "ok", "timestamp": "2026-01-15T12:00:00.000Z" }
```

---

## Autenticación

### `POST /auth/register` · público

```json
{
  "name": "Ana García",
  "email": "ana@ejemplo.com",
  "password": "secreto123",
  "age": 30,
  "gender": "female",
  "height": 165,
  "weight": 65,
  "activityLevel": "moderate",
  "goal": "maintain"
}
```

`gender`: `male` | `female`
`activityLevel`: `sedentary` | `light` | `moderate` | `active` | `very_active`
`goal`: `lose_weight` | `maintain` | `gain_muscle`
`goalIntensity`: `mild` | `moderate` | `aggressive` (opcional, por defecto `moderate`)

**201**

```json
{
  "message": "Cuenta creada correctamente",
  "user": { "id": "...", "email": "ana@ejemplo.com", "goalIntensity": "moderate", "...": "..." },
  "token": "eyJhbGciOi...",
  "goals": {
    "bmr": 1420,
    "tdee": 2201,
    "calorieGoal": 1761,
    "goal": "lose_weight",
    "intensity": "moderate",
    "intensityLabel": "Moderado",
    "intensityWarning": "Ritmo sostenible: alrededor de 0,5 kg por semana...",
    "rateKgPerWeek": 0.5,
    "ajusteKcal": -440,
    "floorApplied": false,
    "floorReason": null,
    "proteinGoal": 154,
    "carbGoal": 154,
    "fatGoal": 59,
    "macroSplit": { "protein": 35, "carbs": 35, "fats": 30 },
    "breakdown": {
      "bmr": 1420, "tef": 220, "neat": 337, "eat": 224,
      "bmrPercent": 65, "tefPercent": 10, "neatPercent": 15, "eatPercent": 10,
      "note": "Estimación orientativa. El NEAT es el componente más variable..."
    }
  }
}
```

### Intensidad del objetivo

El recorte se aplica como porcentaje del TDEE, acotado por un **suelo de
seguridad**: el objetivo nunca queda por debajo de la TMB ni de 1200 kcal
(mujer) / 1500 (hombre). Cuando el suelo entra en juego, `floorApplied` es
`true` y `floorReason` explica por qué.

| Objetivo | Intensidad | Ajuste | Ritmo orientativo |
|---|---|---|---|
| `lose_weight` | `mild` | −10 % | ~0,25 kg/semana |
| `lose_weight` | `moderate` | −20 % (≈ −500 kcal) | ~0,5 kg/semana |
| `lose_weight` | `aggressive` | −25 % | ~0,6 kg/semana |
| `maintain` | — | 0 % | estable |
| `gain_muscle` | `mild` | +5 % | ~0,15 kg/semana |
| `gain_muscle` | `moderate` | +10 % | ~0,25 kg/semana |
| `gain_muscle` | `aggressive` | +15 % | ~0,4 kg/semana |

En `lose_weight` la proteína sube con la intensidad (32 % → 35 % → 40 % de las
kcal) porque es lo que mejor protege la masa muscular en déficits grandes.

### `breakdown`: composición del gasto

`TDEE = TMB + TEF + NEAT + EAT`. **Es solo explicativo**: el total se obtiene con
`TMB × factor de actividad`, y ese factor ya incluye implícitamente NEAT, TEF y
ejercicio. Aquí se reparte ese mismo total, no se recalcula.

- **TMB** — metabolismo basal, en reposo absoluto
- **TEF** — termogénesis de los alimentos, ≈ 10 %
- **NEAT** — actividad no asociada al ejercicio (caminar, estar de pie). Es el
  componente **más variable** entre personas y baja de forma inconsciente al
  comer menos, lo que explica muchas mesetas de adelgazamiento
- **EAT** — ejercicio


### `POST /auth/login` · público

```json
{ "email": "ana@ejemplo.com", "password": "secreto123" }
```

**200** — misma forma que el registro. Devuelve **401** con el mismo mensaje
tanto si el email no existe como si la contraseña es incorrecta (no filtra qué
cuentas existen).

---

## Perfil

### `GET /profile` · 🔒

```json
{ "user": { "...": "..." }, "goals": { "calorieGoal": 2124, "...": "..." } }
```

`goals` es `null` mientras falten edad, altura o peso.

### `PUT /profile` · 🔒

Acepta cualquier subconjunto de: `name`, `age`, `gender`, `height`, `weight`,
`activityLevel`, `goal`. Los objetivos se recalculan y se devuelven.

---

## Comidas

### `POST /food/analyze` · 🔒 · `multipart/form-data`

**Paso 1 del flujo con IA.** Analiza la imagen pero **no crea ningún registro**,
para que el usuario revise y corrija antes de guardar.

| Campo | Tipo | Descripción |
|---|---|---|
| `image` | file | JPEG, PNG o WebP. Máx. `IMAGE_MAX_SIZE_MB` (8 MB por defecto) |

**200**

```json
{
  "imageUrl": "/uploads/8f3c...jpg",
  "imageSizeBytes": 184320,
  "analysis": {
    "foods": [
      { "name": "Pechuga de pollo", "portion_grams": 150, "calories": 248, "protein": 46, "carbs": 0, "fats": 5 }
    ],
    "total_calories": 507,
    "total_protein": 52.4,
    "total_carbs": 55,
    "total_fats": 5.7,
    "fiber": 3.1,
    "sugars": 2,
    "sodium": 420,
    "confidence": 82,
    "notes": "Porciones estimadas según el tamaño del plato.",
    "needs_review": false
  }
}
```

`needs_review` es `true` cuando no se detectó ningún alimento o la confianza es
inferior al 50 % — el frontend lo usa para pedir una revisión explícita.

**Errores específicos**

| `code` | Cuándo |
|---|---|
| `MISSING_API_KEY` | El servidor no tiene `DEEPSEEK_API_KEY` (503) |
| `VISION_UNSUPPORTED` | El modelo configurado no acepta imágenes (502) |
| `TIMEOUT` | El modelo tardó más de `DEEPSEEK_TIMEOUT_MS` (502) |
| `RATE_LIMIT` | Límite de peticiones del proveedor (502) |
| `NETWORK` | No se pudo contactar con el proveedor (502) |
| `API_ERROR` | Otro error del proveedor (502) |

> Si el análisis falla, la imagen subida se elimina automáticamente del disco.

### `POST /food` · 🔒 · `application/json`

**Paso 2.** Guarda la comida con los valores **confirmados por el usuario**.

```json
{
  "mealType": "lunch",
  "mealTime": "13:30",
  "foods": [ { "name": "Pechuga de pollo", "portion_grams": 150, "calories": 248, "protein": 46, "carbs": 0, "fats": 5 } ],
  "totals": { "calories": 480, "protein": 50, "carbs": 52, "fats": 6, "fiber": 3, "sugars": 2, "sodium": 400 },
  "aiTotals": { "calories": 507, "protein": 52.4, "carbs": 55, "fats": 5.7, "confidence": 82 },
  "imageUrl": "/uploads/8f3c...jpg",
  "confirmed": true
}
```

`aiTotals` es opcional y se guarda como traza de lo que estimó la IA, para poder
compararlo con la corrección del usuario.

### `POST /food/manual` · 🔒

Alta sin foto, para cuando la IA no está disponible. Mismos campos que
`POST /food` salvo `aiTotals` e `imageUrl`. Queda confirmada automáticamente.

### `GET /food` · 🔒

| Query | Descripción |
|---|---|
| `date` | `YYYY-MM-DD` — filtra por día |
| `mealType` | `breakfast` \| `lunch` \| `snack` \| `dinner` |
| `limit`, `offset` | Paginación |

```json
{ "entries": [ { "...": "..." } ], "count": 3 }
```

### `GET /food/all` · 🔒

Todos los registros del usuario, sin paginar.

### `GET /food/stats/daily` · 🔒

| Query | Descripción |
|---|---|
| `date` | `YYYY-MM-DD` (por defecto, hoy) |

```json
{
  "date": "2026-01-15",
  "stats": { "entry_count": 2, "total_calories": 540, "total_protein": 53, "total_carbs": 57, "total_fats": 9, "total_fiber": 3, "total_sugars": 2, "total_sodium": 400 },
  "goals": { "calorieGoal": 1871, "...": "..." }
}
```

### `GET /food/stats/range` · 🔒

Serie temporal para los gráficos del historial. **Rellena con ceros** los días
sin registros, de modo que el gráfico es continuo.

| Query | Descripción |
|---|---|
| `days` | 1–90 (por defecto 7) |
| `endDate` | `YYYY-MM-DD` (por defecto, hoy) |

```json
{
  "range": { "startDate": "2026-01-09", "endDate": "2026-01-15", "days": 7 },
  "series": [ { "date": "2026-01-09", "entryCount": 0, "calories": 0, "protein": 0, "carbs": 0, "fats": 0 } ],
  "averages": { "calories": 1980, "protein": 110, "carbs": 200, "fats": 60 },
  "daysLogged": 5,
  "daysOnTarget": 4,
  "goals": { "calorieGoal": 1871, "...": "..." }
}
```

`daysOnTarget` cuenta los días registrados con calorías ≤ 105 % del objetivo.

### `PUT /food/:id` · 🔒

Acepta: `calories`, `protein`, `carbs`, `fats`, `fiber`, `sugars`, `sodium`,
`foods`, `mealType`, `mealTime`, `confirmed`. Devuelve **404** si el registro no
existe **o pertenece a otro usuario**.

### `DELETE /food/:id` · 🔒

Elimina el registro y su imagen asociada del disco.

### `GET /food/suggestions` · 🔒

Recomendaciones de comidas, en **tres capas** de más barata a más cara:

1. El consejo y los déficits se calculan **en local** (una resta exacta)
2. Los platos salen de una **base de alimentos local**: instantáneo, **0 tokens**
3. Solo con `?ai=true` se consulta al modelo, y el resultado se **cachea**

| Query | Descripción |
|---|---|
| `date` | `YYYY-MM-DD` (por defecto, hoy) |
| `mealType` | `breakfast` \| `lunch` \| `snack` \| `dinner`. Si se omite, se deduce por la hora |
| `ai` | `true` para pedir ideas nuevas al modelo en lugar de usar la base local |

```json
{
  "date": "2026-01-15",
  "goals": { "calorieGoal": 1761, "...": "..." },
  "consumed": { "calories": 640, "protein": 42, "carbs": 58, "fats": 20 },
  "kcalRestantes": 1121,
  "advice": "Te quedan 1121 kcal y vas corto de proteínas (te faltan 98 g).",
  "gaps": [ { "key": "protein", "label": "proteínas", "remaining": 98, "unit": "g" } ],
  "summary": "Opciones para la comida que cubren proteínas.",
  "suggestions": [
    {
      "name": "Pechuga de pollo con arroz y verduras",
      "why": "Aporta 48 g de proteínas y aprovecha bien lo que te queda.",
      "meal_type": "lunch",
      "calories": 620, "protein": 48, "carbs": 65, "fats": 14,
      "ingredients": ["Pechuga de pollo", "Arroz", "Verduras"]
    }
  ],
  "source": "local",
  "cached": false
}
```

**`source`** indica de dónde salen los platos:

| Valor | Significado |
|---|---|
| `local` | Base de alimentos del backend. **0 tokens**, milisegundos |
| `ai` | Generadas por el modelo. Requiere `?ai=true` |

Cuando `source` es `ai` y no venía de caché, se incluye además
`localSuggestions` con la alternativa gratuita.

**Degradación elegante:** si se pide `?ai=true` y el modelo falla, la respuesta
sigue siendo **200** con las sugerencias locales y un campo `aiErrorCode`
(p. ej. `MISSING_API_KEY`). El usuario nunca se queda sin nada.

**Motivo del diseño:** antes cada apertura de la pantalla gastaba ~1.300 tokens.
Ahora el uso normal gasta **cero**, y los tokens solo se consumen cuando el
usuario pulsa expresamente «pedir ideas nuevas».

---

## Flujo típico del cliente

```
1. POST /auth/register            → token
2. GET  /profile                  → objetivos diarios
3. POST /food/analyze   (foto)    → análisis + imageUrl      ← el usuario revisa y edita
4. POST /food           (JSON)    → registro guardado
5. GET  /food/stats/daily         → progreso del día
6. GET  /food/suggestions         → qué comer para cuadrar el día
7. GET  /food/stats/range?days=7  → gráficos del historial
```
