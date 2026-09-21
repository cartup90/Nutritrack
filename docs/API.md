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

**201**

```json
{
  "message": "Cuenta creada correctamente",
  "user": { "id": "...", "email": "ana@ejemplo.com", "name": "Ana García", "...": "..." },
  "token": "eyJhbGciOi...",
  "goals": { "bmr": 1370, "tdee": 2124, "calorieGoal": 2124, "proteinGoal": 159, "carbGoal": 212, "fatGoal": 71 }
}
```

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

Recomendaciones generadas por el modelo de texto a partir del progreso del día.

```json
{
  "date": "2026-01-15",
  "goals": { "calorieGoal": 1871, "...": "..." },
  "consumed": { "calories": 540, "protein": 53, "carbs": 57, "fats": 9 },
  "summary": "Te falta proteína para llegar a tu objetivo de hoy.",
  "gaps": ["déficit de proteína"],
  "suggestions": [
    {
      "name": "Yogur griego con nueces",
      "why": "Aporta proteína sin exceder las calorías restantes.",
      "meal_type": "snack",
      "calories": 220, "protein": 18, "carbs": 12, "fats": 11,
      "ingredients": ["Yogur griego natural", "Nueces"]
    }
  ]
}
```

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
