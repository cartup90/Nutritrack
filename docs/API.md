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
{
  "user": { "...": "...", "trainingPattern": { "0": "rest", "2": "strength" } },
  "date": "2026-10-09",
  "dayType": "strength",
  "goals": { "calorieGoal": 2124, "...": "..." },
  "baseGoals": { "calorieGoal": 2638, "...": "..." }
}
```

`goals` es el objetivo **de hoy**, ya con el tipo de día aplicado (ver
[Tipos de día](#tipos-de-día)); `baseGoals` es el del día "normal" (actividad
declarada). `goals` es `null` mientras falten edad, altura o peso.

`user.trainingPattern` es el patrón semanal: un mapa con la clave `0`-`6`
(0 = lunes) y valor `rest` | `strength` | `aerobic`.

### `PUT /profile` · 🔒

Acepta cualquier subconjunto de: `name`, `age`, `gender`, `height`, `weight`,
`activityLevel`, `goal`, `goalIntensity`, `trainingPattern`. Los objetivos se
recalculan y se devuelven (los de hoy, con su tipo de día).

`trainingPattern` se sanea: las claves fuera de 0-6 y los tipos que no existen se
descartan en silencio.

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

**Cargar una comida de un día anterior:** agregá `date` (`YYYY-MM-DD`). Se acepta
hasta **7 días atrás**, nunca el futuro. Con `date`, el registro se guarda en el
instante del día lógico que corresponde a `mealTime` (12:00 si no viene), así
que aparece en ese día y no en el de hoy. Sin `date`, se guarda con la hora real.

```json
{ "mealType": "dinner", "mealTime": "21:30", "date": "2026-10-08", "totals": { "calories": 700 } }
```

**Idempotencia (registro sin conexión):** agregá `clientId` (6-64 caracteres de
`[A-Za-z0-9_-]`; en la app es un UUID). Si ya existe un registro con ese
`clientId` para el usuario, la respuesta es **200** con `duplicate: true` y el
registro existente, en vez de crear otro. Así un reintento después de un corte de
red no duplica la comida. Con `clientId` el límite de fecha atrás sube a **30
días** (la fecha la pone la app al capturar, no el usuario).

### `POST /food/manual` · 🔒

Alta sin foto, para cuando la IA no está disponible. Mismos campos que
`POST /food` salvo `aiTotals` e `imageUrl` (y acepta `date` y `clientId` igual).
Queda confirmada automáticamente.

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

### `GET /food/stats/week` · 🔒

Progreso de la **semana lunes-domingo** con estimación de peso perdido y el
margen semanal. Es la base de la pantalla «Progreso › Calorías».

| Query | Descripción |
|---|---|
| `date` | `YYYY-MM-DD`; sirve cualquier día de la semana que se quiera ver (por defecto, la semana en curso) |

**Cómo se calcula** (el detalle está en `backend/src/utils/weeklyProgress.js`):

1. Solo cuentan los días que ya pasaron.
2. Se toma una **referencia** con los días con carga: la **mediana** si hay 3 o
   más (un día suelto raro no la mueve), y el **objetivo diario** si hay menos.
3. Un día por debajo del **60 %** de esa referencia se descarta
   (`reason: "incompleto"`): se supone que ese día no se cargaron las comidas.
   **Salvo** que esté marcado como ayuno, en cuyo caso cuenta siempre.
4. Hay **dos cuentas distintas**, a propósito:
   - **Déficit real**: `Σ (gasto del día − consumido)`. El gasto de cada día
     depende de su tipo (un día de descanso gasta menos), así que se suman los
     gastos de los días contados. De acá sale el peso estimado.
   - **Margen**: `Σ (objetivo del día − consumido)`. Es el "saldo" contra lo que
     el usuario se propuso: si un día se pasó 150 kcal, al siguiente tiene 150
     menos de margen.
5. La conversión a kilos usa la equivalencia estándar: **7.700 kcal ≈ 1 kg** de
   grasa corporal.

```json
{
  "week": { "startDate": "2026-01-12", "endDate": "2026-01-18", "referenceDate": "2026-01-15", "today": "2026-01-15", "isCurrentWeek": true },
  "series": [ { "date": "2026-01-12", "entryCount": 3, "calories": 2100, "protein": 120, "carbs": 200, "fats": 70, "dayType": "normal", "goal": 2200, "burn": 2750 } ],
  "days": [
    { "date": "2026-01-12", "weekday": "lunes", "entryCount": 3, "calories": 2100, "protein": 120, "carbs": 200, "fats": 70, "dayType": "normal", "dayTypeLabel": "Automático", "goal": 2200, "burn": 2750, "isFasting": false, "isFuture": false, "counted": true, "reason": "ok" },
    { "date": "2026-01-15", "weekday": "jueves", "entryCount": 1, "calories": 900, "protein": 40, "carbs": 80, "fats": 20, "dayType": "rest", "dayTypeLabel": "Descanso", "goal": 1833, "burn": 2291, "isFasting": false, "isFuture": false, "counted": false, "reason": "incompleto" }
  ],
  "reference": { "source": "mediana", "dailyReference": 2150, "incompleteRatio": 0.6, "incompleteThreshold": 1290, "estimatedBurn": 2520, "averageGoal": 2017, "calorieGoal": 2200, "kcalPerKg": 7700, "minDaysForEstimate": 3 },
  "totals": { "daysInWeek": 7, "countedDays": 4, "fastingCountedDays": 0, "skippedDays": 1, "missingDays": 2, "futureDays": 0, "loggedDays": 5, "consumedKcal": 8750, "expectedKcal": 10080, "balanceKcal": 1330, "deficitKcal": 1330, "surplusKcal": 0, "weeklyBudgetKcal": 8068, "goalBalanceKcal": -682, "remainingDays": 0, "remainingBudgetKcal": 0, "remainingAllowancePerDay": null, "daysOnGoal": 2, "adherencePct": 50 },
  "averages": { "calories": 2188, "protein": 129, "carbs": 0, "fats": 0, "overDays": 4 },
  "estimate": { "kcalPerKg": 7700, "weightChangeKg": -0.17, "deficitKcal": 1330, "surplusKcal": 0, "reliable": true, "countedDays": 4, "canEstimate": true },
  "goals": { "calorieGoal": 2200, "...": "..." }
}
```

| Campo | Significado |
|---|---|
| `days[].reason` | `ok` (cuenta) · `ayuno` (cuenta) · `incompleto` (no cuenta) · `sin_registro` (no cuenta) · `futuro` (no cuenta) |
| `days[].counted` | Si el día suma a los totales de la semana |
| `days[].dayType` | Tipo de día aplicado: `normal` · `rest` · `strength` · `aerobic` |
| `days[].goal` / `days[].burn` | Objetivo y gasto **de ese día** (con su tipo aplicado) |
| `reference.source` | De dónde salió la referencia: `mediana` \| `objetivo` \| `sin_datos` |
| `reference.estimatedBurn` / `averageGoal` | Gasto y objetivo **medios** de los días contados |
| `totals.goalBalanceKcal` | Objetivo − consumido: **positivo = margen a favor**, negativo = se pasó |
| `totals.weeklyBudgetKcal` | Suma de los objetivos de los días contados |
| `totals.remainingDays` / `remainingBudgetKcal` | Días futuros de la semana y sus objetivos |
| `totals.remainingAllowancePerDay` | `(presupuesto restante + margen) / días restantes`: cuánto puede comer por día. `null` si la semana terminó |
| `totals.daysOnGoal` / `adherencePct` | Días contados dentro del objetivo (±5 %) y su porcentaje |
| `estimate.weightChangeKg` | **Negativo = peso perdido**, positivo = ganado |
| `estimate.reliable` | `false` con menos de `reference.minDaysForEstimate` días contados: la interfaz avisa de que es orientativa |
| `estimate.canEstimate` | `false` si el perfil está incompleto (no hay gasto estimado) o no hay días contados |

Los ayunos se marcan con `PUT /fasting/:date` (ver más abajo).

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

## Ayunos

Marcan un día como **ayuno voluntario**. Sirven para el progreso semanal: un día
con muy pocas calorías se descarta por defecto (se supone que faltó cargar las
comidas), salvo que esté marcado aquí.

La fecha es el **día lógico** del usuario (`YYYY-MM-DD`), el mismo que usan las
comidas y el agua.

### `PUT /fasting/:date` · 🔒

Marca el día. **Idempotente**: si ya estaba marcado responde **200** con
`created: false` en vez de duplicar.

```json
{ "message": "Día marcado como ayuno", "date": "2026-01-15", "created": true }
```

| Código | Cuándo |
|---|---|
| `201` | Se acaba de marcar |
| `200` | Ya estaba marcado |
| `400` | Fecha mal formada, inexistente, futura o de hace más de 2 años |

### `DELETE /fasting/:date` · 🔒

Quita la marca. También idempotente.

```json
{ "message": "Ayuno quitado", "date": "2026-01-15", "removed": true }
```

---

## Tipos de día

Un día de entrenamiento y uno de descanso **no gastan lo mismo**: en el descanso
el componente EAT (ejercicio) desaparece. Con los tipos de día el objetivo
calórico se recalcula por jornada, que es lo que permite ciclar calorías
(entrenar con más margen, descansar con menos).

| Tipo | Qué hace |
|---|---|
| `rest` | EAT a 0: el gasto y el objetivo bajan |
| `strength` | Mantiene el EAT declarado |
| `aerobic` | EAT +20 %: el cardio de la sesión gasta algo más |

Sin marca rige el **patrón semanal** del perfil (`users.training_pattern`), y sin
patrón el día es `normal` (la actividad declarada): quien no use la función no ve
ningún cambio en sus números.

### `PUT /day-types/:date` · 🔒

```json
{ "type": "rest" }
```

Marca la fecha. Es un *upsert*: cambiar el tipo del mismo día lo reemplaza.

| Código | Cuándo |
|---|---|
| `200` | Guardado |
| `400` | Tipo inválido (solo `rest`, `strength`, `aerobic`), fecha mal formada, a más de 7 días vista o de hace más de 2 años |

### `DELETE /day-types/:date` · 🔒

Quita la marca puntual: el día vuelve a regirse por el patrón semanal.

---

## Registro corporal

Peso y medidas (cintura, brazo, muslo) por día. El peso del perfil (el que usan
los objetivos) se actualiza solo cuando se registra el peso de la fecha **más
reciente**, para no desincronizarse al editar un día viejo.

### `GET /body` · 🔒

| Query | Descripción |
|---|---|
| `days` | 7–730 (por defecto 90) |
| `endDate` | `YYYY-MM-DD` (por defecto, hoy) |

```json
{
  "range": { "startDate": "2026-07-12", "endDate": "2026-10-09", "days": 90 },
  "entries": [ { "date": "2026-10-08", "weightKg": 81, "waistCm": 95, "armCm": null, "thighCm": null } ],
  "chart": [ { "date": "2026-10-08", "weightKg": 81, "weightAvg7d": 81.4, "waistCm": 95, "waistAvg7d": 95, "armCm": null, "armAvg7d": null, "thighCm": null, "thighAvg7d": null } ],
  "latest": { "date": "2026-10-08", "weightKg": 81, "waistCm": 95 },
  "first": { "date": "2026-09-01", "weightKg": 84, "waistCm": null },
  "deltas": { "weightKg": -1.5, "waistCm": -2, "armCm": null, "thighCm": null },
  "averages": { "weight7d": 81.4, "waist7d": 95, "arm7d": null, "thigh7d": null },
  "trend": { "weeklyWeightChangeKg": -0.3, "averageWeight7d": 81.4, "previousAverageWeight7d": 81.7 }
}
```

`*Avg7d` es la **media móvil de 7 días** (el dato que se grafica: el peso diario
oscila por retención de agua). `deltas` compara los dos últimos valores de cada
medida. `trend.weeklyWeightChangeKg` compara la media de los últimos 7 días con
la de los 7 anteriores.

### `PUT /body/:date` · 🔒

Acepta cualquier subconjunto de `weightKg`, `waistCm`, `armCm`, `thighCm`. Es un
*upsert parcial*: guardar el peso **no borra** las medidas que ya estaban.

```json
{ "weightKg": 80.5, "waistCm": 88 }
```

```json
{ "message": "Registro corporal guardado", "date": "2026-10-09", "metrics": { "...": "..." }, "profileWeightUpdated": true }
```

| Código | Cuándo |
|---|---|
| `200` | Guardado |
| `400` | Ningún dato, valor fuera de rango (peso 20-400 kg, cintura 30-250 cm, brazo 10-100 cm, muslo 20-150 cm), fecha futura, anterior a 2 años o mal formada |

### `DELETE /body/:date` · 🔒

Borra el registro de ese día.

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
8. GET  /food/stats/week          → progreso de la semana, margen y peso estimado
9. PUT  /fasting/:date            → marcar un día de ayuno (cuenta en la semana)
10. PUT /day-types/:date          → marcar entreno / descanso (ajusta el objetivo)
11. GET /body?days=90             → peso y medidas con media móvil de 7 días
```
