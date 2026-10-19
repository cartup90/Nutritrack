import { create } from 'zustand';
import {
  borrarAuth,
  borrarDeCola,
  encolarComida,
  guardarAuth,
  listarCola,
} from '../utils/offlineDb';
import { sincronizarCola } from '../utils/offlineSync';
import { useAuthStore } from './authStore';

/**
 * Estado de la cola offline.
 *
 * Las comidas se guardan en IndexedDB (`utils/offlineDb.js`) y se mandan al
 * servidor cuando vuelve la señal. Acá se expone lo que la interfaz necesita:
 * la lista de pendientes, si está sincronizando y cuándo fue el último intento.
 */

/** Id único para la comida pendiente (es también la clave de idempotencia). */
const nuevoId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `off-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const zonaHoraria = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/**
 * Pide al navegador que sincronice incluso con la app cerrada (Background Sync).
 * Si no hay soporte no pasa nada: la app sincroniza al abrirse o al volver la
 * señal, que es el camino que usan Safari y Firefox.
 */
const pedirSyncEnSegundoPlano = async () => {
  try {
    if (!('serviceWorker' in navigator)) return;

    const reg = await navigator.serviceWorker.ready;

    if (reg.sync) {
      await reg.sync.register('nutritrack-food-sync');
    } else {
      reg.active?.postMessage({ type: 'SYNC_NOW' });
    }
  } catch {
    // Sin soporte o sin permiso: no es un error para el usuario.
  }
};

export const useOfflineStore = create((set, get) => ({
  /** Comidas esperando sincronizarse (todas, de cualquier usuario). */
  pending: [],
  syncing: false,
  lastSyncAt: null,
  syncError: null,

  /** Relee la cola de IndexedDB. */
  cargarPendientes: async () => {
    try {
      set({ pending: await listarCola() });
    } catch {
      // Sin IndexedDB (o en un navegador raro): la app funciona, sin cola.
      set({ pending: [] });
    }
  },

  /**
   * Guarda la comida en el teléfono. Devuelve el ítem encolado.
   * @param {{userId: string, payload: object}} datos
   */
  encolar: async ({ userId, payload }) => {
    const item = {
      id: nuevoId(),
      userId,
      createdAt: new Date().toISOString(),
      payload,
      error: null,
    };

    await encolarComida(item);

    // El service worker no ve localStorage: se le deja el token junto a la cola
    // (y se borra cuando no queda nada pendiente).
    await guardarAuth({
      token: localStorage.getItem('nutritrack-token'),
      userId,
      timezone: zonaHoraria(),
    });

    set({ pending: await listarCola() });

    // Intentar ya mismo y, además, pedir al navegador que reintente por su
    // cuenta: si esta primera pasada falla (red inestable), el reintento en
    // segundo plano no depende de que la app siga abierta.
    if (typeof navigator === 'undefined' || navigator.onLine) {
      get().sincronizar();
    }
    pedirSyncEnSegundoPlano();

    return item;
  },

  /** Descarta una comida que no se va a mandar nunca. */
  descartar: async (id) => {
    try {
      await borrarDeCola(id);
    } finally {
      set({ pending: await listarCola().catch(() => []) });
    }
  },

  /**
   * Manda las comidas pendientes del usuario actual.
   * @returns {Promise<object|null>} resumen, o null si no había nada que hacer
   */
  sincronizar: async () => {
    if (get().syncing) return null;

    const userId = useAuthStore.getState().user?.id;
    if (!userId) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

    set({ syncing: true, syncError: null });

    try {
      const resumen = await sincronizarCola(userId);
      const pending = await listarCola();

      // Sin pendientes, el service worker ya no necesita el token guardado.
      if (!pending.length) await borrarAuth();

      set({
        pending,
        syncing: false,
        // Solo se marca cuando de verdad se mandó algo: si no, la pantalla de
        // Inicio recargaría los datos cada minuto sin motivo.
        ...(resumen?.sincronizados > 0
          ? { lastSyncAt: new Date().toISOString() }
          : {}),
      });

      return resumen;
    } catch (err) {
      set({ syncing: false, syncError: String(err?.message || err) });
      return null;
    }
  },
}));
