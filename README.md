# 🥗 NutriTrack — PWA de Seguimiento Nutricional con IA

Progressive Web App que analiza **fotos de platos de comida** con un modelo de
visión, estima calorías y macronutrientes, y lleva el seguimiento diario y
semanal contra tus objetivos personales.

Instalable en Android e iOS desde el navegador, **sin publicar en Google Play**.

---

## ✨ Funcionalidades

| Módulo | Estado |
|---|---|
| 📸 Captura de foto (cámara/galería) con compresión en el cliente | ✅ |
| 🤖 Análisis con IA: alimentos, porciones, kcal, macros, confianza | ✅ |
| ✏️ Confirmación y edición manual antes de guardar | ✅ |
| 🏠 Pantalla «Hoy»: anillo de calorías + barras de macros | ✅ |
| 📊 Historial con gráficos de 7/14/30 días y promedios | ✅ |
| 👤 Perfil con cálculo automático de objetivos (Mifflin-St Jeor) | ✅ |
| 💡 Recomendaciones personalizadas según el progreso del día | ✅ |
| 📱 PWA instalable (manifest + service worker + maskable icons) | ✅ |
| 📴 Consulta offline del historial cacheado | ✅ |
| 🔔 Notificaciones push | ⏳ fase 2 |
| ⌚ Wearables / Google Fit | ⏳ fase 2 |

---

## 🧱 Stack

**Backend** — Node.js 18+ · Express · PostgreSQL · JWT · bcrypt · sharp · multer
**Frontend** — React 18 · Vite · Tailwind CSS · Zustand · React Router · Recharts
**IA** — API de DeepSeek (formato compatible con OpenAI Chat Completions)

---

## 📁 Estructura

```
.
├── backend/
│   ├── src/
│   │   ├── app.js                    # App Express (montable, sin abrir puerto)
│   │   ├── server.js                 # Arranque + apagado ordenado
│   │   ├── config/database.js        # Pool de PostgreSQL + costura para tests
│   │   ├── controllers/              # authController, foodController
│   │   ├── models/                   # User, FoodEntry (SQL parametrizado)
│   │   ├── routes/index.js           # Definición de endpoints
│   │   ├── middleware/               # auth (JWT), upload (multer)
│   │   ├── services/
│   │   │   ├── deepSeekService.js    # Visión + recomendaciones, errores tipados
│   │   │   └── imageService.js       # Optimización, EXIF y borrado
│   │   └── utils/nutrition.js        # Mifflin-St Jeor y reparto de macros
│   ├── tests/api.test.mjs            # 35 tests de integración end-to-end
│   ├── scripts/
│   │   ├── setup-db.mjs              # Aplica schema.sql a PostgreSQL
│   │   ├── dev-memory.mjs            # Servidor dev con BD en memoria (+ demo)
│   │   └── memory-db.mjs             # Helper de PostgreSQL en memoria
│   ├── schema.sql                    # Tablas, índices y triggers
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/                    # Login, Register, Home, FoodCapture,
│   │   │                             # History, Profile, Recommendations
│   │   ├── components/               # ProgressRing, MacroBar, FoodEntryCard...
│   │   ├── store/                    # authStore, uiStore (Zustand)
│   │   ├── services/api.js           # Cliente HTTP + mensajes de error
│   │   └── utils/                    # nutrition.js, imageUtils.js
│   ├── public/
│   │   ├── manifest.json             # Manifest PWA
│   │   ├── sw.js                     # Service worker
│   │   └── icons/                    # 192, 512 y maskable
│   ├── nginx.conf                    # SPA fallback, proxy /api, caché
│   └── Dockerfile
│
├── .githooks/pre-commit               # Bloquea commits con secretos
├── scripts/
│   ├── generate-icons.mjs            # Genera los íconos PWA (sin dependencias)
│   ├── dev-local.cmd                 # Lanzador de desarrollo para Windows
│   ├── configurar-git.ps1            # Activa y verifica la protección de git
│   └── finalizar-docker.ps1          # Completa la instalación de Docker tras reiniciar
├── docs/
│   ├── API.md                        # Referencia completa de endpoints
│   └── DEPLOYMENT.md                 # Despliegue, HTTPS, privacidad
└── docker-compose.yml                # PostgreSQL + API + web
```

