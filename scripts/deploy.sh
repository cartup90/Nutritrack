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

  # El Caddyfile del servidor NO es solo el de este repositorio: al final lleva
  # los bloques que AGREGAN los deploy.ps1 de los otros proyectos (Web personal
  # y Farmear Aula), porque los tres sitios comparten el mismo proceso Caddy.
  #
  # `git reset --hard` dejaría el archivo con la versión del repo y borraría esos
  # bloques: los certificados se siguen emitiendo (el desafío ACME va por HTTP)
  # pero Caddy ya no sabe qué servir y los tres sitios responden 404. Pasó de
  # verdad el 09/10/2026 al desplegar la v1.7.0.
  #
  # Por eso se guarda una copia antes del reset y después se reengancha lo que
  # sobra: la versión del repo es un prefijo exacto de la del servidor.
  SITIOS_CONSERVADOS=0
  cp -p Caddyfile /tmp/nutritrack.Caddyfile.previo 2>/dev/null || true

  git fetch --all --quiet
  git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)" --quiet
  verde "    En el commit $(git rev-parse --short HEAD)"

  if [ -s /tmp/nutritrack.Caddyfile.previo ]; then
    TAM_NUEVO="$(stat -c%s Caddyfile)"
    TAM_VIEJO="$(stat -c%s /tmp/nutritrack.Caddyfile.previo)"

    if [ "$TAM_VIEJO" -gt "$TAM_NUEVO" ] &&
       cmp -s -n "$TAM_NUEVO" Caddyfile /tmp/nutritrack.Caddyfile.previo; then
      # Camino normal: la parte de ANI no cambió, así que todo lo que sobra son
      # los bloques de los otros sitios (con sus comentarios).
      tail -c "+$((TAM_NUEVO + 1))" /tmp/nutritrack.Caddyfile.previo >> Caddyfile
      SITIOS_CONSERVADOS=1
      verde "    Bloques de los otros sitios conservados ($((TAM_VIEJO - TAM_NUEVO)) bytes)"
    elif grep -qE '^# --- (SITIO PERSONAL|FARMEAR AULA):' /tmp/nutritrack.Caddyfile.previo; then
      # La parte de ANI cambió en este despliegue: no se puede comparar por
      # prefijo, así que se conserva desde el primer marcador conocido.
      INICIO_SITIOS="$(grep -n -m1 -E '^# --- (SITIO PERSONAL|FARMEAR AULA):' \
        /tmp/nutritrack.Caddyfile.previo | cut -d: -f1)"
      printf '\n%s\n' "$(tail -n +"$INICIO_SITIOS" /tmp/nutritrack.Caddyfile.previo)" >> Caddyfile
      SITIOS_CONSERVADOS=1
      rojo "    Aviso: cambió la parte de ANI del Caddyfile. Los otros sitios se"
      rojo "    conservaron desde el marcador: revisá el archivo antes de dar por bueno el despliegue."
    fi
  fi
fi

# --- 4. Construir e iniciar -------------------------------------------------
azul "==> Construyendo imágenes (puede tardar varios minutos)"
$COMPOSE build --pull

azul "==> Levantando servicios"
$COMPOSE up -d

# --- 4a. Caddy tiene que seguir viendo los otros sitios ---------------------
# Si el contenedor se recreó, lee el archivo nuevo (con los bloques pegados
# arriba). Si NO se recreó, sigue viendo el inodo anterior, que ya los tenía.
# Se comprueba y, solo si no los ve, se reinicia (≈2 s de corte: ver §12.1).
if [ "$SITIOS_CONSERVADOS" -eq 1 ]; then
  if docker exec nutritrack-caddy grep -qE '^# --- (SITIO PERSONAL|FARMEAR AULA):' /etc/caddy/Caddyfile 2>/dev/null; then
    verde "    Caddy ve los bloques de los otros sitios"
  else
    rojo "    Caddy NO ve los bloques de los otros sitios: reiniciando el contenedor"
    docker restart nutritrack-caddy >/dev/null
    sleep 3
  fi
fi

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
