import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, CalendarDays, Target, Flame } from 'lucide-react';
import { foodApi, getErrorMessage } from '../services/api';
import { useUIStore } from '../store/uiStore';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import EmptyState from '../components/EmptyState';
import { MACRO_COLORS, formatShortDate, round } from '../utils/nutrition';

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
  { days: 30, label: '30 días' },
];

const History = () => {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, list] = await Promise.all([
        foodApi.getRangeStats(days),
        foodApi.getAllEntries(),
      ]);
      setData(stats);
      setEntries(list.entries || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [days, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = (data?.series || []).map((d) => ({
    ...d,
    label: formatShortDate(d.date + 'T12:00:00'),
  }));

  const goal = data?.goals?.calorieGoal || 0;

  const StatCard = ({ icon: Icon, label, value, sub, color }) => (
    <div className="card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5" style={{ color }}>
        <Icon size={14} />
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );

  return (
    <div className="screen">
      <OfflineBanner />

      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Historial</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Tu progreso nutricional en el tiempo
        </p>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {/* Selector de rango */}
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                days === r.days
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : !data || data.daysLogged === 0 ? (
          <div className="card">
            <EmptyState
              icon="📊"
              title="Todavía no hay datos suficientes"
              description="Registra tus comidas durante unos días para ver tus tendencias."
              action={
                <button
                  onClick={() => navigate('/food')}
                  className="btn btn-primary text-sm"
                >
                  Registrar una comida
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Métricas resumen */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Flame}
                label="Promedio diario"
                value={`${data.averages.calories} kcal`}
                sub={goal ? `Objetivo: ${goal} kcal` : undefined}
                color="#f97316"
              />
              <StatCard
                icon={CalendarDays}
                label="Días registrados"
                value={`${data.daysLogged}`}
                sub={`de ${data.range.days} días`}
                color="#3b82f6"
              />
              <StatCard
                icon={Target}
                label="Días en objetivo"
                value={`${data.daysOnTarget}`}
                sub={
                  data.daysLogged
                    ? `${Math.round((data.daysOnTarget / data.daysLogged) * 100)}% de los registrados`
                    : undefined
                }
                color="#16a34a"
              />
              <StatCard
                icon={TrendingUp}
                label="Prom. proteína"
                value={`${data.averages.protein} g`}
                sub={
                  data.goals ? `Objetivo: ${data.goals.proteinGoal} g` : undefined
                }
                color={MACRO_COLORS.protein}
              />
            </div>

            {/* Gráfico de calorías */}
            <section className="card p-4">
              <h2 className="font-semibold text-gray-800 text-sm mb-3">
                Calorías por día
              </h2>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [`${round(v)} kcal`, 'Consumido']}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    {goal > 0 && (
                      <ReferenceLine
                        y={goal}
                        stroke="#16a34a"
                        strokeDasharray="4 4"
                        label={{ value: 'Objetivo', fontSize: 10, fill: '#16a34a', position: 'insideTopRight' }}
                      />
                    )}
                    <Bar
                      dataKey="calories"
                      fill="#16a34a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Gráfico de macros */}
            <section className="card p-4">
              <h2 className="font-semibold text-gray-800 text-sm mb-3">
                Macronutrientes por día (g)
              </h2>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v, name) => [`${round(v)} g`, name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="protein" name="Proteínas" stackId="a" fill={MACRO_COLORS.protein} maxBarSize={28} />
                    <Bar dataKey="carbs" name="Carbohidratos" stackId="a" fill={MACRO_COLORS.carbs} maxBarSize={28} />
                    <Bar dataKey="fats" name="Grasas" stackId="a" fill={MACRO_COLORS.fats} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {[
                  { k: 'Proteínas', c: MACRO_COLORS.protein },
                  { k: 'Carbohidratos', c: MACRO_COLORS.carbs },
                  { k: 'Grasas', c: MACRO_COLORS.fats },
                ].map((l) => (
                  <span key={l.k} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.c }} />
                    {l.k}
                  </span>
                ))}
              </div>
            </section>

            {/* Listado completo */}
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-gray-800 text-sm px-1">
                Todos los registros ({entries.length})
              </h2>
              {entries.slice(0, 50).map((entry) => (
                <div key={entry.id} className="card p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {entry.image_url ? (
                      <img src={entry.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-lg">🍽️</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">
                      {new Date(entry.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                      {round(entry.calories)} kcal
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      P {round(entry.protein)}g · C {round(entry.carbs)}g · G {round(entry.fats)}g
                    </p>
                  </div>
                </div>
              ))}
              {entries.length > 50 && (
                <p className="text-center text-xs text-gray-400 py-2">
                  Mostrando los 50 registros más recientes
                </p>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default History;