---

## 🚀 Probar en tu PC

Hay dos caminos. Empieza por el rápido.

### Opción rápida — sin instalar nada (base de datos en memoria)

Ideal para probar la app ya mismo. No necesitas PostgreSQL ni Docker.

```bash
# 1. Instala dependencias (solo la primera vez)
cd backend  && npm install
cd ../frontend && npm install

# 2. Arranca el backend con base de datos en memoria + datos de demo
cd ../backend && npm run dev:memory -- --seed

# 3. En OTRA terminal, arranca el frontend
cd frontend && npm run dev
```

Abre **http://localhost:5173** e inicia sesión con:

```
demo@nutritrack.app  /  demo1234
```

Ese usuario ya trae **7 días de comidas** de ejemplo, así que las pantallas de
Historial y Recomendaciones tienen datos desde el primer momento.

> En Windows también puedes hacer doble clic en `scripts\dev-local.cmd`, que
> abre las dos ventanas y el navegador de una vez.

**Limitaciones de este modo:**

- Los datos viven **solo mientras el proceso está en marcha**. Al parar el
  backend (Ctrl+C), se pierde todo. Es lo esperado: sirve para probar.
- Para volver a empezar de cero, para y vuelve a arrancar.

### Opción completa — con PostgreSQL (datos persistentes)

> **En este equipo ya está instalado y configurado**: PostgreSQL 16.15 corriendo
> como servicio, base de datos `nutritrack` creada, `psql` en el PATH y el
> `backend/.env` generado con un `JWT_SECRET` propio. Puedes saltar directo al
> paso 3.

```bash
# 1. (Ya hecho) PostgreSQL 16 instalado y en marcha
#    Servicio: postgresql-x64-16   |   puerto 5432
#    Usuario: postgres / postgres  |   Base de datos: nutritrack

# 2. (Ya hecho) backend/.env creado con DATABASE_URL y JWT_SECRET

# 3. Aplica el schema (idempotente) y arranca
cd backend
npm run db:setup
npm run dev
```

```bash
# En otra terminal
cd frontend && npm run dev
```

Si alguna vez necesitas reinstalar la base desde cero:

```bash
psql -U postgres -h localhost -c "DROP DATABASE nutritrack;"
psql -U postgres -h localhost -c "CREATE DATABASE nutritrack;"
cd backend && npm run db:setup
```

**Alternativa con Docker** (requiere el reinicio pendiente de WSL2, ver abajo):

```bash
docker compose up -d db
```

### Activar el análisis de fotos con IA

El análisis con IA necesita una **API key de DeepSeek**. El `backend/.env` ya
existe: abre el archivo y rellena la línea vacía.

```env
DEEPSEEK_API_KEY=sk-tu-api-key-real
DEEPSEEK_VISION_MODEL=deepseek-chat
```

> El servidor recarga solo (nodemon), así que basta con guardar el archivo.

Sin la key, el resto de la app funciona con normalidad (registro, login, perfil,
registro manual, estadísticas): solo falla el botón «Analizar con IA», que
muestra un aviso claro y ofrece cargar los datos a mano.

> Si tu cuenta no tiene acceso a un modelo multimodal, el backend responde con
> el código `VISION_UNSUPPORTED`. Como la API de DeepSeek es compatible con el
> formato OpenAI, puedes apuntar `DEEPSEEK_API_URL` a un gateway multimodal
> cambiando solo esa variable.

### Docker (opcional)

