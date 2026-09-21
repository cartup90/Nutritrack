import { WifiOff } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

const OfflineBanner = () => {
  const isOffline = useUIStore((s) => s.isOffline);
  if (!isOffline) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-100 text-amber-800 text-xs px-4 py-2">
      <WifiOff size={14} />
      <span>Sin conexión — mostrando datos guardados localmente</span>
    </div>
  );
};

export default OfflineBanner;
