import { useUIStore } from '../store/uiStore';

const typeStyles = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-gray-800',
  warning: 'bg-amber-500',
};

const Toasts = () => {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[200] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          className={`${typeStyles[toast.type] || typeStyles.info} text-white text-sm px-4 py-3 rounded-lg shadow-lg max-w-md w-full text-left pointer-events-auto`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
};

export default Toasts;
