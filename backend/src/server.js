import 'dotenv/config';
import { createApp } from './app.js';
import { checkConnection } from './config/database.js';

const PORT = process.env.PORT || 5000;

const app = createApp();

const server = app.listen(PORT, async () => {
  console.log(`🚀 API NutriTrack escuchando en http://localhost:${PORT}/api`);

  try {
    await checkConnection();
    console.log('✅ Base de datos conectada');
  } catch (error) {
    console.error('❌ No se pudo conectar a la base de datos:', error.message);
    console.error('   Revisa DATABASE_URL en tu archivo .env');
  }
});

// Apagado ordenado
const shutdown = (signal) => {
  console.log(`\n${signal} recibido, cerrando servidor...`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
