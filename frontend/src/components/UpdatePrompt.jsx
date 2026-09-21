import { Sparkles } from 'lucide-react';

/**
 * Aviso de versión nueva.
 *
 * Normalmente la app se actualiza sola y este aviso no aparece. Solo se muestra
 * si la actualización llega mientras el usuario está registrando una comida:
 * en ese caso NO se le recarga la pantalla, porque perdería la foto y el
 * análisis en curso. Se le avisa y decide cuándo aplicarla.
 */
const UpdatePrompt = ({ visible, onUpdate, onDismiss }) => {
  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 text-white rounded-xl shadow-lg p-4 flex items-center gap-3 safe-area-bottom">
      <Sparkles size={18} className="text-primary-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Hay una versión nueva</p>
        <p className="text-xs text-gray-300">
          Termina lo que estás haciendo y actualiza
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
