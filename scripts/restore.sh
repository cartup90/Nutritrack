#!/usr/bin/env bash
# ===========================================================================
#  NutriTrack — Restaurar una copia de seguridad
#
#  Uso:
#      ./scripts/restore.sh backups/nutritrack_2026-01-15_030000.tar.gz
#
#  ATENCIÓN: esto REEMPLAZA la base de datos y las fotos actuales.
#  Pide confirmación antes de hacer nada.
# ===========================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo-backup.tar.gz>"
  echo
  echo "Copias disponibles:"
  ls -1ht backups/nutritrack_*.tar.gz 2>/dev/null | head -10 || echo "  (ninguna en ./backups)"
  exit 1
fi

ARCHIVO="$1"
[ -f "$ARCHIVO" ] || { echo "No existe el archivo: $ARCHIVO"; exit 1; }

COMPOSE="docker compose -f docker-compose.prod.yml"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a
DB="${POSTGRES_DB:-nutritrack}"
USUARIO="${POSTGRES_USER:-postgres}"

echo "=============================================================="
echo " Vas a RESTAURAR la copia:"
echo "   $ARCHIVO"
echo
echo " Esto BORRA los datos actuales de la base '$DB' y las fotos."
echo "=============================================================="
printf "Escribe 'RESTAURAR' para continuar: "
read -r CONFIRMA
[ "$CONFIRMA" = "RESTAURAR" ] || { echo "Cancelado."; exit 0; }

TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT

echo "==> Desempaquetando..."
tar -xzf "$ARCHIVO" -C "$TRABAJO"

[ -f "$TRABAJO/base.sql" ] || { echo "La copia no contiene base.sql"; exit 1; }

echo "==> Parando la API (para que nadie escriba durante la restauración)..."
$COMPOSE stop api >/dev/null

echo "==> Restaurando la base de datos..."
$COMPOSE exec -T db psql -U "$USUARIO" -d "$DB" < "$TRABAJO/base.sql" >/dev/null

if [ -d "$TRABAJO/fotos" ]; then
  NUM=$(find "$TRABAJO/fotos" -type f | wc -l | tr -d ' ')
  echo "==> Restaurando $NUM fotos..."
  docker run --rm \
    -v nutritrack_uploads:/destino \
    -v "$TRABAJO/fotos":/origen:ro \
    alpine sh -c 'rm -rf /destino/* && cp -a /origen/. /destino/'
else
  echo "==> La copia no incluye fotos; se dejan las actuales."
fi

echo "==> Arrancando la API..."
$COMPOSE start api >/dev/null
sleep 5

echo "==> Comprobando..."
if curl -fsS "http://localhost/api/health" >/dev/null 2>&1 \
   || docker exec nutritrack-api node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "==> Restauración completada y API respondiendo."
else
  echo "!!  La API no responde. Revisa:  $COMPOSE logs api"
  exit 1
fi
