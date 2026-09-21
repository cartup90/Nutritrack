# Guía de despliegue — NutriTrack PWA

Esta guía cubre el paso a producción del backend, el frontend y la base de
datos, con los requisitos de HTTPS que exige una PWA instalable.

---

## 1. Requisitos de una PWA instalable

Chrome en Android solo ofrece la instalación si se cumplen **todas** estas
condiciones:

| Requisito | Dónde se cumple |
|---|---|
| Servido por **HTTPS** (o `localhost`) | Configuración del hosting / proxy TLS |
| `manifest.json` válido con `name`, `short_name`, `icons` (192 + 512), `start_url`, `display: standalone` | `frontend/public/manifest.json` |
| **Service worker** registrado y activo | `frontend/public/sw.js` + registro en `frontend/src/main.jsx` |
| Ícono **maskable** | `icons/icon-maskable-192x192.png` y `512x512` |
| `beforeinstallprompt` gestionado | `frontend/src/main.jsx` → `store/uiStore.js` → `components/InstallPrompt.jsx` |

> El `start_url` debe estar dentro del `scope` del service worker y devolver 200
> con el HTML del app shell. La configuración de `frontend/nginx.conf` lo
> garantiza con el *SPA fallback*.

### Verificar la instalabilidad

1. Abre la app en Chrome (Android o escritorio).
2. DevTools → **Application → Manifest**: sin errores.
3. DevTools → **Application → Service Workers**: estado *activated and is running*.
4. Lighthouse → auditoría **PWA / Installable**.

---

## 2. Variables de entorno

### Backend (`backend/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No (5000) | Puerto HTTP |
| `NODE_ENV` | Sí | `production` activa TLS en la BD y oculta errores internos |
| `DATABASE_URL` | **Sí** | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | **Sí** | Secreto de firma. Generar con `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | No (7d) | Duración de la sesión |
| `CORS_ORIGINS` | **Sí** | Orígenes permitidos, separados por coma |
| `DEEPSEEK_API_KEY` | **Sí** | API key de DeepSeek. **Nunca** en el frontend |
| `DEEPSEEK_API_URL` | No | Endpoint compatible con OpenAI Chat Completions |
| `DEEPSEEK_VISION_MODEL` | **Sí** | Modelo multimodal para analizar las fotos |
| `DEEPSEEK_TEXT_MODEL` | No | Modelo para las recomendaciones |
| `DEEPSEEK_TIMEOUT_MS` | No (45000) | Timeout del análisis |
| `IMAGE_UPLOAD_PATH` | No (`./uploads`) | Directorio de imágenes |
| `IMAGE_MAX_SIZE_MB` | No (8) | Tamaño máximo de subida |

> **Importante sobre visión:** si `DEEPSEEK_VISION_MODEL` apunta a un modelo sin
> capacidad multimodal, el análisis devolverá el código `VISION_UNSUPPORTED`.
> Como la API de DeepSeek es compatible con el formato OpenAI, puedes apuntar
> `DEEPSEEK_API_URL` a cualquier gateway multimodal que respete ese esquema y
> cambiar solo esa variable, sin tocar código.

### Frontend (`frontend/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL base de la API. En producción con Nginx se usa `/api` |

> Las variables `VITE_*` se **incrustan en el bundle en tiempo de build**. No
> pongas secretos aquí: serían públicos.

---

## 3. Opción A — Docker Compose (recomendada para staging/demo)

```bash
# 1. Crea el .env de la raíz con los secretos
cat > .env <<'EOF'
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CAMBIA_ESTA_CLAVE
POSTGRES_DB=nutritrack
JWT_SECRET=COLOCA_AQUI_OPENSSL_RAND_BASE64_48
DEEPSEEK_API_KEY=sk-tu-api-key
DEEPSEEK_VISION_MODEL=deepseek-chat
CORS_ORIGINS=https://tu-dominio.com
WEB_PORT=8080
EOF

# 2. Levanta todo (BD + API + frontend)
docker compose --profile full up -d --build

# 3. Comprueba
curl http://localhost:8080/api/health
```

- Frontend: `http://localhost:8080`
- API: `http://localhost:8080/api` (a través del proxy de Nginx)
- PostgreSQL: puerto `5432` (solo para desarrollo; no lo expongas en producción)

El `schema.sql` se aplica automáticamente en la primera inicialización del
volumen de datos. Para reaplicarlo:

```bash
docker compose exec api node scripts/setup-db.mjs
```

---

## 4. Opción B — Servicios gestionados

### 4.1 Base de datos

Cualquier PostgreSQL 14+ gestionado: **Supabase**, **Neon**, **Railway**,
**Render**, **RDS**.

1. Crea la instancia y copia la cadena de conexión.
2. Aplícala schema:
   ```bash
   cd backend
   DATABASE_URL="postgresql://..." npm run db:setup
   ```
3. Si el proveedor exige TLS, el backend ya lo activa con `NODE_ENV=production`.

