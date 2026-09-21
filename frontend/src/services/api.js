import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 90000, // el análisis con IA puede tardar
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutritrack-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
  analyze: async (imageFile, onUploadProgress) => {
    const formData = new FormData();
    formData.append('image', imageFile);

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

  getSuggestions: async (date) => {
    const { data } = await api.get('/food/suggestions', {
      params: date ? { date } : {},
    });
    return data;
  },
};

export default api;
