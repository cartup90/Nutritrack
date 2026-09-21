import { percent, progressColor } from '../utils/nutrition';

/**
 * Anillo de progreso SVG para calorías.
 */
const ProgressRing = ({
  value = 0,
  target = 2000,
  size = 180,
  strokeWidth = 14,
  label = 'kcal',
}) => {
  const pct = percent(value, target);
  const capped = Math.min(pct, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (capped / 100) * circumference;
  const color = progressColor(pct);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">
          {Math.round(value)}
        </span>
        <span className="text-xs text-gray-500">
          de {Math.round(target)} {label}
        </span>
        <span className="text-xs font-semibold mt-1" style={{ color }}>
          {pct}%
        </span>
      </div>
    </div>
  );
};

export default ProgressRing;
