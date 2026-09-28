import {
  DAILY_REFERENCES,
  DISH_REFERENCES,
  hasMicroData,
  microLevel,
  qualityScore,
  unit,
} from '../utils/quality';
import { round } from '../utils/nutrition';

const TONE = {
  good: { text: 'text-green-700', bg: 'bg-green-100', bar: 'bg-green-500' },
  warn: { text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500' },
  bad: { text: 'text-red-700', bg: 'bg-red-100', bar: 'bg-red-500' },
};

const MICROS = [
  { type: 'fiber', label: 'Fibra' },
  { type: 'sugars', label: 'Azúcares' },
  { type: 'sodium', label: 'Sodio' },
];

/**
 * Indicador visual de micronutrientes y calidad del plato/día.
 *
 * @param {object} props
 * @param {number} [props.fiber]  gramos
 * @param {number} [props.sugars] gramos
 * @param {number} [props.sodium] miligramos
 * @param {'dish'|'day'} [props.scope] referencias por plato o por día
 */
const QualityCard = ({ fiber = 0, sugars = 0, sodium = 0, scope = 'dish' }) => {
  if (!hasMicroData({ fiber, sugars, sodium })) {
    return (
      <section className="card p-4 flex flex-col gap-1.5">
        <h2 className="font-semibold text-gray-800 text-sm">
          Calidad nutricional
        </h2>
        <p className="text-xs text-gray-500">
          Sin datos de micronutrientes todavía. Se estiman al analizar una foto.
        </p>
      </section>
    );
  }

  const { score, label, tone, hint } = qualityScore(
    { fiber, sugars, sodium },
    scope
  );
  const refs = scope === 'day' ? DAILY_REFERENCES : DISH_REFERENCES;
  const toneClass = TONE[tone];
  const values = { fiber, sugars, sodium };
  const title = scope === 'day' ? 'Calidad de tu día' : 'Calidad del plato';

  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${toneClass.bg} ${toneClass.text}`}
        >
          {score} · {label}
        </span>
      </div>

      {/* Barra de puntuación */}
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${toneClass.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-500">{hint}</p>

      {/* Micronutrientes */}
      <div className="flex flex-col gap-2.5 mt-1">
        {MICROS.map(({ type, label: name }) => {
          const v = Number(values[type]) || 0;
          const lvl = microLevel(v, type, scope);
          const pct = Math.min((lvl.ratio || 0) * 100, 100);
          const c = TONE[lvl.tone];

          return (
            <div key={type}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{name}</span>
                <span className="text-gray-500">
                  {round(v, type === 'sodium' ? 0 : 1)} {unit(type)}
                  <span className={`ml-1.5 font-semibold ${c.text}`}>
                    {lvl.label}
                  </span>
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full ${c.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 leading-relaxed">
        Referencia orientativa{scope === 'day' ? ' diaria' : ''}: fibra ≈{' '}
        {refs.fiber} g, azúcares &lt; {refs.sugars} g, sodio &lt; {refs.sodium} mg.
        No es un consejo médico.
      </p>
    </section>
  );
};

export default QualityCard;
