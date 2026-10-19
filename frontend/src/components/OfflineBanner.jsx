import { CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useOfflineStore } from '../store/offlineStore';

/**
 * Aviso de conexión y de comidas pendientes de sincronizar.
 *
 * Aparece en dos casos:
 *   · sin conexión (aunque no haya nada pendiente), y
 *   · con conexión pero con comidas guardadas en el teléfono.
 */
const OfflineBanner = () => {
  const isOffline = useUIStore((s) => s.isOffline);
  const pending = useOfflineStore((s) => s.pending);
  const syncing = useOfflineStore((s) => s.syncing);
  const sincronizar = useOfflineStore((s) => s.sincronizar);

  const pendientes = pending.length;

  if (!isOffline && pendientes === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 text-xs px-4 py-2 ${
        isOffline ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-800'
      }`}
    >
      {isOffline ? <WifiOff size={14} /> : <CloudOff size={14} />}

      <span className="flex-1">
        {isOffline ? 'Sin conexión' : 'Sin sincronizar'}
        {pendientes > 0 && (
          <>
            {' · '}
            {pendientes} {pendientes === 1 ? 'comida guardada' : 'comidas guardadas'} en el
            teléfono
          </>
        )}
        {isOffline && pendientes === 0 && ' — mostrando datos guardados'}
        {!isOffline && ' — se envían al recuperar la señal'}
      </span>

      {pendientes > 0 && !isOffline && (
        <button
          onClick={() => sincronizar()}
          disabled={syncing}
          className="flex items-center gap-1 font-semibold underline shrink-0"
        >
          {syncing ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <RefreshCw size={12} /> Sincronizar
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default OfflineBanner;
