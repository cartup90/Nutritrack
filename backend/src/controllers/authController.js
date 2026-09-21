import {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  generateToken,
  updateUser,
  publicUser,
} from '../models/User.js';
import { calculateGoals } from '../utils/nutrition.js';

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
    const { name, age, gender, height, weight, activityLevel, goal } = req.body;

    const user = await updateUser(req.user.id, {
      name,
      age: age === undefined || age === '' ? undefined : Number(age),
      gender,
      height: height === undefined || height === '' ? undefined : Number(height),
      weight: weight === undefined || weight === '' ? undefined : Number(weight),
      activityLevel,
      goal,
    });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      message: 'Perfil actualizado',
      user,
      goals: calculateGoals(user),
    });
  } catch (error) {
    next(error);
  }
};
