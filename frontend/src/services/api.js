import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 90000, // el análisis con IA puede tardar
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Zona horaria del dispositivo, para que el backend agrupe las comidas por el
 * día del usuario y no por el día UTC del servidor.
 *
 * Se resuelve una sola vez: no cambia durante la sesión y consultarlo en cada
 * petición sería trabajo repetido.
 */
const ZONA_HORARIA = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
})();

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutritrack-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (ZONA_HORARIA) {
    config.headers['X-Timezone'] = ZONA_HORARIA;
  }
  return config;
});

/** Extrae un mensaje de error legible desde una respuesta de axios. */
export const getErrorMessage = (error) => {
  if (error.code === 'ECONNABORTED') {
    return 'La operación tardó demasiado. Revisa tu conexión e intenta de nuevo.';
  }
  if (!error.response) {
    return 'No se pudo conectar con el servidor.';
  }
  return (
    error.response.data?.error ||
    `Error del servidor (${error.response.status})`
  );
};

export const foodApi = {
  /**
   * PASO 1 — Envía la imagen al backend para que la IA la analice.
   * No guarda nada todavía.
   */
  analyze: async (imageFile, onUploadProgress, customName = null) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (customName) {
      formData.append('customName', customName);
    }

    const { data } = await api.post('/food/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
      timeout: 120000,
    });
    return data;
  },

  /** PASO 2 — Guarda la comida con los valores confirmados por el usuario. */
  save: async (payload) => {
    const { data } = await api.post('/food', payload);
    return data;
  },

  /** Alta manual (sin foto) cuando la IA no está disponible. */
  createManual: async (payload) => {
    const { data } = await api.post('/food/manual', payload);
    return data;
  },

  getEntries: async (params = {}) => {
    const { data } = await api.get('/food', { params });
    return data;
  },

  getAllEntries: async () => {
    const { data } = await api.get('/food/all');
    return data;
  },

  getDailyStats: async (date) => {
    const { data } = await api.get('/food/stats/daily', {
      params: date ? { date } : {},
    });
    return data;
  },

  getRangeStats: async (days = 7, endDate) => {
    const { data } = await api.get('/food/stats/range', {
      params: { days, ...(endDate ? { endDate } : {}) },
    });
    return data;
  },

  update: async (id, payload) => {
    const { data } = await api.put(`/food/${id}`, payload);
    return data;
  },

  remove: async (id) => {
    const { data } = await api.delete(`/food/${id}`);
    return data;
  },

  /**
   * Sugerencias de comida.
   *
   * Por defecto las resuelve el backend con su base local: instantáneo y sin
   * gastar tokens. Con `ai: true` se piden ideas nuevas al modelo (y se
   * cachean, así que pedirlas otra vez no vuelve a costar).
   */
  getSuggestions: async ({ date, ai = false, mealType } = {}) => {
    const params = {};
    if (date) params.date = date;
    if (ai) params.ai = 'true';
    if (mealType) params.mealType = mealType;

    const { data } = await api.get('/food/suggestions', { params });
    return data;
  },
};

export default api;

/**
 * Agua y recordatorios.
 *
 * Los recordatorios son opcionales: el backend decide si los ofrece según tenga
 * o no claves VAPID configuradas.
 */
export const waterApi = {
  /** Agua bebida en el día (el backend decide cuál es "hoy"). */
  get: async () => {
    const { data } = await api.get('/water');
    return data;
  },

  add: async (amountMl) => {
    const { data } = await api.post('/water', { amountMl });
    return data;
  },

  remove: async (id) => {
    const { data } = await api.delete(`/water/${id}`);
    return data;
  },

  getReminders: async () => {
    const { data } = await api.get('/water/reminders');
    return data;
  },

  saveReminders: async ({ enabled, times }) => {
    const { data } = await api.put('/water/reminders', { enabled, times });
    return data;
  },

  /** Registra este dispositivo para recibir avisos. */
  subscribePush: async (subscription) => {
    const { data } = await api.post('/water/push', { subscription });
    return data;
  },

  /** Da de baja este dispositivo. */
  unsubscribePush: async (endpoint) => {
    // En DELETE el cuerpo va dentro de `data` en axios.
    const { data } = await api.delete('/water/push', { data: { endpoint } });
    return data;
  },

  testPush: async () => {
    const { data } = await api.post('/water/push/test');
    return data;
  },
};