Docker Desktop está instalado, pero **WSL2 necesita un reinicio de Windows** para
activarse. Después de reiniciar, ejecuta en PowerShell **como administrador**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\finalizar-docker.ps1
```

Ese script instala el kernel de WSL2, arranca Docker Desktop, espera al daemon y
verifica con un contenedor de prueba.

Docker **no es necesario para este proyecto**: PostgreSQL ya corre de forma
nativa, así que es solo para el stack completo en contenedores
(`docker compose --profile full up`).

### Probar en el móvil

El flujo de cámara funciona sobre la red local sin más configuración:
`<input type="file" capture>` abre la app de cámara nativa y **no requiere
HTTPS**.

```bash
cd frontend && npm run dev -- --host
```

Abre `http://<IP-de-tu-PC>:5173` en el teléfono (misma red Wi-Fi).

Ten en cuenta que **la instalación como PWA y el service worker sí exigen un
contexto seguro**: funcionarán en `localhost`, pero no sobre `http://192.168.x.x`.
Para probar «Agregar a pantalla de inicio» en el móvil necesitas un túnel HTTPS
(p. ej. `npx cloudflared tunnel --url http://localhost:5173`) o desplegar en el
staging. Lo mismo aplica a `http://<IP>:5000` para las imágenes servidas por el
backend.

---

## 📦 Despliegue

Cuando ya funcione en local, la guía completa (Docker, HTTPS, variables de
entorno, backups y política de imágenes) está en
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Ponerla en producción 24/7

Para tenerla funcionando de forma permanente, con HTTPS automático, copias de
seguridad y actualizaciones, sigue
**[docs/DESPLIEGUE-VPS.md](docs/DESPLIEGUE-VPS.md)**.

Resumen: un VPS pequeño (~4-5 €/mes) con Docker. El despliegue se reduce a:

```bash
git clone https://github.com/cartup90/Nutritrack.git /opt/nutritrack
cd /opt/nutritrack && cp .env.example .env && nano .env
./scripts/deploy.sh
```

**Puedes tener HTTPS sin comprar dominio**, usando `sslip.io` (DNS comodín
gratuito), lo que permite instalar la PWA desde el móvil desde el primer día.

> ⚠️ **Antes de desplegar en cualquier PaaS (Render, Railway, Fly…), lee esto:**
> las fotos se guardan en el disco local del servidor. En un VPS con el volumen
> de Docker configurado esto funciona, pero **en un PaaS el disco es efímero** y
> las fotos se borrarían en cada despliegue. Para PaaS hay que migrar el
> almacenamiento a S3/R2/Supabase Storage.


---

## 🧪 Tests

```bash
cd backend
npm test
```

Los tests de integración levantan la app real contra un PostgreSQL en memoria
(`pg-mem`) y un servidor que simula la API de DeepSeek. Cubren:

- Registro, login, validaciones y normalización de email
- Cálculo y recálculo de objetivos (Mifflin-St Jeor)
- Análisis de imagen: optimización real con sharp, normalización de la
  respuesta, tolerancia a JSON envuelto en markdown, y cada código de error
  (`MISSING_API_KEY`, `RATE_LIMIT`, …)
- Guardado, edición, borrado y **borrado de la imagen asociada**
- Estadísticas diarias y por rango con serie continua
- **Aislamiento entre usuarios**: un usuario no puede leer ni modificar
  registros de otro

---

## 📱 Cómo se instala en Android

1. Abre la app en Chrome.
2. Aparecerá un banner propio **«Instalar NutriTrack»** (gestionado con
   `beforeinstallprompt`, no dependemos del prompt automático del navegador).
3. También puedes usar el menú **⋮ → Instalar aplicación**.
4. El ícono queda en la pantalla de inicio y la app abre en modo `standalone`,
   sin barra de direcciones.

Requisitos de instalabilidad y verificación: ver
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#1-requisitos-de-una-pwa-instalable).

### Cómo se actualiza la app instalada

**No hace falta desinstalarla ni volver a instalarla.** Al abrirla con conexión,
el service worker detecta la versión nueva y aparece un aviso
**«Hay una versión nueva · Actualizar»**; al tocarlo se aplica y se recarga.

