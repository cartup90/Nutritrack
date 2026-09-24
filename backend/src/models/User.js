import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;

/** Serializa una fila de usuario para el cliente (nunca expone el hash). */
export const publicUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    age: row.age,
    gender: row.gender,
    height: row.height !== null ? Number(row.height) : null,
    weight: row.weight !== null ? Number(row.weight) : null,
    activityLevel: row.activity_level,
    goal: row.goal,
    goalIntensity: row.goal_intensity || 'moderate',
    // Meta de agua en ml. 2000 por defecto si la columna aún no existe.
    waterGoalMl: Number.isFinite(Number(row.water_goal_ml))
      ? Number(row.water_goal_ml)
      : 2000,
    createdAt: row.created_at,
  };
};

export const createUser = async ({
  email,
  password,
  name,
  age = null,
  gender = null,
  height = null,
  weight = null,
  activityLevel = 'sedentary',
  goal = 'maintain',
  goalIntensity = 'moderate',
}) => {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users
       (id, email, password, name, age, gender, height, weight, activity_level, goal, goal_intensity, created_at, updated_at)
     VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
     RETURNING *`,
    [uuidv4(), email, hashedPassword, name, age, gender, height, weight, activityLevel, goal, goalIntensity]
  );

  return publicUser(result.rows[0]);
};

export const getUserByEmail = async (email) => {
  const result = await query(`SELECT * FROM users WHERE email = LOWER($1)`, [email]);
  return result.rows[0];
};

export const getUserById = async (id) => {
  const result = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return publicUser(result.rows[0]);
};

/** Devuelve la fila completa (con hash) para poder verificar la contraseña. */
export const getUserRowById = async (id) => {
  const result = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0];
};

export const verifyPassword = (plain, hashed) => bcrypt.compare(plain, hashed);

/**
 * Cambia la contraseña de un usuario.
 *
 * Se usa tanto en el cambio voluntario como en el restablecimiento por enlace.
 * Siempre se cifra aquí, para que no haya ninguna ruta que pueda guardarla en
 * claro por descuido.
 */
export const setUserPassword = async (userId, plainPassword) => {
  const hashed = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  const result = await query(
    `UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [hashed, userId]
  );

  return result.rows[0]?.id || null;
};

export const generateToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/** Actualiza solo los campos presentes en el payload. */
export const updateUser = async (id, data) => {
  const map = {
    name: 'name',
    age: 'age',
    gender: 'gender',
    height: 'height',
    weight: 'weight',
    activityLevel: 'activity_level',
    goal: 'goal',
    goalIntensity: 'goal_intensity',
    waterGoalMl: 'water_goal_ml',
  };

  const fields = [];
  const values = [];

  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      values.push(data[key] === '' ? null : data[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }

  if (fields.length === 0) return getUserById(id);

  fields.push('updated_at = NOW()');
  values.push(id);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );

  return publicUser(result.rows[0]);
};

// ---------------------------------------------------------------------------
// Recordatorios de agua (opcionales)
//
// Van aparte del perfil a propósito: se cambian desde otra pantalla y así un
// PUT /profile despistado no los sobrescribe.
// ---------------------------------------------------------------------------

/** Lee los ajustes de recordatorio de un usuario. */
export const getReminderSettings = async (userId) => {
  const result = await query(
    `SELECT water_reminder_enabled, water_reminder_times, timezone, water_goal_ml
       FROM users WHERE id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    enabled: Boolean(row.water_reminder_enabled),
    times: Array.isArray(row.water_reminder_times) ? row.water_reminder_times : [],
    timezone: row.timezone || null,
    waterGoalMl: Number(row.water_goal_ml) || 2000,
  };
};

/**
 * Guarda los ajustes de recordatorio.
 *
 * `timezone` usa COALESCE: si el cliente no la manda (null), se conserva la que
 * ya hubiera. Sin esto, guardar solo las horas borraría la zona y el
 * planificador no sabría cuándo avisar.
 */
export const updateReminderSettings = async (
  userId,
  { enabled, times, timezone = null }
) => {
  const result = await query(
    `UPDATE users
        SET water_reminder_enabled = $1,
            water_reminder_times   = $2::jsonb,
            timezone               = COALESCE($3, timezone),
            updated_at             = NOW()
      WHERE id = $4
      RETURNING water_reminder_enabled, water_reminder_times, timezone`,
    [Boolean(enabled), JSON.stringify(Array.isArray(times) ? times : []), timezone, userId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    enabled: Boolean(row.water_reminder_enabled),
    times: Array.isArray(row.water_reminder_times) ? row.water_reminder_times : [],
    timezone: row.timezone || null,
  };
};

/**
 * Usuarios con recordatorios activos y al menos un dispositivo suscrito.
 *
 * El JOIN es intencionado: no tiene sentido que el planificador procese a
 * quien activó los avisos pero no tiene ninguna suscripción (por ejemplo,
 * porque denegó el permiso de notificaciones). No habría a quién avisar.
 */
export const getUsersWithActiveReminders = async () => {
  const result = await query(
    `SELECT u.id,
            u.timezone,
            u.water_reminder_times,
            u.water_goal_ml,
            COUNT(p.id)::int AS subscription_count
       FROM users u
       JOIN push_subscriptions p ON p.user_id = u.id
      WHERE u.water_reminder_enabled = true
      GROUP BY u.id, u.timezone, u.water_reminder_times, u.water_goal_ml`
  );
  return result.rows;
};
