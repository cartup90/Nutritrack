/**
 * Utilidades compartidas para levantar una base PostgreSQL **en memoria**.
 *
 * Se usa en dos sitios:
 *   · scripts/dev-memory.mjs  → desarrollo local sin instalar PostgreSQL
 *   · tests/api.test.mjs      → tests de integración
 *
 * pg-mem implementa un subconjunto de PostgreSQL suficiente para esta app.
 * No soporta la extensión pgcrypto ni los triggers en PL/pgSQL, así que esas
 * sentencias se eliminan del schema (no afectan al comportamiento: `updated_at`
 * también se asigna explícitamente en cada UPDATE de los modelos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', 'schema.sql');

/** Lee schema.sql y elimina lo que pg-mem no puede interpretar. */
export const loadSchemaForMemoryDb = () => {
  return fs
    .readFileSync(SCHEMA_PATH, 'utf8')
    .replace(/CREATE EXTENSION[\s\S]*?;/i, '')
    .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$ LANGUAGE plpgsql;/i, '')
    .replace(/DROP TRIGGER[\s\S]*?;/gi, '')
    .replace(/CREATE TRIGGER[\s\S]*?set_updated_at\(\);/gi, '');
};

/**
 * Crea una base en memoria lista para usar.
 * @returns {{ db: object, pool: object, query: Function }}
 */
export const createInMemoryDatabase = () => {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.none(loadSchemaForMemoryDb());

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  return {
    db,
    pool,
    query: (text, params) => pool.query(text, params),
  };
};