Detalles del diseño, por si algún día falla algo:

- La **navegación es network-first**, así que el HTML siempre llega fresco. Como
  los archivos llevan hash de contenido (`index-Pqm86w2-.js`), un HTML nuevo
  apunta a archivos nuevos que no están en caché y se descargan solos.
- El service worker nuevo **no se activa solo**: espera y avisa. Si se activara
  de golpe, la pestaña abierta seguiría ejecutando el código anterior y parecería
  que la actualización no funcionó.
- La **versión de la caché se sella en cada build** (ver el plugin
  `sellar-service-worker` en `vite.config.js`). Sin eso, los nombres de caché no
  cambiarían nunca y los archivos de cada despliegue se acumularían sin límite en
  el dispositivo del usuario.

Si alguna vez una actualización no llega: cierra la app por completo (quítala de
recientes) y vuelve a abrirla. Como último recurso, en Chrome para Android,
**Configuración del sitio → Borrar datos** fuerza una instalación limpia (eso sí,
cierra la sesión).

Tus datos **no viven en el dispositivo**, están en el servidor, así que
actualizar, reinstalar o borrar los datos del sitio nunca los pierde.

---

## 🔒 Privacidad y datos sensibles

- Contraseñas con **bcrypt**; nunca se devuelven en las respuestas.
- Sesión con **JWT** persistida en el dispositivo.
- Las fotos se **re-codifican** (máx. 1024 px, JPEG ~150-250 KB) y se les
  **eliminan los metadatos EXIF**, incluida la geolocalización.
- Las imágenes se **borran al eliminar el registro** de comida, y también si el
  análisis con IA falla.
- Todas las consultas de comidas filtran por `user_id`.
- Helmet + `Permissions-Policy` restringiendo la cámara al propio origen.

---

## 🔐 Seguridad del repositorio

La API key de DeepSeek vive **exclusivamente** en `backend/.env`, que está
ignorado por git. Hay **tres capas** de protección:

| Capa | Archivo | Qué hace |
|---|---|---|
| 1 | `.gitignore` (raíz) | Ignora `.env`, `*.key`, `*.pem`, `uploads/`, backups |
| 2 | `backend/.gitignore`, `frontend/.gitignore` | Protegen también si se inicializa un repo dentro de esas carpetas |
| 3 | `.githooks/pre-commit` | **Bloquea el commit** si detecta un secreto preparado |

La tercera capa es la que de verdad importa: actúa incluso si alguien hace
`git add -f` y salta el `.gitignore`.

### Verificar el estado en cualquier momento

```powershell
powershell -ExecutionPolicy Bypass -File scripts\configurar-git.ps1 -SoloVerificar
```

Comprueba que `.env`, `uploads/`, `node_modules/` y `dist/` siguen ignorados y
que ningún `.env` está versionado.

### Antes de tu primer commit

Git necesita saber quién eres (solo la primera vez):

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
```

### Reglas que conviene no romper

- Nunca `git add -f` sobre un `.env`.
- Nunca metas claves en variables `VITE_*`: **se incrustan en el bundle y son
  públicas**.
- Si una clave llega a subirse, **considerala comprometida**: revócala en
  DeepSeek y genera otra. Borrarla del repositorio no basta, queda en el
  historial.



- [Referencia de la API](docs/API.md) — endpoints, payloads y códigos de error
- [Guía de despliegue](docs/DEPLOYMENT.md) — Docker, HTTPS, staging, backups

---

## 🗺️ Fase 2 (fuera del alcance actual)

- Notificaciones push de recordatorio (service worker + Web Push)
- Publicación en Google Play / App Store vía TWA o Capacitor
- Integración con Google Fit / Apple Health
- Funciones sociales (compartir comidas, seguir usuarios)
- Almacenamiento de imágenes en S3/R2 en lugar de disco local

---

## 📄 Licencia

MIT
