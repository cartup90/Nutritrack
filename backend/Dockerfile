# ---------------------------------------------------------------------------
# Backend NutriTrack — imagen de producción
# ---------------------------------------------------------------------------
FROM node:20-slim

# sharp necesita libvips; en Debian slim las dependencias ya vienen resueltas
# por los binarios precompilados de sharp.
WORKDIR /app

ENV NODE_ENV=production

# Instalamos dependencias primero para aprovechar la caché de capas
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Código fuente y schema
COPY src ./src
COPY schema.sql ./

# Directorio para las imágenes subidas (se monta como volumen en compose)
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Ejecutamos como usuario sin privilegios
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
