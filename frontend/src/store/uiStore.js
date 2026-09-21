import { create } from 'zustand';

export const useUIStore = create((set, get) => ({
  // Estado de instalación PWA
  deferredPrompt: null,
  showInstallBanner: false,
  isInstalled: false,

  // Estado offline
  isOnline: navigator.onLine,
  isOffline: !navigator.onLine,

  // Toasts
  toasts: [],

  // Capturar evento beforeinstallprompt
  setDeferredPrompt: (prompt) => {
    set({ deferredPrompt: prompt, showInstallBanner: true });
  },

  // Mostrar prompt de instalación
  showInstallPrompt: () => {
    const { deferredPrompt, isInstalled } = get();
    if (deferredPrompt && !isInstalled) {
      set({ showInstallBanner: true });
    }
  },

  // Instalar la PWA
  installApp: async () => {
    const { deferredPrompt } = get();
    if (!deferredPrompt) return { success: false };

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        set({
          showInstallBanner: false,
          isInstalled: true,
          deferredPrompt: null,
        });
        return { success: true };
      }

      set({ showInstallBanner: false });
      return { success: false, reason: 'dismissed' };
    } catch (error) {
      console.error('Error instalando PWA:', error);
      return { success: false, reason: 'error' };
    }
  },

  // Ocultar banner de instalación
  dismissInstallBanner: () => set({ showInstallBanner: false }),

  // Marcar como instalada
  setInstalled: (value) => set({ isInstalled: value }),

  // Estado de red
  setOnline: (value) =>
    set({ isOnline: value, isOffline: !value }),

  // Toasts
  addToast: (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);

    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
