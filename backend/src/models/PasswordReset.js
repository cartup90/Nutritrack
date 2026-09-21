import crypto from 'crypto';
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tokens de restablecimiento de contraseña.
 *
 * El token viaja en claro por el enlace que recibe el usuario, pero en la base
 * de datos solo se guarda su hash SHA-256. Así, aunque alguien obtuviera una
 * copia de la base de datos, no podría usarlo para apropiarse de cuentas.
 */

/** Cuánto dura un enlace de restablecimiento. */
const VALIDEZ_MINUTOS = Number(process.env.PASSWORD_RESET_MINUTES || 60);

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Crea un token de restablecimiento.
 * @returns {Promise<string>} el token en claro (el único momento en que existe)
 */
export const createResetToken = async (userId) => {
  // 32 bytes de entropía: inviable de adivinar por fuerza bruta
  const token = crypto.randomBytes(32).toString('hex');

  // Un usuario no debe acumular enlaces activos
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);

  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval, NOW())`,
    [uuidv4(), userId, hashToken(token), String(VALIDEZ_MINUTOS)]
  );

  return token;
};

/**
 * Valida un token y lo consume.
 * @returns {Promise<string|null>} el user_id, o null si no es válido
 */
export const consumeResetToken = async (token) => {
  if (!token || typeof token !== 'string') return null;

  const result = await query(
    `UPDATE password_reset_tokens
        SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    [hashToken(token)]
  );

  return result.rows[0]?.user_id || null;
};

/** Borra todos los tokens de un usuario (al cambiar la contraseña). */
export const clearResetTokens = async (userId) => {
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
};

/** Limpia tokens caducados o ya usados. */
export const purgeExpiredTokens = async () => {
  const result = await query(
    `DELETE FROM password_reset_tokens
      WHERE expires_at < NOW() OR used_at IS NOT NULL`
  );
  return result.rowCount;
};