### 4.2 Backend (Railway / Render / Fly.io)

- **Root directory:** `backend`
- **Build:** `npm ci --omit=dev`
- **Start:** `node src/server.js`
- Configura todas las variables de la tabla anterior.
- **Almacenamiento de imágenes:** el disco local es efímero en la mayoría de
  PaaS. Para producción real, monta un volumen persistente en
  `IMAGE_UPLOAD_PATH` o adapta `backend/src/services/imageService.js` a S3 /
  Cloudflare R2 / Supabase Storage.

### 4.3 Frontend (Vercel / Netlify / Cloudflare Pages)

- **Root directory:** `frontend`
- **Build:** `npm run build`
- **Output:** `dist`
- **Variable:** `VITE_API_URL=https://api.tu-dominio.com/api`

Ambas plataformas sirven por HTTPS y aplican el *SPA fallback*
automáticamente. Añade `frontend/public/_redirects` si usas Netlify:

```
/*  /index.html  200
```

> El service worker requiere que `/sw.js` se sirva desde la **raíz** del
> dominio. Vite copia `public/` tal cual a `dist/`, así que queda en `/sw.js`.

---

## 5. HTTPS

- **Vercel / Netlify / Cloudflare Pages:** TLS automático.
- **VPS con Docker:** usa Caddy (TLS automático) o Nginx + Certbot.

Ejemplo mínimo con Caddy delante del stack:

```caddyfile
tu-dominio.com {
    encode gzip
    reverse_proxy localhost:8080
}
```

Caddy obtiene y renueva el certificado de Let's Encrypt sin configuración
adicional. Todo el tráfico a `/api` y `/uploads` se enruta a través del Nginx
del contenedor `web`.

---

## 6. Política de datos de las imágenes

Implementada en `backend/src/services/imageService.js`:

- **Optimización:** se re-codifican a JPEG (máx. 1024 px, calidad 82). Una foto
  de móvil de ~4 MB baja a ~150-250 KB, lo que también abarata el envío a la IA.
- **Privacidad:** se **eliminan los metadatos EXIF** (incluida la
  geolocalización) al re-codificar. Solo se respeta la orientación antes de
  borrarlos.
- **Retención:** la imagen se guarda junto con el registro de comida y se
  **elimina del disco cuando el usuario borra ese registro**.
- **Imágenes huérfanas:** si el análisis con IA falla, la imagen recién subida
  se borra inmediatamente.

### Copias de seguridad

```bash
# Respaldo de la base de datos
pg_dump "$DATABASE_URL" -Fc -f nutritrack-$(date +%F).dump

# Restauración
pg_restore -d "$DATABASE_URL" --clean --if-exists nutritrack-2026-01-01.dump
```

---

## 7. Consideraciones de privacidad (datos de salud)

- Las contraseñas se almacenan con **bcrypt** (10 rondas) y nunca se devuelven
  en las respuestas de la API.
- La autenticación usa **JWT**; el token se guarda en `localStorage` y viaja en
  la cabecera `Authorization`.
- Los datos de salud (peso, altura, objetivos, comidas) son **datos sensibles**:
  limita el acceso a la base de datos, cifra las copias de seguridad y define
  un periodo de retención.
- Los endpoints de comidas filtran **siempre** por `user_id`, de modo que un
  usuario no puede leer ni modificar registros de otro (cubierto por test).
- Helmet añade cabeceras de seguridad; el frontend aplica
  `Permissions-Policy` restringiendo cámara al propio origen.

---

## 8. Lista de verificación antes de publicar

- [ ] `JWT_SECRET` largo y aleatorio (nunca el de `.env.example`).
- [ ] `NODE_ENV=production`.
- [ ] `CORS_ORIGINS` limitado a tu dominio real (sin `*`).
- [ ] `DEEPSEEK_API_KEY` definida **solo** en el backend.
- [ ] HTTPS activo y verificado.
- [ ] `/sw.js` y `/manifest.json` servidos con `Cache-Control: no-cache`.
- [ ] `IMAGE_UPLOAD_PATH` sobre un volumen persistente.
- [ ] Copias de seguridad automáticas de PostgreSQL.
- [ ] `npm --prefix backend test` en verde.
- [ ] Auditoría de Lighthouse PWA sin errores.

---

## 9. Operación

```bash
# Desarrollo
npm --prefix backend run dev          # API en :5000 (nodemon)
npm --prefix frontend run dev         # Vite en :5173 con proxy /api

# Tests
npm --prefix backend test

# Producción
npm --prefix frontend run build       # genera frontend/dist
npm --prefix backend start

# Utilidades
node scripts/generate-icons.mjs       # regenera los íconos PWA
```

### Registro de errores

`GET /api/health` devuelve `{ status: "ok" }`; úsalo como *health check* del
hosting. Los errores del servidor se registran por consola vía `morgan` y el
middleware central de errores; para producción se recomienda conectar Sentry u
otro agregador en `backend/src/app.js`.
