import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserRowById,
  verifyPassword,
  generateToken,
  updateUser,
  setUserPassword,
  publicUser,
} from '../models/User.js';
import { calculateGoals } from '../utils/nutrition.js';
import { clearRecommendationCache } from '../models/RecommendationCache.js';
import {
  createResetToken,
  consumeResetToken,
  clearResetTokens,
} from '../models/PasswordReset.js';
import { enviarEmailReset } from '../services/emailService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res
        .status(400)
        .json({ error: 'Nombre, email y contraseña son obligatorios' });
    }

    if (!EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: 'El email no tiene un formato válido' });
    }

    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }

    const user = await createUser({
      email: String(email).trim(),
      password,
      name: String(name).trim(),
      age: req.body.age ? Number(req.body.age) : null,
      gender: req.body.gender || null,
      height: req.body.height ? Number(req.body.height) : null,
      weight: req.body.weight ? Number(req.body.weight) : null,
      activityLevel: req.body.activityLevel || 'sedentary',
      goal: req.body.goal || 'maintain',
      goalIntensity: req.body.goalIntensity || 'moderate',
    });

    const token = generateToken(user);

    res.status(201).json({
      message: 'Cuenta creada correctamente',
      user,
      token,
      goals: calculateGoals(user),
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const row = await getUserByEmail(email);

    // Mensaje genérico para no filtrar qué emails existen
    if (!row) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const valid = await verifyPassword(password, row.password);
    if (!valid) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const user = publicUser(row);

    res.json({
      message: 'Sesión iniciada',
      user,
      token: generateToken(user),
      goals: calculateGoals(user),
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ user, goals: calculateGoals(user) });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, age, gender, height, weight, activityLevel, goal, goalIntensity } =
      req.body;

    const user = await updateUser(req.user.id, {
      name,
      age: age === undefined || age === '' ? undefined : Number(age),
      gender,
      height: height === undefined || height === '' ? undefined : Number(height),
      weight: weight === undefined || weight === '' ? undefined : Number(weight),
      activityLevel,
      goal,
      goalIntensity,
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Al cambiar los datos corporales cambian los objetivos, así que las
    // recomendaciones cacheadas dejan de ser válidas.
    await clearRecommendationCache(user.id);

    res.json({
      message: 'Perfil actualizado',
      user,
      goals: calculateGoals(user),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Contraseña
// ---------------------------------------------------------------------------

const MIN_PASSWORD = 6;

/**
 * Solicita un enlace de restablecimiento.
 *
 * Responde SIEMPRE lo mismo, exista o no el email. Si dijera "ese correo no
 * está registrado", cualquiera podría usar el formulario para averiguar qué
 * direcciones tienen cuenta.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: 'El email no tiene un formato válido' });
    }

    const respuesta = {
      message:
        'Si ese email tiene una cuenta, te hemos enviado un enlace para restablecer la contraseña.',
    };

    const row = await getUserByEmail(email);

    if (!row) {
      // Misma respuesta y mismo tiempo de proceso aproximado
      return res.json(respuesta);
    }

    const token = await createResetToken(row.id);
    const validezMinutos = Number(process.env.PASSWORD_RESET_MINUTES || 60);

    // Base del enlace.
    //
    // Se prefiere el origen desde el que se hizo la petición: así el enlace
    // funciona sin configurar nada, tanto en localhost como a través de un
    // túnel o del dominio real. FRONTEND_URL queda como último recurso.
    const origenPeticion = req.get('origin') || req.get('referer');
    let base;
    try {
      base = origenPeticion ? new URL(origenPeticion).origin : null;
    } catch {
      base = null;
    }
    base =
      base ||
      (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    const resetUrl = `${base}/restablecer?token=${token}`;

    const envio = await enviarEmailReset({
      to: row.email,
      nombre: row.name,
      resetUrl,
      validezMinutos,
    });

    // Sin SMTP configurado el enlace queda en el registro del servidor. Se
    // avisa en la respuesta para que quien administra sepa dónde mirar, pero
    // solo en desarrollo: en producción no se filtra nada.
    if (!envio.enviado && process.env.NODE_ENV !== 'production') {
      respuesta.devHint =
        'SMTP no configurado: el enlace está en la consola del servidor.';
    }

    res.json(respuesta);
  } catch (error) {
    next(error);
  }
};

/**
 * Restablece la contraseña con un token válido.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Falta el token de restablecimiento' });
    }

    if (!password || String(password).length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });
    }

    const userId = await consumeResetToken(token);

    if (!userId) {
      return res.status(400).json({
        error: 'El enlace no es válido o ha caducado. Solicita uno nuevo.',
        code: 'INVALID_TOKEN',
      });
    }

    await setUserPassword(userId, password);
    // Un cambio de contraseña invalida cualquier otro enlace pendiente
    await clearResetTokens(userId);

    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Cambia la contraseña del usuario autenticado.
 * Exige la contraseña actual: si alguien deja la sesión abierta, no puede
 * apropiarse de la cuenta cambiándola.
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Introduce tu contraseña actual y la nueva' });
    }

    if (String(newPassword).length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });
    }

    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    }

    const row = await getUserRowById(req.user.id);
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });

    const correcta = await verifyPassword(currentPassword, row.password);
    if (!correcta) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }

    await setUserPassword(row.id, newPassword);
    await clearResetTokens(row.id);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    next(error);
  }
};
