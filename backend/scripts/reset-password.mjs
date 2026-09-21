/**
 * Restablece la contraseña de un usuario.
 *
 * Útil cuando alguien la olvida o para preparar una demo. No hay endpoint HTTP
 * para esto a propósito: cambiar la contraseña debe hacerse desde el servidor,
 * nunca expuesto en la API.
 *
 * Uso (desde backend/):
 *   node scripts/reset-password.mjs <email> <nueva-contraseña>
 *
 * Ejemplo:
 *   node scripts/reset-password.mjs ana@ejemplo.com MiClaveNueva123
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const [, , email, nuevaPassword] = process.argv;

if (!email || !nuevaPassword) {
  console.error('Uso: node scripts/reset-password.mjs <email> <nueva-contraseña>');
  process.exit(1);
}

if (nuevaPassword.length < 6) {
  console.error('❌ La contraseña debe tener al menos 6 caracteres');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

try {
  const hash = await bcrypt.hash(nuevaPassword, 10);

  const { rowCount } = await pool.query(
    `UPDATE users SET password = $1, updated_at = NOW() WHERE email = LOWER($2)`,
    [hash, email]
  );

  if (rowCount === 0) {
    console.error(`❌ No existe ningún usuario con el email ${email}`);

    const { rows } = await pool.query(
      `SELECT email FROM users ORDER BY created_at`
    );
    if (rows.length) {
      console.log('\nUsuarios disponibles:');
      rows.forEach((r) => console.log(`  · ${r.email}`));
    }
    process.exitCode = 1;
  } else {
    console.log(`✅ Contraseña actualizada para ${email}`);
    console.log('   Ya puedes iniciar sesión con la nueva.');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
