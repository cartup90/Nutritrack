import { Sparkles } from 'lucide-react';

/**
 * Aviso de versión nueva.
 *
 * Aparece cuando el service worker ha detectado una actualización y está
 * esperando. El usuario decide cuándo aplicarla, así no se le recarga la
 * pantalla mientras está registrando una comida.
 */
const UpdatePrompt = ({ visible, onUpdate, onDismiss }) => {
  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 text-white rounded-xl shadow-lg p-4 flex items-center gap-3 safe-area-bottom">
      <Sparkles size={18} className="text-primary-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Hay una versión nueva</p>
        <p className="text-xs text-gray-300 truncate">
          Actualiza para ver las últimas mejoras
        </p>
      </div>
      <button
        onClick={onUpdate}
        className="text-sm font-semibold px-3 py-2 rounded-lg bg-primary-600 text-white shrink-0"
      >
        Actualizar
      </button>
      <button
        onClick={onDismiss}
        aria-label="Más tarde"
        className="text-gray-400 hover:text-gray-200 text-lg px-1 shrink-0"
      >
        ×
      </button>
    </div>
  );
};

export default UpdatePrompt;
