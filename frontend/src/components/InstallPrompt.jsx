import { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * Banner propio para instalar la PWA usando beforeinstallprompt.
 * Se captura el evento a nivel global (ver main.jsx / InstallPrompt).
 */
const InstallPrompt = () => {
  const { deferredPrompt, installApp, dismissInstallBanner } = useUIStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // No mostrar si ya está instalada (standalone) o sin prompt disponible
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (deferredPrompt && !isStandalone) {
      setVisible(true);
    }
  }, [deferredPrompt]);

  if (!visible || !deferredPrompt) return null;

  const handleInstall = async () => {
    await installApp();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissInstallBanner();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-white rounded-xl shadow-lg border border-gray-100 p-4 flex items-center gap-3 safe-area-bottom">
      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center text-xl shrink-0">
        📲
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">
          Instalar NutriTrack
        </p>
        <p className="text-xs text-gray-500 truncate">
          Añádela a tu pantalla de inicio
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="btn btn-primary text-sm px-3 py-2 shrink-0"
      >
        Instalar
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        className="text-gray-400 hover:text-gray-600 text-lg px-1 shrink-0"
      >
        ×
      </button>
    </div>
  );
};

export default InstallPrompt;
