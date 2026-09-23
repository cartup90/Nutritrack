# NutriTrack — Estado del proyecto

Documento de traspaso. Recoge qué está hecho, cómo arrancarlo, qué falta y las
decisiones técnicas con su motivo, para poder retomar el trabajo sin contexto
previo.

**Última actualización:** desplegado en producción (Hetzner CX23) y añadida la
corrección manual del plato clasificado por la IA.

---

## 1. Resumen

PWA de seguimiento nutricional que analiza fotos de platos con IA para estimar
calorías y macronutrientes, y lleva el seguimiento diario contra objetivos
personalizados.

**Estado:** en producción, accesible 24/7 por HTTPS.

**URL:** https://nutritrack.2.29.50.84.sslip.io

> Es un nombre prestado de `sslip.io` (resuelve a la IP del servidor) para no
> comprar un dominio todavía. Sirve igual para HTTPS y para instalar la PWA,
> pero **cuando se compre un dominio propio hay que cambiar `DOMAIN` en el
> `.env` del servidor y volver a desplegar**.

| Área | Estado |
|---|---|
| Análisis de fotos con IA | ✅ Funcionando |
| Corrección manual del plato antes del análisis | ✅ |
| Seguimiento diario, historial, estadísticas | ✅ |
| Objetivos y macros personalizados | ✅ |
| Recomendaciones | ✅ |
| PWA instalable (manifest, service worker) | ✅ |
| Autenticación y recuperación de contraseña | ✅ |
| Tests | ✅ 65 pasando |
| Despliegue 24/7 | ✅ En producción |
| Copias de seguridad | ✅ Diarias a las 3:00 |

---

## 2. Dónde está el código

- **Local:** `C:\Users\Equipo\Desktop\DS Harness\NutriTrack`
- **GitHub:** https://github.com/cartup90/Nutritrack (público, rama `main`)
- **Servidor:** `2.29.50.84` — Hetzner CX23, Ubuntu 26.04 LTS, 2 vCPU / 4 GB
  - Proyecto en `/opt/nutritrack`, usuario `nutri`
  - Acceso: `ssh nutritrack-hetzner` (alias local ya configurado)

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
| `DEEPSEEK_ANALYSIS_ATTEMPTS` | `2` | Reintentos del análisis si el JSON llega truncado |
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
- **Corrección del plato clasificado** (opcional, en dos momentos):
  - **Antes** de analizar: campo «¿Qué plato es?» en la previsualización, por si
    el usuario ya sabe lo que es y quiere guiar a la IA desde el principio.
  - **Después** de analizar: bloque «¿No es el plato correcto? Corregir plato»
    que **vuelve a analizar la misma foto** con el nombre correcto, sin obligar
    a repetir la captura.
  - Se implementa mandando `customName` en el formulario; el backend lo inyecta
    en el prompt y el modelo recalcula ingredientes, pesos y macros sabiendo qué
    es de verdad.
- Se conservan los valores de la IA y los finales del usuario
- Optimización con sharp: máx 1024 px, JPEG ~150 KB, **EXIF eliminado**
  (privacidad: quita la geolocalización)
- Si la IA devuelve un JSON truncado, **se reintenta una vez** antes de fallar
  (`DEEPSEEK_ANALYSIS_ATTEMPTS`)

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

**El nombre del plato se manda ANTES de calcular los macros, no después.**
El modelo de visión acierta casi siempre, pero cuando falla el error se arrastra
a todo el análisis: si cree que son fideos de huevo, calcula los macros de unos
fideos de huevo. Corregir el nombre *después* obliga a rehacer el análisis de
todas formas, así que el campo se ofrece en dos momentos: antes de analizar
(opcional, si el usuario ya sabe lo que es) y después, para repetir el análisis
con el nombre correcto. Se resuelve reenviando la imagen con un `customName`,
que se inyecta en el prompt. Medido con la misma foto:

| Petición | Resultado |
|---|---|
| Sin indicar plato | 280-494 kcal, 7 ingredientes |
| Con `customName="tarta de atun"` | 731-990 kcal |
| Con `customName="cebollas cortadas muy finas"` | 80-160 kcal, 1 ingrediente |

