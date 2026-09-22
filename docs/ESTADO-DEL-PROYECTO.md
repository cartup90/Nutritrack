# NutriTrack — Estado del proyecto

Documento de traspaso. Recoge qué está hecho, cómo arrancarlo, qué falta y las
decisiones técnicas con su motivo, para poder retomar el trabajo sin contexto
previo.

**Última actualización:** sesión de desarrollo inicial completa (20 commits).

---

## 1. Resumen

PWA de seguimiento nutricional que analiza fotos de platos con IA para estimar
calorías y macronutrientes, y lleva el seguimiento diario contra objetivos
personalizados.

**Estado:** funcional de punta a punta en local. Pendiente únicamente el
despliegue 24/7.

| Área | Estado |
|---|---|
| Análisis de fotos con IA | ✅ Funcionando |
| Seguimiento diario, historial, estadísticas | ✅ |
| Objetivos y macros personalizados | ✅ |
| Recomendaciones | ✅ |
| PWA instalable (manifest, service worker) | ✅ |
| Autenticación y recuperación de contraseña | ✅ |
| Tests | ✅ 62 pasando |
| Despliegue 24/7 | ⏳ Pendiente |

---

## 2. Dónde está el código

- **Local:** `C:\Users\Equipo\Desktop\DS Harness\NutriTrack`
- **GitHub:** https://github.com/cartup90/Nutritrack (público, rama `main`, 99 archivos)

El proyecto se movió a su propia carpeta para separarlo de los otros proyectos
del escritorio (`Agente pedagógico`, `Auto correo inst`), que **no** forman parte
de este repositorio.

---

## 3. Stack

**Backend**
Node.js 24 · Express 4 · PostgreSQL 16 · JWT · bcrypt · sharp · multer · nodemailer

**Frontend**
React 18 · Vite 5 · Tailwind CSS 3 · Zustand · React Router · Recharts · lucide-react

**IA**
API de DeepSeek, formato compatible con OpenAI Chat Completions.

| Modelo | Uso |
|---|---|
| `deepseek-flash` | Visión (análisis de fotos) **y** texto (recomendaciones) |
| `deepseek-v4-pro` | No sirve: **no admite imágenes** (verificado) |

> **Aviso sobre los modelos:** son modelos de razonamiento. Los tokens de
> `reasoning_content` **cuentan dentro de `max_tokens`**. Si el presupuesto se
> agota mientras razonan, la respuesta llega vacía o truncada. Por eso el
> análisis usa 8000 tokens.

---

## 4. Arrancar en local

### Requisitos ya instalados en este equipo

| Herramienta | Versión |
|---|---|
| Node.js | v24.19.0 |
| npm | 11.17.0 |
| PostgreSQL | 16.15 (servicio `postgresql-x64-16`, puerto 5432) |
| Docker | 29.8.0 (backend WSL2) |
| cloudflared | 2026.9.1 |
| Git hooks | `.githooks/pre-commit` activo |

### Arrancar

```bash
# Terminal 1 — API
cd "Desktop/DS Harness/NutriTrack/backend"
npm run dev          # http://localhost:5000/api

# Terminal 2 — Frontend
cd "Desktop/DS Harness/NutriTrack/frontend"
npm run dev          # http://localhost:5173
```

**O sin instalar PostgreSQL**, con base de datos en memoria (los datos se
pierden al parar):

```bash
cd backend
npm run dev:memory -- --seed    # crea demo@nutritrack.app / demo1234
```

**En Windows**, `scripts\dev-local.cmd` abre las dos ventanas y el navegador.

### Probar en el móvil (PWA)

