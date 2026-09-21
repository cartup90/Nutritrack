/**
 * Aplica schema.sql a la base de datos configurada en DATABASE_URL.
 *
 * Uso:  node scripts/setup-db.mjs        (desde backend/)
 *   o:  npm --prefix backend run db:setup
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '..', 'schema.sql');

if (!process.env.DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL. Copia .env.example a .env y configúralo.');
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// Mostramos solo el host de la conexión para no filtrar credenciales
const safeTarget = (() => {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(DATABASE_URL no parseable)';
  }
})();

try {
  console.log(`🔧 Aplicando schema en ${safeTarget}...`);

  // El schema es idempotente (IF NOT EXISTS / CREATE OR REPLACE)
  await pool.query(schema);

  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log('✅ Schema aplicado. Tablas disponibles:');
  for (const row of rows) console.log(`   · ${row.table_name}`);
} catch (error) {
  console.error('❌ Error aplicando el schema:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