**Reintento cuando el modelo devuelve JSON truncado.** Medido contra la API
real: **1 de cada ~7** análisis devolvía el JSON cortado a la mitad (el
razonamiento se come parte de `max_tokens`) y el backend lo reportaba como
*"No se pudo contactar al servicio de IA"*, mandando al usuario a revisar su
conexión cuando el problema era otro. Ahora `parseJsonResponse` marca ese fallo
como `INVALID_JSON` y `analyzeFoodImage` reintenta una vez
(`DEEPSEEK_ANALYSIS_ATTEMPTS`). Con el reintento: **10/10 análisis correctos**
seguidos, frente a fallos esporádicos antes.

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
| Fallos esporádicos de la IA (*"revisa tu conexión"*) | El modelo devolvía JSON truncado y se mapeaba como error de red | Reintento + código `INVALID_JSON` |
| `Permission denied` al ejecutar `deploy.sh` tras actualizar | `git reset --hard` restaura el modo del índice y el script perdía el `+x` | Bit de ejecución marcado **en git** (`update-index --chmod=+x`) |

### Lecciones que costaron tiempo

**1. Cuando algo funciona y deja de funcionar, mira qué cambió.**
La cámara funcionaba en el móvil y dejó de funcionar. En vez de preguntarlo,
teoricé sobre por qué el patrón podría ser frágil, e hice **dos cambios
equivocados** (`sr-only` + `label`, y luego un input superpuesto). La solución
fue **revertir al original**, que tenía evidencia empírica de funcionar.

**2. Distingue "no funciona en mi app" de "no funciona en el dispositivo".**
El síntoma real era que abría el enlace desde **WhatsApp**, cuyo navegador
interno no puede instalar PWA ni abrir selectores de archivo. Se añadió un aviso
automático que detecta el navegador interno.

**3. Un mensaje de error equivocado cuesta más que el propio fallo.**
El JSON truncado se reportaba como problema de red. Eso manda al usuario (y a
quien depure) a mirar donde no está el problema. **Si un error se mapea a una
causa, hay que comprobar que la causa es cierta**; un `SyntaxError` de `JSON.parse`
no tiene `.response`, así que caía en la rama de "error de red" por descarte.

**4. `ssh-keygen -N '""'` en PowerShell NO deja la clave sin contraseña.**
Crea la clave con la contraseña literal `""` (dos comillas). El síntoma es
desconcertante: el servidor dice *"Server accepts key"* y acto seguido
*"Permission denied"*, porque el cliente **no puede firmar** (le falta la
contraseña que nadie le pidió). La pista está en el verbose: *"we did not send a
packet, disable method"*. Se genera con `cmd /c` y `-N ""`, y se comprueba con
`ssh-keygen -y -f <clave>`, que debe responder al instante.

---

## 11. Despliegue 24/7 — HECHO

**En producción desde la sesión de despliegue.** Servidor **Hetzner CX23**
(Ubuntu 26.04 LTS, 2 vCPU, 4 GB RAM, 40 GB SSD) en `2.29.50.84`.

### Cómo quedó montado

| Pieza | Dónde / cómo |
|---|---|
| Código | `/opt/nutritrack` (clon del repo, usuario `nutri`) |
| Contenedores | `nutritrack-db`, `nutritrack-api`, `nutritrack-web`, `nutritrack-caddy` |
| HTTPS | Caddy + Let's Encrypt (certificado real, no staging) |
| Dominio | `nutritrack.2.29.50.84.sslip.io` (prestado, sin coste) |
| Cortafuegos | UFW: solo 22, 80, 443 (tcp y udp) |
| SSH | **Solo clave pública.** `PasswordAuthentication no` |
| Copias | Cron diario a las 3:00 → `/var/backups/nutritrack` |
| Secretos | `POSTGRES_PASSWORD` y `JWT_SECRET` nuevos y aleatorios |

### Material que ya existía y se usó tal cual

| Archivo | Para qué |
|---|---|
| `docker-compose.prod.yml` | Stack de producción (solo Caddy expone puertos) |
| `Caddyfile` | HTTPS automático con Let's Encrypt |
| `scripts/deploy.sh` | Despliegue con backup previo, migraciones y verificación |
| `scripts/backup.sh` | Base de datos **+ fotos**, con rotación |
| `scripts/restore.sh` | Restauración con confirmación |
| `DOCS/DESPLIEGUE-VPS.md` | Guía paso a paso |
| `.env.example` (raíz) | Plantilla de configuración de producción |

