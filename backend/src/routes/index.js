import express from 'express';
import {
  register,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword,
} from '../controllers/authController.js';
import {
  analyzeFood,
  saveFood,
  createManualEntry,
  listFoodEntries,
  listAllFoodEntries,
  dailyStats,
  rangeStats,
  editFoodEntry,
  removeFoodEntry,
  suggestions,
} from '../controllers/foodController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// --- Salud ---------------------------------------------------------------
router.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// --- Autenticación (público) ---------------------------------------------
router.post('/auth/register', register);
router.post('/auth/login', login);

// Restablecimiento de contraseña (público: se ha perdido el acceso)
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

// --- Perfil --------------------------------------------------------------
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

// Cambio de contraseña con la sesión iniciada
router.put('/auth/password', authenticate, changePassword);

// --- Comidas -------------------------------------------------------------
// Flujo IA en dos pasos: analizar (sin guardar) → confirmar/guardar
router.post('/food/analyze', authenticate, upload.single('image'), analyzeFood);
router.post('/food', authenticate, saveFood);
router.post('/food/manual', authenticate, createManualEntry);

// Consultas (rutas literales antes que las paramétricas)
router.get('/food', authenticate, listFoodEntries);
router.get('/food/all', authenticate, listAllFoodEntries);
router.get('/food/stats/daily', authenticate, dailyStats);
router.get('/food/stats/range', authenticate, rangeStats);
router.get('/food/suggestions', authenticate, suggestions);

// Edición / borrado
router.put('/food/:id', authenticate, editFoodEntry);
router.delete('/food/:id', authenticate, removeFoodEntry);

export default router;
