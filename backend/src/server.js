import 'dotenv/config';
import { createApp } from './app.js';
import { checkConnection } from './config/database.js';
import {
  startReminderScheduler,
  stopReminderScheduler,
} from './services/reminderScheduler.js';

const PORT = process.env.PORT || 5000;

const app = createApp();

const server = app.listen(PORT, async () => {
  console.log(`🚀 API ANI escuchando en http://localhost:${PORT}/api`);

  try {
    await checkConnection();
    console.log('✅ Base de datos conectada');
  } catch (error) {
    console.error('❌ No se pudo conectar a la base de datos:', error.message);
    console.error('   Revisa DATABASE_URL en tu archivo .env');
  }

  // Los recordatorios de agua son opcionales: si no hay claves VAPID
  // configuradas, esto no hace nada y la app sigue igual.
  startReminderScheduler();
});

// Apagado ordenado
const shutdown = (signal) => {
  console.log(`\n${signal} recibido, cerrando servidor...`);
  stopReminderScheduler();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
