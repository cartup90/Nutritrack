import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { getErrorMessage } from '../services/api';

const TOKEN_KEY = 'nutritrack-token';

const storeToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
  }
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      goals: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      /** Restaura la sesión desde el token persistido. */
      initialize: async () => {
        const { token } = get();

        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        storeToken(token);

        try {
          const { data } = await api.get('/profile');
          set({
            user: data.user,
            goals: data.goals,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch {
          // Token inválido o expirado
          storeToken(null);
          set({
            user: null,
            token: null,
            goals: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      register: async (userData) => {
        set({ error: null });
        try {
          const { data } = await api.post('/auth/register', userData);
          storeToken(data.token);
          set({
            user: data.user,
            token: data.token,
            goals: data.goals,
            isAuthenticated: true,
            error: null,
          });
          return { success: true };
        } catch (error) {
          const message = getErrorMessage(error);
          set({ error: message });
          return { success: false, error: message };
        }
      },

      login: async (email, password) => {
        set({ error: null });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          storeToken(data.token);
          set({
            user: data.user,
            token: data.token,
            goals: data.goals,
            isAuthenticated: true,
            error: null,
          });
          return { success: true };
        } catch (error) {
          const message = getErrorMessage(error);
          set({ error: message });
          return { success: false, error: message };
        }
      },

      updateProfile: async (userData) => {
        set({ error: null });
        try {
          const { data } = await api.put('/profile', userData);
          set({ user: data.user, goals: data.goals, error: null });
          return { success: true, goals: data.goals };
        } catch (error) {
          const message = getErrorMessage(error);
          set({ error: message });
          return { success: false, error: message };
        }
      },

      logout: () => {
        storeToken(null);
        set({
          user: null,
          token: null,
          goals: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'nutritrack-auth',
      partialize: (state) => ({ token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) storeToken(state.token);
      },
    }
  )
);