Chrome exige HTTPS para instalar una PWA. Para eso está el túnel:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\probar-app.ps1
```

Construye el frontend, arranca backend y preview, abre el túnel y **te imprime
la URL**.

> ⚠️ **La URL del túnel cambia en cada arranque.** Es un subdominio aleatorio de
> Cloudflare (`*.trycloudflare.com`) y no se puede fijar sin un dominio propio.
> Cada vez que cambia, **las PWA ya instaladas dejan de funcionar**. Es la razón
> principal para desplegar en un servidor.

### Diagnóstico en el móvil

Dos herramientas para cuando algo falla **solo en el teléfono**:

| Herramienta | Dónde | Para qué |
|---|---|---|
| Panel de diagnóstico | Perfil → abajo del todo | Versión del build, si el service worker coincide, modo de pantalla, navegador detectado y User-Agent |
| Página de prueba | `/prueba-camara.html` | 7 patrones de selector de archivo distintos, con `getUserMedia` incluido. Dice cuáles funcionan |

La página de prueba fue clave para descubrir que **`getUserMedia` sí funciona**
en un dispositivo donde los selectores de archivo fallaban, y que abrir el
enlace desde **el navegador interno de WhatsApp** rompe tanto la instalación
como los selectores.

---

## 5. Variables de entorno

### `backend/.env` (existe, no se versiona)

| Variable | Valor actual | Notas |
|---|---|---|
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | En producción oculta errores internos |
| `CORS_ORIGINS` | `localhost:5173, localhost:4173, https://*.trycloudflare.com` | Admite comodines |
| `JWT_SECRET` | *(48 caracteres, generado)* | **Generar uno distinto en producción** |
| `JWT_EXPIRES_IN` | `7d` | |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/nutritrack` | |
| `DATABASE_SSL` | `false` | **`true` solo con Postgres gestionado** |
| `DEEPSEEK_API_KEY` | *(configurada)* | **Vive solo aquí, nunca en el frontend** |
| `DEEPSEEK_API_URL` | `https://api.deepseek.com/v1/chat/completions` | |
| `DEEPSEEK_VISION_MODEL` | `deepseek-flash` | Debe admitir imágenes |
| `DEEPSEEK_TEXT_MODEL` | `deepseek-flash` | |
| `DEEPSEEK_TIMEOUT_MS` | `90000` | |
| `DEEPSEEK_MAX_TOKENS` | `8000` | **No bajarlo de aquí** |
| `IMAGE_UPLOAD_PATH` | `./uploads` | |
| `IMAGE_MAX_SIZE_MB` | `8` | |

**No configuradas** (funcionan con valores por defecto):

| Variable | Por defecto | Para qué |
|---|---|---|
| `DEEPSEEK_SUGGESTIONS_THINKING` | `disabled` | Razonamiento de las recomendaciones |
| `DEEPSEEK_SUGGESTIONS_MAX_TOKENS` | `4000` | |
| `RECOMMENDATIONS_TTL_HOURS` | `12` | Caducidad de la caché |
| `PASSWORD_RESET_MINUTES` | `60` | Caducidad del enlace |
| `FRONTEND_URL` | `http://localhost:5173` | Solo respaldo del enlace de reset |
| `EMAIL_HOST/USER/PASS` | *(vacías)* | Sin ellas, el enlace de reset sale en la consola |

Todas documentadas en `backend/.env.example`.

### `frontend/.env`

No existe: el valor por defecto (`/api`, relativo) es correcto porque Vite hace
proxy en desarrollo y nginx/Caddy en producción.

---

## 6. Base de datos

PostgreSQL 16.15, base `nutritrack`. Está en `backend/schema.sql`, que es
**idempotente** (se puede aplicar en cada despliegue).

```bash
cd backend && npm run db:setup
```

| Tabla | Contenido |
|---|---|
| `users` | Cuentas, datos corporales, objetivo e intensidad |
| `food_entries` | Comidas, con macros de la IA **y** confirmados por el usuario |
| `recommendation_cache` | Recomendaciones cacheadas |
| `password_reset_tokens` | Tokens de reset (guardados **hasheados**) |

**Datos actuales:** 1 usuario (`cartup90@gmail.com`), 1 comida.

> **`docker-entrypoint-initdb.d` solo se ejecuta con el volumen vacío.** En
> Docker, un cambio de esquema **no llega** a una base ya creada. Por eso
> `scripts/deploy.sh` aplica las migraciones en cada despliegue.

---

## 7. Tests

```bash
cd backend && npm test
```

**62 tests de integración**, con PostgreSQL en memoria (`pg-mem`) y un servidor
que simula DeepSeek. Cubren, entre otros:

- Registro, login, validaciones, normalización de email
- **Aislamiento entre usuarios** (uno no puede leer ni modificar datos de otro)
- Análisis de imagen: optimización real con sharp, **eliminación de EXIF**, y
  cada código de error de la IA
- Macros: proteína por kg, topes de coherencia, suelo de seguridad
- Recomendaciones locales sin gastar tokens, y caché
- Recuperación de contraseña: token de un solo uso, caducidad, no filtrar qué
  emails existen

---

## 8. Funcionalidades

### Captura y análisis
- Foto con cámara o galería, **comprimida en el cliente** antes de subir
- Análisis en **dos pasos**: `POST /food/analyze` (no guarda) → el usuario
  revisa y corrige → `POST /food` (guarda)
- Se conservan los valores de la IA y los finales del usuario
- Optimización con sharp: máx 1024 px, JPEG ~150 KB, **EXIF eliminado**
  (privacidad: quita la geolocalización)

