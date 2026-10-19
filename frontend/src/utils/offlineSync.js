/**
 * Sincronización de la cola offline desde la app.
 *
 * El service worker hace lo mismo en segundo plano (`public/sw.js`), pero acá
 * se hace desde la página por dos razones:
 *   · Es el único lugar donde el token está accesible de forma segura.
 *   · Los navegadores sin Background Sync (Safari, Firefox) igual quedan
 *     cubiertos: la sincronización ocurre al abrir la app o al volver la señal.
 *
 * Duplicar la petición no es un problema: cada comida lleva un `clientId` y el
 * backend devuelve el registro existente en vez de crear otro (idempotencia).
 */
import { foodApi } from '../services/api';
import { borrarDeCola, listarCola, marcarError } from './offlineDb';

/** ¿El error del servidor es un rechazo definitivo (no reintentar)? */
const esRechazoDefinitivo = (status) =>
  Boolean(status) && status >= 400 && status < 500 && status !== 401 && status !== 429;

/**
 * Manda las comidas pendientes del usuario actual.
 *
 * @param {string} userId - solo se sincroniza lo que encoló este usuario
 * @returns {Promise<{sincronizados:number, pendientes:number, errores:string[]}>}
 */
export const sincronizarCola = async (userId) => {
  const items = await listarCola();

  // Solo lo de este usuario: si alguien cerró sesión y entró otra persona, sus
  // comidas no se pueden guardar en la cuenta equivocada.
  const propios = items.filter((item) => !userId || item.userId === userId);
  const conError = propios.filter((item) => item.error);
  const pendientesDeEnvio = propios.filter((item) => !item.error);

  let sincronizados = 0;
  const errores = [];

  for (const item of pendientesDeEnvio) {
    try {
      await foodApi.createManual({ ...item.payload, clientId: item.id });
      await borrarDeCola(item.id);
      sincronizados += 1;
    } catch (err) {
      const status = err?.response?.status;

      if (esRechazoDefinitivo(status)) {
        // El servidor no lo va a aceptar nunca: se deja marcado para que el
        // usuario lo vea y decida, en vez de reintentar para siempre.
        const detalle = err.response?.data?.error || 'No se pudo guardar';
        await marcarError(item.id, detalle);
        errores.push(detalle);
        continue;
      }

      // Sin red, sesión vencida o servidor caído: se reintenta más tarde.
      break;
    }
  }

  const restantes = (await listarCola()).length;

  return {
    sincronizados,
    pendientes: restantes,
    errores,
    // Cuántos quedaron sin intentar por un problema de red (para no borrar el aviso)
    bloqueados: pendientesDeEnvio.length - sincronizados - errores.length,
    conError: conError.length,
  };
};
