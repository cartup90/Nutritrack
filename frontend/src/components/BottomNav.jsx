import { NavLink } from 'react-router-dom';
import { Home, History, Sparkles, User } from 'lucide-react';

const items = [
  { to: '/', label: 'Hoy', icon: Home, end: true },
  { to: '/history', label: 'Historial', icon: History },
  { to: '/recommendations', label: 'Ideas', icon: Sparkles },
  { to: '/profile', label: 'Perfil', icon: User },
];

const BottomNav = () => {
  return (
    <nav className="bottom-nav safe-area-bottom">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? 'active' : 'text-gray-400'}`
          }
        >
          <Icon size={22} strokeWidth={2} />
          <span className="text-[11px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNav;
