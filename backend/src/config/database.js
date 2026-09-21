import { Pool, types } from 'pg';
import 'dotenv/config';

/**
 * Capa de acceso a datos.
 *
 * Todo el modelo consulta a través de `query()`, lo que permite sustituir la
 * implementación en tests de integración mediante `setQueryImplementation()`
 * (ver backend/tests/api.test.mjs, que usa una base PostgreSQL en memoria).
 */

// Las columnas DATE se devuelven como string 'YYYY-MM-DD' en lugar de objetos
// Date. Evita que la zona horaria del servidor desplace un día los
// agrupamientos por fecha (usados en las estadísticas).
types.setTypeParser(1082, (value) => value);

let pool = null;

const getPool = () => {
  if (pool) return pool;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // En producción gestionamos TLS con el proveedor; en local no aplica
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
  });

  return pool;
};

let implementation = null;

/** Ejecuta una consulta SQL. */
export const query = (text, params) => {
  if (implementation) return implementation(text, params);
  return getPool().query(text, params);
};

/**
 * Sustituye el motor de consultas. Solo para tests.
 * @param {null|((text: string, params?: any[]) => Promise<{rows: any[]}>) } fn
 */
export const setQueryImplementation = (fn) => {
  implementation = fn;
};

/** Comprueba la conectividad con la base de datos. */
export const checkConnection = async () => {
  await query('SELECT 1');
};

export default { query, getPool, setQueryImplementation, checkConnection };