### Seguimiento
- Pantalla «Hoy»: anillo de calorías y barras de macros
- Historial con gráficos de 7/14/30 días
- Recomendaciones en **tres capas**: déficits calculados en local (gratis), base
  local de 39 alimentos (**0 tokens**), y modelo solo si se pide

### Objetivos
- TMB con Mifflin-St Jeor → TDEE por actividad → ajuste por objetivo
- **Intensidad** elegible: leve / moderado / agresivo, con avisos

| Objetivo | Ajuste (leve / moderado / agresivo) |
|---|---|
| Bajar de peso | −10 % / −20 % / −25 % |
| Mantener | 0 % |
| Ganar músculo | +5 % / +10 % / +15 % |

- **Suelo de seguridad**: nunca por debajo de la TMB ni de 1200 kcal (mujer) /
  1500 (hombre)
- **Macros por kg de peso**, no por porcentaje de calorías:

| Macro | Cálculo |
|---|---|
| Proteína | 1,6 g/kg (mantener) a 2,3 g/kg (déficit agresivo) |
| Grasa | 0,8 g/kg, topada al 35 % de las kcal |
| Carbohidratos | lo que queda |

- Desglose del gasto: TMB + TEF + **NEAT** + EAT (informativo)

---

## 9. Decisiones técnicas y por qué

**Proteína por kg, no por porcentaje.** Un 30 % de las kcal da bastante menos
proteína a alguien de 50 kg que a alguien de 100 kg, cuando lo que necesita el
músculo va ligado a la masa corporal.

**Razonamiento desactivado en las recomendaciones.** Con `reasoning_effort:
minimal` **fallaban 2 de cada 3** peticiones por razonamiento desbocado.
Desactivado: 3/3 válidas, 2,8 s y 0 tokens de razonamiento. En el análisis de
imágenes **no** se toca: sin razonar devuelve la lista de alimentos vacía.

**Déficits calculados en local.** `objetivo − consumido` es una resta exacta. No
tiene sentido pagar tokens para que un modelo la haga.

**Caché de recomendaciones.** La clave incluye día, objetivo y totales, así que
registrar una comida la invalida sola.

**Service worker con `skipWaiting`.** La alternativa (dejarlo esperando a que el
usuario acepte) tiene un agujero grave: una app instalada **antes** de que
existiera ese aviso no sabe avisar, y el service worker se queda esperando para
siempre. Es exactamente lo que pasó.

**Versión de caché sellada en cada build.** Sin eso, los nombres de caché no
cambian nunca y los archivos de cada despliegue se acumulan sin límite en el
dispositivo del usuario.

---

## 10. Problemas encontrados

Todos resueltos, pero conviene conocerlos porque fueron sutiles:

| Problema | Causa | Solución |
|---|---|---|
| Todo devolvía 500 en Docker | Se forzaba TLS con `NODE_ENV=production` y el Postgres del contenedor no habla SSL | Variable `DATABASE_SSL` explícita |
| `column does not exist` tras actualizar | `docker-entrypoint-initdb.d` solo corre con el volumen vacío | `deploy.sh` aplica migraciones siempre |
| La app no cargaba desde el móvil | CORS rechazaba el origen del túnel | Comodines (`https://*.trycloudflare.com`) |
| Los gráficos del historial salían vacíos | `created_at::date` devuelve un `Date`, y `.slice(0,10)` lo rompía | Parser de tipo DATE a string |
| El análisis de fotos fallaba siempre | `multer` usaba `diskStorage` pero el controlador leía `req.file.buffer` | `memoryStorage` + sharp |
| Respuestas vacías de la IA | Los tokens de razonamiento agotaban `max_tokens` | Subir a 8000 |
| El enlace de reset apuntaba a localhost | URL fija en lugar del origen de la petición | Se usa el `Origin` |

### Dos lecciones que costaron tiempo

**1. Cuando algo funciona y deja de funcionar, mira qué cambió.**
La cámara funcionaba en el móvil y dejó de funcionar. En vez de preguntarlo,
teoricé sobre por qué el patrón podría ser frágil, e hice **dos cambios
equivocados** (`sr-only` + `label`, y luego un input superpuesto). La solución
fue **revertir al original**, que tenía evidencia empírica de funcionar.

**2. Distingue "no funciona en mi app" de "no funciona en el dispositivo".**
El síntoma real era que abría el enlace desde **WhatsApp**, cuyo navegador
interno no puede instalar PWA ni abrir selectores de archivo. Se añadió un aviso
automático que detecta el navegador interno.

---

