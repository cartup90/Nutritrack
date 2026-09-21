import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

import routes from './routes/index.js';

/**
 * Construye la aplicación Express.
 * Se separa de server.js para poder montarla en tests sin abrir un puerto.
 */
export const createApp = ({ enableLogging = true } = {}) => {
  const app = express();

  // Necesario para IPs reales detrás de un proxy (hosting con balanceador)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // --- Seguridad ---------------------------------------------------------
  app.use(
    helmet({
      // El frontend consume las imágenes desde otro origen
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        // Sin Origin = apps nativas, curl, health checks
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origen no permitido por CORS: ${origin}`));
      },
      credentials: true,
    })
  );

  app.use(compression());
  if (enableLogging && process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // --- Archivos estáticos -------------------------------------------------
  const uploadDir = process.env.IMAGE_UPLOAD_PATH || './uploads';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  app.use(
    '/uploads',
    express.static(path.resolve(uploadDir), { maxAge: '7d', index: false })
  );

  // --- API ----------------------------------------------------------------
  app.use('/api', routes);

  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // --- Manejo centralizado de errores -------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `La imagen supera el tamaño máximo permitido (${process.env.IMAGE_MAX_SIZE_MB || 8} MB)`
          : `Error al subir el archivo: ${err.message}`;
      return res.status(413).json({ error: message, code: err.code });
    }

    if (err?.message?.startsWith('Tipo de archivo no permitido')) {
      return res.status(415).json({ error: err.message, code: 'UNSUPPORTED_TYPE' });
    }

    if (err?.message?.startsWith('Origen no permitido')) {
      return res.status(403).json({ error: err.message });
    }

    console.error('[error]', err);

    res.status(err.status || 500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : err.message || 'Error interno del servidor',
    });
  });

  return app;
};

export default createApp;
