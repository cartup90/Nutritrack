import { useState } from 'react';
import { Bell, Droplet, Loader2, Undo2 } from 'lucide-react';

/**
 * Tarjeta de agua del día.
 *
 * Muestra lo bebido frente a la meta y permite anotar de un toque. El registro
 * es un vaso suelto (no un total): así se puede deshacer un error sin tocar el
 * resto, igual que con las comidas.
 */

/** Cantidades rápidas: un vaso, un vaso grande y una botella. */
const OPCIONES = [
  { ml: 200, label: '200 ml', sub: 'vaso' },
  { ml: 250, label: '250 ml', sub: 'vaso grande' },
  { ml: 500, label: '500 ml', sub: 'botella' },
];

const WaterCard = ({ data, onAdd, onRemove, onOpenSettings, showReminderHint }) => {
  const [ocupado, setOcupado] = useState(null);

  const total = Number(data?.totalMl) || 0;
  const goal = Number(data?.goalMl) || 2000;
  const pct = goal > 0 ? Math.min(Math.round((total / goal) * 100), 100) : 0;
  const cumplido = total >= goal;
  const logs = Array.isArray(data?.logs) ? data.logs : [];

  const agregar = async (ml) => {
    setOcupado(ml);
    try {
      await onAdd(ml);
    } finally {
      setOcupado(null);
    }
  };

  const deshacer = async () => {
    if (!logs.length) return;
    setOcupado('undo');
    try {
      // Se deshace el último vaso anotado, que es el primero de la lista
      // porque vienen ordenados del más reciente al más antiguo.
      await onRemove(logs[0].id);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          <Droplet size={16} className="text-sky-500" />
          Agua
        </h2>
        <button
          onClick={onOpenSettings}
          className="text-gray-400 p-1 flex items-center gap-1 text-xs"
          aria-label="Recordatorios de agua"
        >
          <Bell size={15} />
          Recordatorios
        </button>
      </div>

      {/* Progreso */}
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-gray-900">
          {total}
          <span className="text-sm font-normal text-gray-400"> ml</span>
        </span>
        <span className="text-xs text-gray-500">meta {goal} ml</span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            backgroundColor: cumplido ? '#0ea5e9' : '#38bdf8',
          }}
        />
      </div>

      <p className="-mt-2 text-xs text-gray-500">
        {cumplido ? (
          <span className="font-semibold text-sky-600">
            ¡Meta de agua cumplida! 💧
          </span>
        ) : (
          <>
            Te faltan{' '}
            <span className="font-semibold text-gray-700">{goal - total} ml</span>
          </>
        )}
      </p>

      {/* Registro rápido */}
      <div className="grid grid-cols-3 gap-2">
        {OPCIONES.map((op) => (
          <button
            key={op.ml}
            onClick={() => agregar(op.ml)}
            disabled={ocupado !== null}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-sky-100 bg-sky-50 py-2.5 text-sky-700 active:scale-95 transition disabled:opacity-50"
          >
            {ocupado === op.ml ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <span className="text-sm font-semibold">+{op.label}</span>
            )}
            <span className="text-[10px] text-sky-500">{op.sub}</span>
          </button>
        ))}
      </div>

      {/* Deshacer el último vaso */}
      {logs.length > 0 && (
        <button
          onClick={deshacer}
          disabled={ocupado !== null}
          className="flex items-center justify-center gap-1.5 text-xs text-gray-400 py-1 disabled:opacity-50"
        >
          {ocupado === 'undo' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Undo2 size={13} />
          )}
          Deshacer el último ({logs[0]?.amount_ml} ml)
        </button>
      )}

      {/* Solo aparece si tiene recordatorios activos pero el navegador ya no
          tiene la suscripción viva: es el caso en que nunca le llegarían. */}
      {showReminderHint && (
        <button
          onClick={onOpenSettings}
          className="text-left text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2"
        >
          Tus recordatorios están activos pero este dispositivo ya no está
          suscrito. Toca aquí para reactivarlos.
        </button>
      )}
    </section>
  );
};

export default WaterCard;