## 11. Pendiente: despliegue 24/7

**Todo está preparado y probado**, falta ejecutarlo en un servidor.

### Material listo

| Archivo | Para qué |
|---|---|
| `docker-compose.prod.yml` | Stack de producción (solo Caddy expone puertos) |
| `Caddyfile` | HTTPS automático con Let's Encrypt |
| `scripts/deploy.sh` | Despliegue con backup previo, migraciones y verificación |
| `scripts/backup.sh` | Base de datos **+ fotos**, con rotación |
| `scripts/restore.sh` | Restauración con confirmación |
| `docs/DESPLIEGUE-VPS.md` | Guía paso a paso |
| `.env.example` (raíz) | Plantilla de configuración de producción |

### Bloqueo actual

El **VPS está sin stock** en los proveedores económicos, y **Oracle Cloud
rechazó la tarjeta** por ser de débito.

Opciones:
- **RackNerd** (~1 €/mes, pago anual) — acepta PayPal
- **Oracle Cloud Always Free** (0 €) — acepta solo tarjeta de crédito
- Esperar reposición de Hetzner CX22 (~4,5 €/mes)

> **Muy importante:** con presupuesto ajustado, la opción de **más valor** es el
> plan gratuito de Oracle (ARM, 2 OCPU / 12 GB). **Verificado que `sharp`
> funciona en ARM64** y elimina el EXIF correctamente.
>
> Pero atención a su política: Oracle **puede reclamar instancias inactivas** si
> durante 7 días la CPU, la red **y** la memoria están por debajo del 20 %. Una
> app de bajo tráfico cae en eso. La mitigación es pasar la cuenta a **Pay As
> You Go** (no cobra mientras no salgas del plan gratuito).

### Antes de servir a usuarios reales

- [ ] **Dominio propio.** Sin él, el túnel cambia de URL y rompe las PWA
      instaladas. Además hace falta para HTTPS y para CORS estable.
- [ ] **Configurar copias de seguridad** y **probar una restauración**.
      Una copia que nunca se ha restaurado no es una copia.
- [ ] `JWT_SECRET` y `POSTGRES_PASSWORD` **nuevos**, distintos de los de desarrollo.
- [ ] **Cambiar la contraseña del usuario `postgres`** de PostgreSQL (sigue en
      la de por defecto, `postgres`).

---

## 12. Seguridad

**Resuelto:**

- La API key de DeepSeek vive **solo** en `backend/.env`, ignorado por git
  (verificado: no aparece en el bundle del frontend)
- **Hook `pre-commit`** que bloquea commits con secretos, activo y probado
- Contraseñas con bcrypt, sesiones con JWT
- Tokens de reset guardados **hasheados** (SHA-256), de un solo uso y con caducidad
- Todas las consultas filtran por `user_id`
- Las fotos se re-codifican (**EXIF eliminado**) y se borran al eliminar el registro
- Helmet con cabeceras de seguridad; `Permissions-Policy` limita la cámara al propio origen

**Importante:** el repositorio es **público**. El `.env` nunca se ha subido
(verificado en las 20 commits), pero conviene saberlo.

---

## 13. Comandos de referencia

```bash
# Desarrollo
npm run dev                    # backend
npm run dev:memory -- --seed   # backend con BD en memoria + datos demo
npm run dev                    # frontend (en su carpeta)

# Tests
cd backend && npm test         # 62 tests

# Base de datos
npm run db:setup               # aplica schema.sql (idempotente)
npm run db:docker              # PostgreSQL en contenedor

# Utilidades
node scripts/reset-password.mjs <email> <nueva>   # restablecer contraseña
node scripts/generate-icons.mjs                   # regenerar íconos PWA
powershell -File scripts\probar-app.ps1           # app + túnel HTTPS
powershell -File scripts\configurar-git.ps1       # verificar protección de secretos

# Producción (en el servidor)
./scripts/deploy.sh
./scripts/backup.sh
./scripts/restore.sh <archivo>
```

---

## 14. Próximos pasos sugeridos

**Bloqueantes para uso real:**

1. Comprar dominio y contratar servidor
2. Desplegar siguiendo `docs/DESPLIEGUE-VPS.md`
3. Configurar y **probar** las copias de seguridad

**Mejoras con valor:**

4. **Envío de correo** (SMTP) para el reset de contraseña — hoy el enlace sale
   en la consola del servidor
5. **Almacenamiento de fotos en S3/R2** si algún día se migra a un PaaS, donde
   el disco es efímero
6. **Notificaciones push** para recordar registrar comidas
7. Ampliar la base local de alimentos (hoy 39 platos)
