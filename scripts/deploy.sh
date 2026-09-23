#!/usr/bin/env bash
# ===========================================================================
#  NutriTrack — Desplegar / actualizar en el VPS
#
#  Hace una copia de seguridad ANTES de tocar nada, y si el despliegue falla
#  la API no queda caída sin que te enteres.
#
#  Uso (en el VPS, dentro de /opt/nutritrack):
#      ./scripts/deploy.sh
# ===========================================================================
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

azul()  { printf '\033[0;36m%s\033[0m\n' "$1"; }
verde() { printf '\033[0;32m%s\033[0m\n' "$1"; }
rojo()  { printf '\033[0;31m%s\033[0m\n' "$1"; }

azul "==> Desplegando NutriTrack"

# --- 1. Comprobaciones previas --------------------------------------------
[ -f .env ] || { rojo "Falta el archivo .env"; exit 1; }
for v in DOMAIN POSTGRES_PASSWORD JWT_SECRET DEEPSEEK_API_KEY; do
  grep -q "^$v=" .env || { rojo "Falta $v en .env"; exit 1; }
done
verde "    Configuración presente"

# --- 2. Copia de seguridad -------------------------------------------------
if $COMPOSE ps db 2>/dev/null | grep -q "Up"; then
  azul "==> Copia de seguridad previa (por si hay que volver atrás)"
  ./scripts/backup.sh >/dev/null 2>&1 && verde "    Copia creada" || rojo "    La copia falló (se continúa igualmente)"
else
  verde "    Primera instalación: no hay nada que copiar"
fi

# --- 3. Código -------------------------------------------------------------
if [ -d .git ]; then
  azul "==> Actualizando el código desde git"
  git fetch --all --quiet
  git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)" --quiet
  verde "    En el commit $(git rev-parse --short HEAD)"
fi

# --- 4. Construir e iniciar -------------------------------------------------
azul "==> Construyendo imágenes (puede tardar varios minutos)"
$COMPOSE build --pull

azul "==> Levantando servicios"
$COMPOSE up -d

# --- 4b. Migraciones de esquema -------------------------------------------
# IMPORTANTE: docker-entrypoint-initdb.d SOLO se ejecuta cuando el volumen de
# datos está vacío (primera instalación). En cualquier actualización posterior
# NO aplica nada, así que un cambio de esquema no llegaría nunca a la base y
# la API empezaría a fallar con "column does not exist".
# schema.sql es idempotente (IF NOT EXISTS / ALTER ... IF NOT EXISTS), por lo
# que es seguro aplicarlo en cada despliegue.
azul "==> Esperando a la base de datos"
for i in $(seq 1 12); do
  if $COMPOSE exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-nutritrack}" >/dev/null 2>&1; then
    verde "    Base de datos lista"
    break
  fi
  sleep 5
done

azul "==> Aplicando migraciones de esquema"
if $COMPOSE exec -T api node scripts/setup-db.mjs; then
  verde "    Esquema al día"
else
  rojo "==> Falló la migración. NO continúes: revisa el error de arriba."
  exit 1
fi

# --- 5. Verificar -----------------------------------------------------------
azul "==> Esperando a que la API responda (hasta 90s)"
OK=0
for i in $(seq 1 18); do
  sleep 5
  if docker exec nutritrack-api node -e \
      "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    OK=1; verde "    API respondiendo (${i}0s aprox.)"; break
  fi
  printf '    ... %ss\n' "$((i*5))"
done

if [ "$OK" -ne 1 ]; then
  rojo "==> La API no responde. Últimas líneas del log:"
  $COMPOSE logs api --tail 30
  exit 1
fi

# --- 6. Limpieza ------------------------------------------------------------
azul "==> Limpiando imágenes antiguas"
docker image prune -f >/dev/null 2>&1 || true

echo
verde "======================================================"
verde "  Desplegado correctamente"
verde "  https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
verde "======================================================"
echo
echo "  Estado:   $COMPOSE ps"
echo "  Logs:     $COMPOSE logs -f api"
echo "  Copias:   ./scripts/backup.sh"