### Operación diaria

```bash
ssh nutritrack-hetzner          # alias ya configurado en el PC
cd /opt/nutritrack
./scripts/deploy.sh             # actualizar tras un push a main
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

### Pendiente antes de servir a usuarios reales

- [ ] **Dominio propio.** El de `sslip.io` funciona, pero cambia si cambia la IP
      y no es presentable. Al comprarlo: cambiar `DOMAIN` en `.env` y desplegar.
- [ ] **Probar una restauración de verdad.** Una copia que nunca se ha
      restaurado no es una copia (`./scripts/restore.sh <archivo>`).
- [ ] **Sacar las copias del servidor** (rclone a S3/Drive). Hoy viven en el
      mismo disco: si muere el servidor, se van con él.
- [ ] **Cambiar la contraseña de root** del servidor (la del correo de Hetzner
      ya no sirve por SSH, pero sigue siendo válida en la consola de rescate).
- [ ] **Rotar la API key de DeepSeek** si se ha compartido por algún sitio.
- [ ] SMTP para el reset de contraseña (hoy el enlace sale en el log del
      servidor).
- [ ] Monitor externo apuntando a `/api/health`.

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

**Añadido en el despliegue:**

- SSH **solo con clave pública** (`PasswordAuthentication no`,
  `PermitRootLogin prohibit-password`). La contraseña de root del correo de
  Hetzner ya **no vale por SSH**, solo en la consola de rescate.
- Cortafuegos UFW: solo 22, 80 y 443. PostgreSQL (5432) y la API (5000) **no**
  están publicados: viven en la red interna de Docker.
- `POSTGRES_PASSWORD` y `JWT_SECRET` generados en el servidor con `openssl rand`
  (hexadecimal, para que no haya caracteres que rompan la `DATABASE_URL`).
- El `.env` del servidor tiene permisos `600` y pertenece a `nutri`.

---

## 13. Comandos de referencia

```bash
# Desarrollo
npm run dev                    # backend
npm run dev:memory -- --seed   # backend con BD en memoria + datos demo
npm run dev                    # frontend (en su carpeta)

# Tests
cd backend && npm test         # 65 tests

# Base de datos
npm run db:setup               # aplica schema.sql (idempotente)
npm run db:docker              # PostgreSQL en contenedor

# Utilidades
node scripts/reset-password.mjs <email> <nueva>   # restablecer contraseña
node scripts/generate-icons.mjs                   # regenerar íconos PWA
powershell -File scripts\probar-app.ps1           # app + túnel HTTPS (pruebas locales)
powershell -File scripts\configurar-git.ps1       # verificar protección de secretos

# Producción (en el servidor, o por ssh)
ssh nutritrack-hetzner
cd /opt/nutritrack
./scripts/deploy.sh                               # desplegar / actualizar
./scripts/backup.sh /var/backups/nutritrack       # copia manual
./scripts/restore.sh <archivo.tar.gz>             # restaurar
docker compose -f docker-compose.prod.yml ps      # estado
docker compose -f docker-compose.prod.yml logs -f api
```

---

## 14. Próximos pasos sugeridos

**Bloqueantes para uso real:**

1. **Comprar un dominio** y cambiar `DOMAIN` en el `.env` del servidor (el
   `sslip.io` actual funciona, pero depende de la IP y no es presentable)
2. **Probar una restauración** de las copias de seguridad
3. **Sacar las copias del servidor** (rclone a S3/Drive): hoy están en el mismo
   disco, así que no protegen contra perder el servidor

**Mejoras con valor:**

4. **Envío de correo** (SMTP) para el reset de contraseña — hoy el enlace sale
   en la consola del servidor
5. **Almacenamiento de fotos en S3/R2** si algún día se migra a un PaaS, donde
   el disco es efímero
6. **Notificaciones push** para recordar registrar comidas
7. Ampliar la base local de alimentos (hoy 39 platos)
8. **Monitor externo** (UptimeRobot, BetterStack) apuntando a `/api/health`
