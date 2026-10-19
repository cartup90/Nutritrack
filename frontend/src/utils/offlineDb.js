/**
 * Cola de comidas registradas sin conexión (IndexedDB).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ INDEXEDDB Y NO localStorage
 * ---------------------------------------------------------------------------
 * localStorage es síncrono, tiene un límite chico y no lo ve el service worker.
 * IndexedDB permite guardar la cola desde la app y leerla desde el service
 * worker para sincronizar en segundo plano, aunque la app esté cerrada.
 *
 * ---------------------------------------------------------------------------
 * OJO: ESTA BASE LA COMPARTE EL SERVICE WORKER
 * ---------------------------------------------------------------------------
 * `frontend/public/sw.js` abre esta misma base con los mismos nombres de
 * almacén. Si se cambia algo acá, hay que cambiarlo también allá.
 *
 * Estructura:
 *   · `foodQueue` (keyPath 'id'): comidas pendientes de mandar al servidor.
 *       { id, userId, createdAt, payload, error }
 *   · `meta` (keyPath 'key'): credencial para que el service worker pueda
 *     sincronizar. Solo existe mientras hay algo pendiente.
 *       { key: 'auth', token, userId, timezone }
 */

export const DB_NAME = 'nutritrack-offline';
export const DB_VERSION = 1;
export const QUEUE_STORE = 'foodQueue';
export const META_STORE = 'meta';
export const AUTH_KEY = 'auth';

/** Abre la base (y crea los almacenes la primera vez). */
const abrir = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no soporta el guardado local'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir la base local'));
  });

/** Promesa de una petición de IndexedDB. */
const pedir = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Espera a que la transacción termine (para no cerrar la base antes). */
const esperarTx = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/**
 * Comidas pendientes, de la más vieja a la más nueva (orden de envío).
 * @returns {Promise<Array<object>>}
 */
export const listarCola = async () => {
  const db = await abrir();
  try {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const items = await pedir(tx.objectStore(QUEUE_STORE).getAll());

    return (items || []).sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt))
    );
  } finally {
    db.close();
  }
};

/** Guarda (o reemplaza) una comida pendiente. */
export const encolarComida = async (item) => {
  const db = await abrir();
  try {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(item);
    await esperarTx(tx);
  } finally {
    db.close();
  }
};

/** Borra una comida pendiente (ya se sincronizó o el usuario la descartó). */
export const borrarDeCola = async (id) => {
  const db = await abrir();
  try {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    await esperarTx(tx);
  } finally {
    db.close();
  }
};

/** Marca un intento fallido para que el usuario sepa qué pasó con esa comida. */
export const marcarError = async (id, error) => {
  const db = await abrir();
  try {
    // Lectura y escritura en transacciones separadas: dentro de una misma
    // transacción, esperar una petición y volver a usarla es frágil según el
    // navegador (la transacción puede quedar inactiva).
    const txLectura = db.transaction(QUEUE_STORE, 'readonly');
    const item = await pedir(txLectura.objectStore(QUEUE_STORE).get(id));

    if (!item) return;

    const txEscritura = db.transaction(QUEUE_STORE, 'readwrite');
    txEscritura.objectStore(QUEUE_STORE).put({
      ...item,
      error: String(error || 'No se pudo guardar'),
    });
    await esperarTx(txEscritura);
  } finally {
    db.close();
  }
};

/** Cuenta de pendientes (para el badge, sin traer todo). */
export const contarCola = async () => {
  const db = await abrir();
  try {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    return await pedir(tx.objectStore(QUEUE_STORE).count());
  } finally {
    db.close();
  }
};

// ---------------------------------------------------------------------------
// Credencial para la sincronización en segundo plano
//
// El service worker no puede leer localStorage, así que la app le deja el token
// acá mientras hay comidas pendientes. Se borra cuando la cola queda vacía o al
// cerrar sesión: es la única copia extra que existe, y solo dura lo que la cola.
// ---------------------------------------------------------------------------
export const guardarAuth = async ({ token, userId, timezone }) => {
  if (!token) return;

  const db = await abrir();
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: AUTH_KEY, token, userId, timezone });
    await esperarTx(tx);
  } finally {
    db.close();
  }
};

export const leerAuth = async () => {
  const db = await abrir();
  try {
    const tx = db.transaction(META_STORE, 'readonly');
    return (await pedir(tx.objectStore(META_STORE).get(AUTH_KEY))) || null;
  } finally {
    db.close();
  }
};

export const borrarAuth = async () => {
  const db = await abrir();
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(AUTH_KEY);
    await esperarTx(tx);
  } finally {
    db.close();
  }
};
