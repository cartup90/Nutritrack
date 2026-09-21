import { AlertTriangle, Info, Check } from 'lucide-react';
import { getIntensities, getIntensity } from '../utils/nutrition';

/**
 * Selector de intensidad del objetivo.
 *
 * El aviso del nivel elegido se muestra SIEMPRE, no solo al pasar el ratón:
 * en el móvil no hay hover, y el usuario debe saber a qué se compromete.
 */
const IntensityPicker = ({ goal, value, onChange }) => {
  const opciones = getIntensities(goal);
  const seleccionada = getIntensity(goal, value);

  // `maintain` solo tiene un nivel: no tiene sentido mostrar un selector
  if (opciones.length <= 1) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">Intensidad</span>
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-xs text-gray-600">
            Mantener peso no tiene niveles: comes aproximadamente lo que gastas.
          </p>
        </div>
      </div>
    );
  }

  const esDeficit = goal === 'lose_weight';
  const signo = esDeficit ? '−' : '+';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">
        Intensidad del objetivo
      </span>

      <div className="grid grid-cols-3 gap-2">
        {opciones.map((o) => {
          const activa = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-[11px] font-medium transition ${
                activa
                  ? o.tone === 'warn'
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              <span className="font-semibold">{o.label}</span>
              <span className="text-[10px] opacity-80">
                {signo}
                {o.percent}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Aviso del nivel elegido, siempre visible */}
      {seleccionada && (
        <div
          className={`rounded-xl px-3 py-2.5 flex gap-2 ${
            seleccionada.tone === 'warn'
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-primary-50 border border-primary-100'
          }`}
        >
          {seleccionada.tone === 'warn' ? (
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <Info size={15} className="text-primary-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold ${
                seleccionada.tone === 'warn' ? 'text-amber-900' : 'text-primary-900'
              }`}
            >
              {seleccionada.description}
              {seleccionada.rate && seleccionada.rate !== 'estable' && (
                <span className="font-normal opacity-80">
                  {' '}
                  · {seleccionada.rate}
                </span>
              )}
            </p>
            <p
              className={`text-[11px] mt-0.5 leading-relaxed ${
                seleccionada.tone === 'warn' ? 'text-amber-800' : 'text-primary-800'
              }`}
            >
              {seleccionada.warning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntensityPicker;
