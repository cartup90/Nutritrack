import { percent } from '../utils/nutrition';

/**
 * Barra de progreso de macronutriente.
 */
const MacroBar = ({ label, consumed = 0, goal = 0, unit = 'g', color = '#16a34a' }) => {
  const pct = percent(consumed, goal);
  const capped = Math.min(pct, 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500 text-xs">
          <span className="font-semibold text-gray-800">
            {Math.round(consumed)}
          </span>
          {' / '}
          {Math.round(goal)} {unit}
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${capped}%`,
            backgroundColor: pct > 105 ? '#ef4444' : color,
          }}
        />
      </div>
    </div>
  );
};

export default MacroBar;
