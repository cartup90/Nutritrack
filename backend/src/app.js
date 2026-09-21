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
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Convierte la lista de orígenes en lo que `cors` entiende nativamente:
   * strings exactos y objetos RegExp.
   *
   * Es importante NO usar una función aquí: el paquete resuelve las funciones
   * solo para peticiones normales, pero en el preflight OPTIONS la comparación
   * acaba siendo una igualdad exacta de strings. Con una función, un origen
   * comodín como el de un túnel se acepta en el GET pero el preflight se queda
   * SIN cabecera Access-Control-Allow-Origin, y el navegador bloquea todos los
   * POST/PUT/DELETE.
   *
   * Admite comodines parciales:
   *   CORS_ORIGINS=http://localhost:5173,https://*.trycloudflare.com
   */
  const originMatchers = allowedOrigins.map((pattern) => {
    if (pattern === '*') return /.*/;
    if (!pattern.includes('*')) return pattern;
    return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
  });

  const allowAnyOrigin = allowedOrigins.includes('*');

  /** ¿Está este Origin en la lista de permitidos? */
  const matchesOrigin = (origin) => {
    if (allowAnyOrigin) return true;
    if (!origin) return true; // sin Origin no es una petición de navegador
    return originMatchers.some((m) =>
      typeof m === 'string' ? m === origin : m.test(origin)
    );
  };

  app.use(
    cors({
      // Con `credentials: true` no se puede usar '*': hay que reflejar el origen
      origin: allowAnyOrigin ? true : originMatchers,
      credentials: true,
    })
  );

  // Diagnóstico: deja constancia en el log cuando se rechaza un origen, para
  // no tener que adivinar por qué el navegador bloquea las peticiones.
  if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && !matchesOrigin(origin)) {
        console.warn(
          `[cors] Origen rechazado: ${origin}\n` +
            `       Añádelo a CORS_ORIGINS (admite comodines, p. ej. https://*.trycloudflare.com)\n` +
            `       Actual: ${allowedOrigins.join(', ')}`
        );
      }
      next();
    });
  }

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
