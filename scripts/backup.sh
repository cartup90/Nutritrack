#!/usr/bin/env bash
# ===========================================================================
#  NutriTrack — Copia de seguridad
#
#  Guarda la base de datos Y las fotos. Las dos cosas hacen falta: restaurar
#  solo la base de datos dejaría todas las imágenes rotas.
#
#  Uso:
#      ./scripts/backup.sh                 # guarda en ./backups
#      ./scripts/backup.sh /ruta/externa   # guarda en otro sitio (recomendado)
#
#  Automatízalo con cron (en el VPS, como usuario con docker):
#      0 3 * * * cd /opt/nutritrack && ./scripts/backup.sh /var/backups/nutritrack >> /var/log/nutritrack-backup.log 2>&1
#
#  Restaurar: ./scripts/restore.sh <archivo-backup.tar.gz>
# ===========================================================================
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${1:-$RAIZ/backups}"
RETENCION_DIAS="${RETENCION_DIAS:-14}"

FECHA="$(date +%Y-%m-%d_%H%M%S)"
TRABAJO="$(mktemp -d)"
ARCHIVO="$DESTINO/nutritrack_$FECHA.tar.gz"

mkdir -p "$DESTINO"

echo "==> Copia de seguridad de NutriTrack — $FECHA"

# --- 1. Base de datos ------------------------------------------------------
echo "    [1/3] Volcando la base de datos..."
cd "$RAIZ"

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

$COMPOSE exec -T db pg_dump \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-nutritrack}" \
  --clean --if-exists --no-owner \
  > "$TRABAJO/base.sql"

TAM_DB=$(du -h "$TRABAJO/base.sql" | cut -f1)
echo "          base.sql ($TAM_DB)"

# --- 2. Fotos --------------------------------------------------------------
echo "    [2/3] Copiando las fotos..."
# Se copia desde el volumen al host a través de un contenedor efímero
docker run --rm \
  -v nutritrack_uploads:/origen:ro \
  -v "$TRABAJO":/destino \
  alpine sh -c 'if [ -d /origen ] && [ "$(ls -A /origen 2>/dev/null)" ]; then cp -a /origen/. /destino/fotos/; else mkdir -p /destino/fotos; fi'

NUM_FOTOS=$(find "$TRABAJO/fotos" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "          $NUM_FOTOS archivos"

# --- 3. Empaquetar ---------------------------------------------------------
echo "    [3/3] Empaquetando..."
tar -czf "$ARCHIVO" -C "$TRABAJO" .
rm -rf "$TRABAJO"

TAM=$(du -h "$ARCHIVO" | cut -f1)
echo "==> Listo: $ARCHIVO ($TAM)"

# --- Rotación --------------------------------------------------------------
if [ "$RETENCION_DIAS" -gt 0 ]; then
  BORRADOS=$(find "$DESTINO" -name 'nutritrack_*.tar.gz' -mtime "+$RETENCION_DIAS" -print -delete | wc -l | tr -d ' ')
  [ "$BORRADOS" -gt 0 ] && echo "    Eliminadas $BORRADOS copias de más de $RETENCION_DIAS días"
fi

echo
echo "RECUERDA: una copia en el mismo servidor no protege contra perder el"
echo "servidor. Llévalas fuera (otro equipo, S3, rclone...) con regularidad."
