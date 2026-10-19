import { NavLink } from 'react-router-dom';
import { CalendarRange, Scale } from 'lucide-react';

/**
 * Pestañas de la pantalla «Progreso».
 *
 * Van en dos rutas (y no en estado local) para que el botón "atrás" del móvil
 * y los enlaces desde Inicio funcionen como se espera.
 */
const tabs = [
  { to: '/progress', label: 'Calorías', icon: CalendarRange, end: true },
  { to: '/progress/body', label: 'Cuerpo', icon: Scale },
];

const ProgressTabs = () => (
  <div className="flex gap-2">
    {tabs.map(({ to, label, icon: Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
            isActive
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200'
          }`
        }
      >
        <Icon size={15} />
        {label}
      </NavLink>
    ))}
  </div>
);

export default ProgressTabs;
